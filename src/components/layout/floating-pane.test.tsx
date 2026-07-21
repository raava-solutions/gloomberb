import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { UiHostProvider } from "../../ui";
import type { RendererHost, UiHost } from "../../ui/host";
import { FloatingPaneWrapper } from "./floating-pane";
import { DesktopPaneButton } from "./pane/header";

const rendererHost: RendererHost = {
  requestExit() {},
  async openExternal() {},
  async copyText() {},
  async readText() { return ""; },
  notify() {},
};

describe("FloatingPaneWrapper", () => {
  test("leaves the native header interior move-owned and keeps seven border resize handles", () => {
    const resizeHandles: Array<Record<string, unknown>> = [];
    const Box = ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => {
      if (props["data-gloom-role"] === "resize-handle") resizeHandles.push(props);
      return <div>{children}</div>;
    };
    const Inline = ({ children }: { children?: ReactNode }) => <span>{children}</span>;
    const ui = {
      capabilities: { nativePaneChrome: true },
      Box,
      Text: Inline,
      Span: Inline,
      Strong: Inline,
      Underline: Inline,
      ScrollBox: Box,
      Input: Box,
      Textarea: Box,
      ChartSurface: Box,
      ImageSurface: Box,
      SpinnerMark: Inline,
      AsciiText: Inline,
    } as unknown as UiHost;

    const markup = renderToStaticMarkup(
      <UiHostProvider ui={ui} renderer={rendererHost}>
        <FloatingPaneWrapper
          paneId="floating:main"
          title="Floating"
          x={8}
          y={2}
          width={32}
          height={10}
          zIndex={75}
          focused
          showActions
          onFloatToggleMouseDown={() => {}}
          onActionMouseDown={() => {}}
          onCloseMouseDown={() => {}}
        >
          <span>body</span>
        </FloatingPaneWrapper>
      </UiHostProvider>,
    );

    expect(resizeHandles.map((handle) => handle["data-corner"])).toEqual([
      "top-left",
      "top-right",
      "left",
      "right",
      "bottom-left",
      "bottom",
      "bottom-right",
    ]);
    expect(resizeHandles.some((handle) => handle["data-corner"] === "top")).toBe(false);
    expect(resizeHandles.filter((handle) => String(handle["data-corner"]).startsWith("top-")))
      .toEqual([
        expect.objectContaining({ top: 0, left: 0, width: 2, height: 1 }),
        expect.objectContaining({ top: 0, right: 0, width: 2, height: 1 }),
      ]);
    expect(markup).toContain('<button type="button"');
    expect(markup.match(/<button type="button"/g)).toHaveLength(3);
    expect(markup.indexOf('data-gloom-role="pane-float-toggle"'))
      .toBeLessThan(markup.indexOf('data-gloom-role="pane-action"'));
    expect(markup.indexOf('data-gloom-role="pane-action"'))
      .toBeLessThan(markup.indexOf('data-gloom-role="pane-close"'));
    expect(markup).not.toContain("tabindex=");
    expect(markup).toContain('aria-label="Pane is floating — tile pane"');
  });

  test("lets native pane-header buttons focus on mouse down and activate on click", () => {
    let activations = 0;
    let stopped = false;
    let prevented = false;
    const button = DesktopPaneButton({
      label: "Tile pane",
      icon: null,
      role: "pane-float-toggle",
      onActivate: () => { activations += 1; },
    });
    const props = button.props as {
      onClick?: (event: unknown) => void;
      onKeyDown?: (event: unknown) => void;
      onMouseDown?: (event: { stopPropagation(): void; preventDefault(): void }) => void;
      tabIndex?: number;
    };

    props.onMouseDown?.({
      stopPropagation() { stopped = true; },
      preventDefault() { prevented = true; },
    });

    expect(stopped).toBe(true);
    expect(prevented).toBe(false);
    expect(activations).toBe(0);
    expect(props.tabIndex).toBeUndefined();
    expect(props.onKeyDown).toBeUndefined();

    props.onClick?.({});
    expect(activations).toBe(1);
  });
});
