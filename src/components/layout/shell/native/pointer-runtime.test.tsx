import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ShellDragRuntimeState, ShellMouseEvent } from "../drag/runtime";
import { useShellNativePointerRuntime } from "./pointer-runtime";

type NativePointerRuntime = ReturnType<typeof useShellNativePointerRuntime>;

function createMouseDown(): ShellMouseEvent & { defaultPrevented: boolean; propagationStopped: boolean } {
  return {
    type: "down",
    x: 20,
    y: 5,
    button: 0,
    preciseX: 20,
    preciseY: 5,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
}

function renderPointerRuntime(): {
  dragRef: ShellDragRuntimeState["dragRef"];
  runtime: NativePointerRuntime;
} {
  const dragRef = { current: null } as ShellDragRuntimeState["dragRef"];
  const dragRuntime = {
    dragRef,
    updateDividerPreview() {},
    updateDockPreview() {},
    updateDragFloatingRect() {},
  } as unknown as ShellDragRuntimeState;
  let runtime: NativePointerRuntime | undefined;

  function Harness() {
    runtime = useShellNativePointerRuntime({
      appHeaderHeight: 1,
      dragRuntime,
      focusPane() {},
      handleActiveDrag() {},
      handleFloatingClose() {},
      menuState: null,
      nativePaneChrome: true,
      openPaneMenu() {},
      selectWindowModePane() {},
      setHoveredMenuItemId() {},
      setMenuState() {},
      transientFocusActive: false,
      windowMode: null,
    });
    return null;
  }

  renderToStaticMarkup(<Harness />);
  if (!runtime) throw new Error("native pointer runtime was not captured");
  return { dragRef, runtime };
}

describe("useShellNativePointerRuntime", () => {
  test("routes floating and docked header mousedown to move, and border mousedown to resize", () => {
    const { dragRef, runtime } = renderPointerRuntime();
    const floatingRect = { x: 8, y: 2, width: 32, height: 10 };
    const dockedRect = { x: 0, y: 0, width: 40, height: 17 };

    const floatingHeaderDown = createMouseDown();
    runtime.startNativeFloatingDrag("floating:main", floatingRect, floatingHeaderDown);
    expect(dragRef.current).toEqual(expect.objectContaining({
      type: "pane-drag",
      paneId: "floating:main",
      mode: "floating",
    }));
    expect(floatingHeaderDown.defaultPrevented).toBe(true);
    expect(floatingHeaderDown.propagationStopped).toBe(false);

    const dockedHeaderDown = createMouseDown();
    runtime.startNativeDockedDrag("docked:main", dockedRect, dockedHeaderDown);
    expect(dragRef.current).toEqual(expect.objectContaining({
      type: "pane-drag",
      paneId: "docked:main",
      mode: "docked",
    }));
    expect(dockedHeaderDown.defaultPrevented).toBe(true);
    expect(dockedHeaderDown.propagationStopped).toBe(false);

    for (const corner of ["top-left", "left"] as const) {
      const resizeDown = createMouseDown();
      runtime.startNativeFloatResize("floating:main", floatingRect, corner, resizeDown);
      expect(dragRef.current).toEqual(expect.objectContaining({
        type: "float-resize",
        paneId: "floating:main",
        corner,
      }));
      expect(resizeDown.defaultPrevented).toBe(true);
      expect(resizeDown.propagationStopped).toBe(true);
    }
  });
});
