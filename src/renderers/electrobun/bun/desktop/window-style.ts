export function desktopTitleBarStyle(): "default" | "hiddenInset" {
  return process.platform === "win32" ? "default" : "hiddenInset";
}
