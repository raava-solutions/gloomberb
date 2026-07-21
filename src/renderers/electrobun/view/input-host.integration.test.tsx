/// <reference lib="dom" />
import { afterEach, describe, expect, test } from "bun:test";
import { flushSync } from "@opentui/react";
import { testRender } from "@opentui/react/test-utils";
import { act, useReducer, useRef, useState } from "react";
import { useCommandBarKeyboardShortcuts } from "../../../components/command-bar/keyboard-shortcuts";
import type { ListScreenState } from "../../../components/command-bar/list/model";
import type { CommandBarRoute } from "../../../components/command-bar/workflow/types";
import { Shell } from "../../../components/layout/shell";
import { TransientLayoutProvider } from "../../../components/layout/transient-layout";
import { useShellWindowMode } from "../../../components/layout/shell/window-mode";
import type { WindowEditState } from "../../../components/layout/window-edit/mode";
import type { PluginRegistry } from "../../../plugins/registry";
import { useShortcut } from "../../../react/input";
import { AppContext, appReducer, createInitialState, type AppAction } from "../../../state/app/context";
import { TestDialogProvider, testRender as testRenderWithAppProviders } from "../../opentui/test-utils";
import { createDefaultConfig, createPaneInstance, type LayoutConfig } from "../../../types/config";
import { WebInputHostProvider } from "./input-host";

interface TestKeyboardEvent extends KeyboardEvent {
  defaultPrevented: boolean;
  propagationStopped: boolean;
}

class FocusableControl extends EventTarget {
  constructor(
    readonly tagName: "INPUT" | "BUTTON",
    private readonly onFocus: (control: FocusableControl) => void,
    readonly onNativeActivate: () => void = () => {},
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

  createControl(tagName: "INPUT" | "BUTTON", onNativeActivate: () => void = () => {}): FocusableControl {
    return new FocusableControl(tagName, (control) => {
      this.activeElement = control;
    }, onNativeActivate);
  }

  emitKeyDown(key: string, options: { shift?: boolean } = {}): TestKeyboardEvent {
    if (!this.activeElement) throw new Error("focus a control before emitting a key");
    const event = {
      key,
      ctrlKey: false,
      metaKey: false,
      shiftKey: options.shift ?? false,
      altKey: false,
      target: this.activeElement,
      defaultPrevented: false,
      propagationStopped: false,
      isComposing: false,
      preventDefault() {},
      stopPropagation() {},
    } as unknown as TestKeyboardEvent;
    event.preventDefault = () => { event.defaultPrevented = true; };
    event.stopPropagation = () => { event.propagationStopped = true; };
    for (const listener of this.listeners.get("keydown") ?? []) {
      if (typeof listener === "function") listener(event);
      else listener.handleEvent(event);
    }
    return event;
  }
}

const rootListState: ListScreenState = {
  kind: "root",
  title: "Commands",
  query: "LAY",
  selectedIdx: 0,
  hoveredIdx: null,
  results: [{
    id: "layout",
    label: "Layout Actions",
    detail: "",
    category: "Commands",
    kind: "command",
    action() {},
  }],
  searching: false,
  emptyLabel: "No commands",
  emptyDetail: "",
  footerLeft: "",
  footerRight: "",
};

function CommandBarShortcutHarness({
  currentRoute,
  onActivate = () => {},
  onConfirm = () => {},
  onDismiss = () => {},
  onMoveWorkflowFocus = () => {},
  onRootTab = () => false,
}: {
  currentRoute: CommandBarRoute | null;
  onActivate?: () => void;
  onConfirm?: () => void;
  onDismiss?: () => void;
  onMoveWorkflowFocus?: (delta: number) => void;
  onRootTab?: () => boolean;
}) {
  const visibleListStateRef = useRef<ListScreenState | null>(rootListState);
  const workflowNativeSelectRefs = useRef(new Map());
  useCommandBarKeyboardShortcuts({
    acceptRootShortcutTab: onRootTab,
    acceptSelectedShortcutTab: () => false,
    activateListSelection: onActivate,
    commitMultiSelectPicker() {},
    confirmCurrentRoute: onConfirm,
    currentRoute,
    dismissCommandBar: onDismiss,
    getWorkflowFieldStringValue: (_field, value) => typeof value === "string" ? value : "",
    handleMultiSelectMove() {},
    handleMultiSelectToggle() {},
    moveListSelection() {},
    moveWorkflowFocus: onMoveWorkflowFocus,
    nativePaneChrome: true,
    openWorkflowFieldPicker() {},
    popRoute() {},
    rootModeKind: "main",
    setActiveListQuery() {},
    submitWorkflowRoute() {},
    themePickerActive: false,
    themePickerRef: { current: null },
    updateWorkflowValue() {},
    visibleListStateRef,
    workflowNativeSelectRefs,
  });
  return null;
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
        overlayOpen: false,
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

describe("WebInputHostProvider command-bar registration", () => {
  test("routes root completion Tab ahead of focused web Input traversal", async () => {
    const testWindow = new TestWindow();
    globalThis.window = testWindow as unknown as Window & typeof globalThis;
    let completions = 0;

    testSetup = await testRender(
      <WebInputHostProvider>
        <CommandBarShortcutHarness
          currentRoute={null}
          onRootTab={() => {
            completions += 1;
            return true;
          }}
        />
      </WebInputHostProvider>,
      { width: 120, height: 40 },
    );
    await testSetup.renderOnce();

    testWindow.createControl("INPUT").focus();
    const tab = testWindow.emitKeyDown("Tab");

    expect(completions).toBe(1);
    expect(tab.defaultPrevented).toBe(true);
    expect(tab.propagationStopped).toBe(true);
  });

  test("cycles workflow focus with Tab and Shift+Tab from a focused web Input", async () => {
    const testWindow = new TestWindow();
    globalThis.window = testWindow as unknown as Window & typeof globalThis;
    const moves: number[] = [];
    const workflowRoute: CommandBarRoute = {
      kind: "workflow",
      workflowId: "test-workflow",
      title: "Test workflow",
      fields: [{ id: "name", label: "Name", type: "text" }],
      values: { name: "" },
      activeFieldId: "name",
      submitLabel: "Save",
      pending: false,
      error: null,
      payload: { kind: "builtin", actionId: "test" },
    };

    testSetup = await testRender(
      <WebInputHostProvider>
        <CommandBarShortcutHarness
          currentRoute={workflowRoute}
          onMoveWorkflowFocus={(delta) => moves.push(delta)}
        />
      </WebInputHostProvider>,
      { width: 120, height: 40 },
    );
    await testSetup.renderOnce();

    testWindow.createControl("INPUT").focus();
    const tab = testWindow.emitKeyDown("Tab");
    const shiftTab = testWindow.emitKeyDown("Tab", { shift: true });

    expect(moves).toEqual([1, -1]);
    expect([tab, shiftTab].every((event) => event.defaultPrevented && event.propagationStopped)).toBe(true);
  });

  test("leaves confirm and list Back buttons to native focus and activation", async () => {
    const routes: CommandBarRoute[] = [
      {
        kind: "confirm",
        confirmId: "delete-layout",
        title: "Delete layout?",
        body: ["This cannot be undone."],
        confirmLabel: "Delete",
        cancelLabel: "Back",
        tone: "danger",
        onConfirm() {},
        pending: false,
        error: null,
      },
      {
        kind: "picker",
        pickerId: "layout-swap",
        title: "Switch layout",
        query: "",
        selectedIdx: 0,
        hoveredIdx: null,
        options: [{ id: "default", label: "Default" }],
      },
    ];

    for (const currentRoute of routes) {
      const testWindow = new TestWindow();
      globalThis.window = testWindow as unknown as Window & typeof globalThis;
      let selectedRows = 0;
      let confirmations = 0;
      let onBackCalls = 0;

      testSetup = await testRender(
        <WebInputHostProvider>
          <CommandBarShortcutHarness
            currentRoute={currentRoute}
            onActivate={() => { selectedRows += 1; }}
            onConfirm={() => { confirmations += 1; }}
          />
        </WebInputHostProvider>,
        { width: 120, height: 40 },
      );
      await testSetup.renderOnce();

      const commandInput = testWindow.createControl("INPUT");
      const backButton = testWindow.createControl("BUTTON", () => { onBackCalls += 1; });
      commandInput.focus();
      const tab = testWindow.emitKeyDown("Tab");
      if (!tab.defaultPrevented) backButton.focus();

      for (const key of ["Enter", " "]) {
        const activation = testWindow.emitKeyDown(key);
        if (!activation.defaultPrevented) backButton.onNativeActivate();
      }

      expect(testWindow.activeElement).toBe(backButton);
      expect(tab.defaultPrevented).toBe(false);
      expect({ onBackCalls, selectedRows, confirmations }).toEqual({
        onBackCalls: 2,
        selectedRows: 0,
        confirmations: 0,
      });

      await act(async () => {
        testSetup!.renderer.destroy();
      });
      testSetup = undefined;
    }
  });

  test("exits Window Edit before command-bar keys reach the focused web Input", async () => {
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
    let completions = 0;
    let activations = 0;
    let dismissals = 0;
    const controls: {
      openCommandBar?: () => void;
      startWindowMode?: (paneId?: string, mode?: "move" | "resize") => void;
      windowMode?: WindowEditState | null;
      commandBarOpen?: boolean;
    } = {};

    function Harness() {
      const [commandBarOpen, setCommandBarOpen] = useState(false);
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
        overlayOpen: commandBarOpen,
        persistLayout(nextLayout) { persistedLayouts.push(nextLayout); },
        pluginRegistry: {
          notify() {},
          openWindowModeFn() {},
          panes: new Map(),
        } as unknown as PluginRegistry,
        visibleLayout: layout,
        width: 120,
      });
      controls.openCommandBar = () => setCommandBarOpen(true);
      controls.startWindowMode = result.startWindowMode;
      controls.windowMode = result.windowMode;
      controls.commandBarOpen = commandBarOpen;
      return commandBarOpen
        ? (
            <CommandBarShortcutHarness
              currentRoute={null}
              onActivate={() => { activations += 1; }}
              onDismiss={() => {
                dismissals += 1;
                setCommandBarOpen(false);
              }}
              onRootTab={() => {
                completions += 1;
                return true;
              }}
            />
          )
        : null;
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
    testWindow.createControl("INPUT").focus();
    await act(async () => {
      testWindow.emitKeyDown("ArrowUp");
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });
    expect(controls.windowMode?.dirty).toBe(true);

    await act(async () => {
      controls.openCommandBar?.();
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });
    expect(controls.commandBarOpen).toBe(true);
    expect(controls.windowMode).toBeNull();

    const editable = testWindow.createControl("INPUT");
    editable.focus();
    for (const key of ["m", "r", "d", "w", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      testWindow.emitKeyDown(key);
    }
    const tab = testWindow.emitKeyDown("Tab");
    const enter = testWindow.emitKeyDown("Enter");
    await act(async () => {
      testWindow.emitKeyDown("Escape");
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });

    expect({ completions, activations, dismissals }).toEqual({ completions: 1, activations: 1, dismissals: 1 });
    expect(tab.defaultPrevented).toBe(true);
    expect(enter.defaultPrevented).toBe(true);
    expect(controls.commandBarOpen).toBe(false);
    expect(controls.windowMode).toBeNull();
    expect(persistedLayouts).toEqual([]);
  });

  test("uses real Shell command-bar state to cancel Window Edit before passive effects", async () => {
    const testWindow = new TestWindow();
    globalThis.window = testWindow as unknown as Window & typeof globalThis;
    const layout: LayoutConfig = {
      dockRoot: null,
      instances: [createPaneInstance("test-pane", { instanceId: "float-a" })],
      floating: [{
        instanceId: "float-a",
        x: 20,
        y: 8,
        width: 20,
        height: 8,
        zIndex: 50,
        fixedGeometry: true,
      }],
      detached: [],
    };
    const config = {
      ...createDefaultConfig("/tmp/gloomberb-command-bar-shell-test"),
      layout,
      layouts: [{ name: "Default", layout }],
    };
    const initialState = {
      ...createInitialState(config),
      focusedPaneId: "float-a",
    };
    const registry = {
      panes: new Map([["test-pane", {
        id: "test-pane",
        name: "Test Pane",
        component: () => <text>Test pane body</text>,
      }]]),
      paneTemplates: new Map(),
      commands: new Map(),
      tickerActions: new Map(),
      brokers: new Map(),
      allPlugins: new Map(),
      getPluginPaneIds: () => [],
      getPluginPaneTemplateIds: () => [],
      hasPaneSettings: () => false,
      openPaneSettingsFn() {},
      openCommandBar() {},
      openWindowMode() {},
      openWindowModeFn() {},
      updateLayoutFn() {},
      hidePane() {},
      notify() {},
    } as unknown as PluginRegistry;
    let completions = 0;
    const controls: {
      dispatch?: (action: AppAction) => void;
      commandBarOpen?: boolean;
    } = {};

    function Harness() {
      const [state, dispatch] = useReducer(appReducer, initialState);
      controls.dispatch = dispatch;
      controls.commandBarOpen = state.commandBarOpen;
      return (
        <AppContext value={{ state, dispatch }}>
          <TransientLayoutProvider>
            <TestDialogProvider>
              <Shell pluginRegistry={registry} />
            </TestDialogProvider>
            {state.commandBarOpen && (
              <CommandBarShortcutHarness
                currentRoute={null}
                onRootTab={() => {
                  completions += 1;
                  return true;
                }}
              />
            )}
          </TransientLayoutProvider>
        </AppContext>
      );
    }

    testSetup = await testRenderWithAppProviders(
      <WebInputHostProvider>
        <Harness />
      </WebInputHostProvider>,
      { width: 120, height: 40 },
    );
    await testSetup.renderOnce();

    await act(async () => {
      registry.openWindowModeFn("float-a", "resize");
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });
    expect(testSetup.captureCharFrame()).toContain("WINDOW RESIZE");

    testWindow.createControl("INPUT").focus();
    let firstCommandBarKey: TestKeyboardEvent | undefined;
    act(() => {
      flushSync(() => {
        controls.dispatch?.({ type: "SET_COMMAND_BAR", open: true });
      });
      firstCommandBarKey = testWindow.emitKeyDown("Tab");
    });

    expect(controls.commandBarOpen).toBe(true);
    expect(completions).toBe(1);
    expect(firstCommandBarKey?.defaultPrevented).toBe(true);
    expect(firstCommandBarKey?.propagationStopped).toBe(true);
  });
});
