import { isPaneInLayout } from "../../../plugins/pane-manager";
import { cloneLayout, type LayoutConfig } from "../../../types/config";

export function resolvePaneFullscreenLayout(
  layout: LayoutConfig,
  paneId: string | null,
): LayoutConfig | null {
  if (!paneId || !isPaneInLayout(layout, paneId)) return null;
  const source = cloneLayout(layout);
  const pane = source.instances.find((instance) => instance.instanceId === paneId);
  if (!pane) return null;

  return {
    ...source,
    dockRoot: { kind: "pane", instanceId: paneId },
    instances: [pane],
    floating: [],
    detached: [],
  };
}
