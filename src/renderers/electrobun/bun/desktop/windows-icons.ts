import { existsSync } from "fs";
import { resolve } from "path";
import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";

const WM_SETICON = 0x0080;
const ICON_SMALL = 0;
const ICON_BIG = 1;
const IMAGE_ICON = 1;
const LR_LOADFROMFILE = 0x0010;
const LR_DEFAULTSIZE = 0x0040;
const GCLP_HICON = -14;
const GCLP_HICONSM = -34;
const MAX_ATTEMPTS = 20;
const RETRY_DELAY_MS = 100;

type Win32 = ReturnType<typeof loadWin32>;

let cachedWin32: Win32 | null | undefined;
let smallIconHandle: Pointer | null = null;
let bigIconHandle: Pointer | null = null;

function loadWin32() {
  return dlopen("user32.dll", {
    FindWindowW: {
      args: [FFIType.ptr, FFIType.ptr],
      returns: FFIType.ptr,
    },
    GetWindowThreadProcessId: {
      args: [FFIType.ptr, FFIType.ptr],
      returns: FFIType.u32,
    },
    LoadImageW: {
      args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.int, FFIType.int, FFIType.u32],
      returns: FFIType.ptr,
    },
    SendMessageW: {
      args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.ptr],
      returns: FFIType.ptr,
    },
    SetClassLongPtrW: {
      args: [FFIType.ptr, FFIType.int, FFIType.ptr],
      returns: FFIType.ptr,
    },
  });
}

function win32OrNull(): Win32 | null {
  if (process.platform !== "win32") return null;
  if (cachedWin32 !== undefined) return cachedWin32;

  try {
    cachedWin32 = loadWin32();
  } catch {
    cachedWin32 = null;
  }
  return cachedWin32;
}

function wideString(value: string): Buffer {
  return Buffer.from(`${value}\0`, "utf16le");
}

function readWindowProcessId(win32: Win32, windowHandle: Pointer): number {
  const processIdBuffer = new Uint32Array(1);
  win32.symbols.GetWindowThreadProcessId(windowHandle, ptr(processIdBuffer));
  return processIdBuffer[0] ?? 0;
}

function findCurrentProcessWindow(win32: Win32, title: string): Pointer | null {
  const titleBuffer = wideString(title);
  const windowHandle = win32.symbols.FindWindowW(null, ptr(titleBuffer));
  if (!windowHandle) return null;
  if (readWindowProcessId(win32, windowHandle) !== process.pid) return null;
  return windowHandle;
}

function loadIconHandle(win32: Win32, iconPath: string, size: number): Pointer | null {
  const iconPathBuffer = wideString(iconPath);
  const iconHandle = win32.symbols.LoadImageW(
    null,
    ptr(iconPathBuffer),
    IMAGE_ICON,
    size,
    size,
    LR_LOADFROMFILE | LR_DEFAULTSIZE,
  );

  return iconHandle || null;
}

function ensureIconHandles(win32: Win32): boolean {
  if (smallIconHandle && bigIconHandle) return true;

  const iconPath = resolve("../Resources/app.ico");
  if (!existsSync(iconPath)) return false;

  smallIconHandle = smallIconHandle ?? loadIconHandle(win32, iconPath, 16);
  bigIconHandle = bigIconHandle ?? loadIconHandle(win32, iconPath, 32);

  return Boolean(smallIconHandle && bigIconHandle);
}

function setWindowIcon(win32: Win32, windowHandle: Pointer): boolean {
  if (!ensureIconHandles(win32) || !smallIconHandle || !bigIconHandle) return false;

  win32.symbols.SendMessageW(windowHandle, WM_SETICON, ICON_SMALL, smallIconHandle);
  win32.symbols.SendMessageW(windowHandle, WM_SETICON, ICON_BIG, bigIconHandle);
  win32.symbols.SetClassLongPtrW(windowHandle, GCLP_HICONSM, smallIconHandle);
  win32.symbols.SetClassLongPtrW(windowHandle, GCLP_HICON, bigIconHandle);
  return true;
}

export function applyWindowsWindowIcon(title: string, attempt = 1): void {
  const win32 = win32OrNull();
  if (!win32) return;

  const windowHandle = findCurrentProcessWindow(win32, title);
  if (windowHandle && setWindowIcon(win32, windowHandle)) return;

  if (attempt < MAX_ATTEMPTS) {
    setTimeout(() => applyWindowsWindowIcon(title, attempt + 1), RETRY_DELAY_MS);
  }
}
