import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { UiHostProvider } from "../../ui";
import type { RendererHost, UiHost } from "../../ui/host";
import { FloatingPaneWrapper } from "./floating-pane";

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

    renderToStaticMarkup(
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
  });
});
