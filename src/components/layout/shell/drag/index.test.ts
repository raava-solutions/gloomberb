import { describe, expect, test } from "bun:test";
import { createPaneInstance, type LayoutConfig } from "../../../../types/config";
import { getDockLeafLayouts } from "../../../../plugins/pane-manager";
import {
  createLeafDropPreview,
  createSnapDropPreview,
  constrainFloatingRectToBounds,
  LAYOUT_GRID_COLUMNS,
  LAYOUT_GRID_ROWS,
  makeLayoutGridCells,
  makeSnapGuides,
  resolveSnapGuide,
} from "./index";

const BOUNDS = { x: 0, y: 0, width: 120, height: 60 };

function threePaneLayout(): LayoutConfig {
  return {
    dockRoot: {
      kind: "split",
      axis: "horizontal",
      ratio: 0.5,
      first: { kind: "pane", instanceId: "a:main" },
      second: {
        kind: "split",
        axis: "vertical",
        ratio: 0.5,
        first: { kind: "pane", instanceId: "b:main" },
        second: { kind: "pane", instanceId: "c:main" },
      },
    },
    instances: [
      createPaneInstance("a", { instanceId: "a:main" }),
      createPaneInstance("b", { instanceId: "b:main" }),
      createPaneInstance("c", { instanceId: "c:main" }),
    ],
    floating: [],
    detached: [],
  };
}

describe("layout construction grid", () => {
  test("builds a visible 6x6 grid whose cells cover odd dashboard bounds", () => {
    const cells = makeLayoutGridCells(121, 41);

    expect(cells).toHaveLength(LAYOUT_GRID_COLUMNS * LAYOUT_GRID_ROWS);
    expect(cells[0]?.rect).toEqual({ x: 0, y: 0, width: 20, height: 6 });
    expect(cells.at(-1)?.rect).toEqual({ x: 100, y: 34, width: 21, height: 7 });
    expect(Math.max(...cells.map((cell) => cell.rect.x + cell.rect.width))).toBe(121);
    expect(Math.max(...cells.map((cell) => cell.rect.y + cell.rect.height))).toBe(41);
  });

  test("resolves every pointer position to the matching highlighted cell", () => {
    const guides = makeSnapGuides(120, 42);

    expect(guides).toHaveLength(36);
    expect(resolveSnapGuide(0, 0, guides)).toMatchObject({
      position: "cell-1-1",
      previewRect: { x: 0, y: 0, width: 20, height: 7 },
    });
    expect(resolveSnapGuide(119, 41, guides)).toMatchObject({
      position: "cell-6-6",
      previewRect: { x: 100, y: 35, width: 20, height: 7 },
    });
    expect(resolveSnapGuide(120, 41, guides)).toBeNull();
  });

  test("coarsens the grid safely when the content area is smaller than 6x6", () => {
    const guides = makeSnapGuides(3, 2);
    expect(guides).toHaveLength(6);
    expect(guides.every((guide) => guide.previewRect.width === 1 && guide.previewRect.height === 1)).toBe(true);
  });

  test("inserts a docked pane at the selected edge of the occupied target leaf", () => {
    const preview = createLeafDropPreview(
      threePaneLayout(),
      "a:main",
      { kind: "leaf", targetId: "b:main", position: "top" },
      BOUNDS,
    );

    expect(preview).not.toBeNull();
    const leaves = getDockLeafLayouts(preview!.layout, BOUNDS);
    const a = leaves.find((leaf) => leaf.instanceId === "a:main")!.rect;
    const b = leaves.find((leaf) => leaf.instanceId === "b:main")!.rect;
    const c = leaves.find((leaf) => leaf.instanceId === "c:main")!.rect;

    expect(a.x).toBe(b.x);
    expect(a.width).toBe(b.width);
    expect(a.y).toBeLessThan(b.y);
    expect(c).toEqual({ x: 0, y: 30, width: 120, height: 30 });
  });

  test("previews every dock leaf geometry changed by a directional drop", () => {
    const preview = createLeafDropPreview(
      threePaneLayout(),
      "a:main",
      { kind: "leaf", targetId: "b:main", position: "top" },
      BOUNDS,
    );

    expect(preview?.rects.map((entry) => entry.instanceId).sort()).toEqual([
      "a:main",
      "b:main",
      "c:main",
    ]);
  });

  test("commits the selected grid cell exactly for one-pane and empty-grid layouts", () => {
    const target = { x: 80, y: 40, width: 20, height: 10 };
    const dockedOnly: LayoutConfig = {
      dockRoot: { kind: "pane", instanceId: "a:main" },
      instances: [createPaneInstance("a", { instanceId: "a:main" })],
      floating: [],
      detached: [],
    };
    const floatingOnly: LayoutConfig = {
      ...dockedOnly,
      dockRoot: null,
      floating: [{ instanceId: "a:main", x: 5, y: 5, width: 40, height: 20, zIndex: 70 }],
    };

    for (const layout of [dockedOnly, floatingOnly]) {
      const preview = createSnapDropPreview(layout, "a:main", "cell-5-5", target, BOUNDS);
      expect(preview.rect).toEqual(target);
      expect(preview.layout.dockRoot).toBeNull();
      expect(preview.layout.floating.find((entry) => entry.instanceId === "a:main"))
        .toEqual(expect.objectContaining({ ...target, fixedGeometry: true }));
      expect(preview.rects).toEqual([{ instanceId: "a:main", rect: target }]);
    }
  });

  test("preserves fixed cells without weakening ordinary floating minimums", () => {
    const selectedCell = { x: 50, y: 30, width: 10, height: 3 };

    expect(constrainFloatingRectToBounds({ ...selectedCell, fixedGeometry: true }, 60, 36))
      .toEqual({ ...selectedCell, fixedGeometry: true });
    expect(constrainFloatingRectToBounds(selectedCell, 60, 36))
      .toEqual({ x: 45, y: 30, width: 15, height: 6 });
  });
});
