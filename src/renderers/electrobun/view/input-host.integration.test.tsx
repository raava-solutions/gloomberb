/// <reference lib="dom" />
import { afterEach, describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { useShellWindowMode } from "../../../components/layout/shell/window-mode";
import type { WindowEditState } from "../../../components/layout/window-edit/mode";
import type { PluginRegistry } from "../../../plugins/registry";
import { useShortcut } from "../../../react/input";
import { createPaneInstance, type LayoutConfig } from "../../../types/config";
import { WebInputHostProvider } from "./input-host";

interface TestKeyboardEvent extends KeyboardEvent {
  defaultPrevented: boolean;
  propagationStopped: boolean;
}

class FocusableControl extends EventTarget {
  constructor(
    readonly tagName: "INPUT" | "BUTTON",
    private readonly onFocus: (control: FocusableControl) => void,
  ) {
    super();
  }

  focus(): void {
    this.onFocus(this);
  }
}

class TestWindow {
  readonly innerWidth = 960;
  readonly innerHeight = 720;
  activeElement: FocusableControl | null = null;
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener);
  }

  createControl(tagName: "INPUT" | "BUTTON"): FocusableControl {
    return new FocusableControl(tagName, (control) => {
      this.activeElement = control;
    });
  }

  emitKeyDown(key: string): TestKeyboardEvent {
    if (!this.activeElement) throw new Error("focus a control before emitting a key");
    const event = {
      key,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      target: this.activeElement,
      defaultPrevented: false,
      propagationStopped: false,
      isComposing: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
    } as unknown as TestKeyboardEvent;
    for (const listener of this.listeners.get("keydown") ?? []) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
    return event;
  }
}

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined;
const originalWindow = globalThis.window;

afterEach(async () => {
  if (testSetup) {
    await act(async () => {
      testSetup!.renderer.destroy();
    });
    testSetup = undefined;
  }
  globalThis.window = originalWindow;
});

describe("WebInputHostProvider Window Edit registration", () => {
  test("cycles and commits over editable and native control defaults", async () => {
    const testWindow = new TestWindow();
    globalThis.window = testWindow as unknown as Window & typeof globalThis;
    const layout: LayoutConfig = {
      dockRoot: null,
      instances: [createPaneInstance("test-pane", { instanceId: "float-a" })],
      floating: [{
        instanceId: "float-a",
        x: 20,
        y: 8,
        width: 6,
        height: 3,
        zIndex: 50,
        fixedGeometry: true,
      }],
      detached: [],
    };
    const persistedLayouts: LayoutConfig[] = [];
    let genericShortcutCalls = 0;
    const controls: {
      startWindowMode?: (paneId?: string, mode?: "move" | "resize") => void;
      windowMode?: WindowEditState | null;
    } = {};

    function Harness() {
      const result = useShellWindowMode({
        bounds: { x: 0, y: 0, width: 120, height: 40 },
        cancelActiveDrag() {},
        closePaneMenu() {},
        contentHeight: 40,
        dockGeometryOptions: {},
        focusPane() {},
        focusedPaneId: "float-a",
        hasActiveDrag: () => false,
        nativePaneChrome: true,
        persistLayout(nextLayout) { persistedLayouts.push(nextLayout); },
        pluginRegistry: {
          notify() {},
          openWindowModeFn() {},
          panes: new Map(),
        } as unknown as PluginRegistry,
        visibleLayout: layout,
        width: 120,
      });
      controls.startWindowMode = result.startWindowMode;
      controls.windowMode = result.windowMode;
      useShortcut(() => { genericShortcutCalls += 1; });
      return null;
    }

    testSetup = await testRender(
      <WebInputHostProvider>
        <Harness />
      </WebInputHostProvider>,
      { width: 120, height: 40 },
    );
    await testSetup.renderOnce();

    await act(async () => {
      controls.startWindowMode?.("float-a", "resize");
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });
    expect(controls.windowMode?.focus).toEqual({ kind: "floating-resize", corner: "top-left" });

    const editable = testWindow.createControl("INPUT");
    editable.focus();
    let browserTabDefaults = 0;
    await act(async () => {
      const tab = testWindow.emitKeyDown("Tab");
      if (!tab.defaultPrevented) browserTabDefaults += 1;
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });
    expect(controls.windowMode?.focus).toEqual({ kind: "floating-resize", corner: "top" });

    await act(async () => {
      testWindow.emitKeyDown("ArrowUp");
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });
    expect(controls.windowMode?.previewLayout.floating[0]).toEqual({
      instanceId: "float-a",
      x: 20,
      y: 7,
      width: 6,
      height: 4,
      zIndex: 50,
      fixedGeometry: true,
    });

    const nativeButton = testWindow.createControl("BUTTON");
    nativeButton.focus();
    let nativeButtonDefaults = 0;
    await act(async () => {
      const enter = testWindow.emitKeyDown("Enter");
      if (!enter.defaultPrevented) nativeButtonDefaults += 1;
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });

    expect(persistedLayouts).toEqual([controls.windowMode!.previewLayout]);
    expect(controls.windowMode).toMatchObject({ mode: "move", dirty: false, notice: "Committed" });
    expect({ browserTabDefaults, nativeButtonDefaults, genericShortcutCalls }).toEqual({
      browserTabDefaults: 0,
      nativeButtonDefaults: 0,
      genericShortcutCalls: 0,
    });
  });
});
