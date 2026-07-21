import type { LayoutConfig } from "../../types/config";
import {
  boundsForRects,
  inferCompactedDockTree,
  inferDockTreeFromRects,
  type GridlockRect,
} from "./gridlock-inference";
import {
  findDockLeaf,
  getDockLeafLayouts,
  type LayoutBounds,
} from "./dock-tree";
import {
  finalizeLayout,
  removeUnavailablePaneTypes,
  type PaneTypeAvailability,
} from "./layout-state";

export function compactDockedPaneAtRect(
  layout: LayoutConfig,
  draggedInstanceId: string,
  targetRect: LayoutBounds,
  bounds: LayoutBounds,
): LayoutConfig {
  if (!findDockLeaf(layout, draggedInstanceId)) return layout;
  const dockRoot = inferCompactedDockTree(layout, draggedInstanceId, targetRect, bounds);
  if (!dockRoot) return layout;
  return finalizeLayout({
    ...layout,
    dockRoot,
    floating: layout.floating,
  });
}

export function gridlockAllPanes(
  layout: LayoutConfig,
  bounds: LayoutBounds = { x: 0, y: 0, width: 120, height: 40 },
  paneTypes?: PaneTypeAvailability,
): LayoutConfig {
  const visibleLayout = paneTypes
    ? removeUnavailablePaneTypes(layout, paneTypes)
    : layout;
  const dockedRects: GridlockRect[] = getDockLeafLayouts(visibleLayout, bounds)
    .map((leaf) => ({ instanceId: leaf.instanceId, ...leaf.rect }));
  const floatingRects: GridlockRect[] = visibleLayout.floating.map((entry) => ({
    instanceId: entry.instanceId,
    x: entry.x,
    y: entry.y,
    width: entry.width,
    height: entry.height,
  }));
  const allRects = [...dockedRects, ...floatingRects];
  if (allRects.length === 0) return visibleLayout;

  return finalizeLayout({
    ...visibleLayout,
    dockRoot: inferDockTreeFromRects(allRects, boundsForRects(allRects)),
    floating: [],
  });
}
