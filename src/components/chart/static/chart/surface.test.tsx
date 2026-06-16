import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "../../../../renderers/opentui/test-utils";
import { colors } from "../../../../theme/colors";
import { resolveChartPalette } from "../../core/renderer";
import { StaticChartSurface } from "./surface";
import type { ProjectedChartPoint } from "../../core/data";

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined;

afterEach(async () => {
  if (!testSetup) return;
  await act(async () => {
    testSetup!.renderer.destroy();
  });
  testSetup = undefined;
});

const points: ProjectedChartPoint[] = [
  { date: new Date("2026-01-01"), open: 3.5, high: 3.5, low: 3.5, close: 3.5, volume: 0 },
  { date: new Date("2026-01-02"), open: 4.1, high: 4.1, low: 4.1, close: 4.1, volume: 0 },
  { date: new Date("2026-01-03"), open: 4.9, high: 4.9, low: 4.9, close: 4.9, volume: 0 },
];

describe("StaticChartSurface", () => {
  test("renders unit and custom y-axis labels", async () => {
    testSetup = await testRender(
      <StaticChartSurface
        points={points}
        width={48}
        height={10}
        mode="line"
        colors={resolveChartPalette(colors, "positive")}
        yAxisLabel="Yield (%)"
        yAxisColor={colors.textDim}
        formatYAxisValue={(value) => `${value.toFixed(2)}%`}
      />,
      { width: 50, height: 12 },
    );

    await act(async () => {
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });

    const frame = testSetup.captureCharFrame();
    expect(frame).toContain("Yield (%)");
    expect(frame).toContain("4.90%");
    expect(frame).toContain("3.50%");
  });

  test("renders custom x-axis scale labels", async () => {
    testSetup = await testRender(
      <StaticChartSurface
        points={points}
        width={48}
        height={10}
        mode="line"
        colors={resolveChartPalette(colors, "positive")}
        xAxisLabels={["0%", "50%", "100%"]}
        xAxisColor={colors.textDim}
      />,
      { width: 50, height: 12 },
    );

    await act(async () => {
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });

    const frame = testSetup.captureCharFrame();
    expect(frame).toContain("0%");
    expect(frame).toContain("50%");
    expect(frame).toContain("100%");
  });

  test("renders x-axis decision markers", async () => {
    testSetup = await testRender(
      <StaticChartSurface
        points={points}
        width={56}
        height={10}
        mode="line"
        colors={resolveChartPalette(colors, "positive")}
        xAxisLabels={["0%", "50%", "100%"]}
        xMarkers={[
          { id: "current", xRatio: 0.1, label: "current", lineChar: "┊" },
          { id: "target", xRatio: 0.5, label: "target", lineChar: "┃" },
          { id: "full", xRatio: 0.8, label: "full", lineChar: "│" },
        ]}
        xAxisColor={colors.textDim}
      />,
      { width: 58, height: 12 },
    );

    await act(async () => {
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });

    const frame = testSetup.captureCharFrame();
    expect(frame).toContain("current");
    expect(frame).toContain("target");
    expect(frame).toContain("full");
    expect(frame).toContain("┃");
  });

  test("renders a cursor crosshair after mouse movement", async () => {
    testSetup = await testRender(
      <StaticChartSurface
        points={points}
        width={48}
        height={10}
        mode="line"
        colors={resolveChartPalette(colors, "positive")}
        xAxisLabels={["0%", "50%", "100%"]}
        formatXAxisCursorValue={(ratio) => `X${Math.round(ratio * 100)}`}
        formatYAxisValue={(value) => `Y${value.toFixed(2)}`}
        xMarkers={[
          { id: "current", xRatio: 0.1, label: "current", lineChar: "┊" },
          { id: "target", xRatio: 0.5, label: "target", lineChar: "┃" },
        ]}
      />,
      { width: 50, height: 12 },
    );

    await act(async () => {
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });
    const initialFrame = testSetup.captureCharFrame();

    await act(async () => {
      await testSetup!.mockMouse.moveTo(20, 4);
      await testSetup!.renderOnce();
      await testSetup!.renderOnce();
    });

    expect(testSetup.captureCharFrame()).not.toBe(initialFrame);
    expect(testSetup.captureCharFrame()).toContain("X49");
    expect(testSetup.captureCharFrame()).toContain("Y3.97");
  });
});
