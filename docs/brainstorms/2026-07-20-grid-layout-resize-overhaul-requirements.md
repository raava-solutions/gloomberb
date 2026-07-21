# Grid Layout & Panel Resize Overhaul — Requirements

- **Date:** 2026-07-20
- **Status:** Requirements (ready for planning)
- **Scope:** Standard / Deep-feature
- **Renderers affected:** both TUI (`src/renderers/opentui/`) and GUI (`src/renderers/electrobun/`)

## Problem

The dashboard's pane layout has two daily-use UX failures for the operator (Zay):

1. **Snapping forces full dashboard width.** Dragging a pane to snap ends up spanning the entire width instead of letting panels sit side-by-side at partial widths.
2. **Panels resize from only one corner** (bottom-right), so shaping the layout is clumsy.

Both meaningfully degrade the operator's ability to arrange a dense terminal. This is an existing-product refinement, not a new product.

## Users & Value

- **User:** the operator running gloomberb as their daily terminal (the deployed app + TUI).
- **Value:** arrange many panels into a dense, arbitrary grid quickly — Grafana/Datadog-class layout freedom in a terminal-aesthetic app. Directly removes friction the operator hits every session.

## Decision / Approach

**Evolve the existing custom OpenTUI pane system — do not adopt a web grid library.** The layout is a character-cell OpenTUI system (`dockRoot` split-tree + `floating` rects + `detached` OS windows), not DOM; `react-grid-layout` and peers do not apply.

Two coexisting modes, by explicit decision:

- **Tiling grid (default):** panes snap to a finer column grid, never forced full-width, no overlap, and **auto-compact reflow** — dragging a pane into occupied space pushes neighbors and closes gaps (Grafana/Datadog behavior).
- **Float (escape hatch):** any pane may be floated to sit free / overlapping. Floating panes do **not** auto-compact, but they still get finer snap zones and all-8 resize.

Most logic is shared across renderers; the resize hitbox is the one duplicated surface (see Code Anchors).

## Functional Requirements

1. **Partial-width placement.** Panes snap to a finer column grid and can occupy arbitrary partial widths; snapping must never force full dashboard width. Multiple panes sit side-by-side at partial widths.
2. **All-8 resize.** Every pane resizes from all four corners and all four edges, via both mouse and keyboard (window-edit) modes.
3. **Auto-compact reflow (tiled panes).** Dragging a tiled pane into occupied space reflows neighbors and compacts the layout to close gaps; no overlap between tiled panes.
4. **Float escape hatch.** A pane can be floated to free/overlapping placement; floating panes are exempt from compaction but retain finer snap zones and all-8 resize.
5. **Renderer parity.** Behavior is identical in the TUI and GUI renderers for in-window panes. Detached GUI panes keep native OS-window resize.
6. **Persistence & history preserved.** Existing saved layouts continue to load without corruption; undo/redo layout history, `gridlock`, and detach/pop-out keep working.

## Success Criteria

- Place 3+ panels side-by-side at arbitrary partial widths with no full-width snapping — in both renderers.
- Every pane is resizable from any corner or edge, mouse and keyboard, in both renderers.
- Rearranging tiled panes auto-compacts without manual gap management.
- A pane can be floated, overlaps freely, and does not trigger compaction — yet still resizes from all 8 handles.
- No regression: saved layouts load, undo/redo works, detach/pop-out works.

## Code Anchors (verified 2026-07-20)

This feature is inherently mechanical, so the load-bearing sites are captured for planning. All paths repo-relative.

- **Full-width snap bug:** `src/components/layout/shell/drag/index.ts` — `makeSnapGuides()`; `top`/`bottom` snap zones use a full-`width` preview rect (corners + left/right already use half-width). Finer column granularity also added here / in `resolveSnapGuide`.
- **One-corner resize (duplicated — both must change):**
  - `src/components/layout/shell/terminal-pointer-runtime.ts` (TUI) — bottom-right-only hitbox at ~L120 and ~L210 (`relativeX >= rect.width-2 && relativeY >= rect.height-1`).
  - `src/components/layout/shell/native/pointer-runtime.ts` (GUI) — `startNativeFloatResize` at ~L110 (its own bottom-right-only float-resize path).
- **Keyboard resize corners:** `src/components/layout/window-edit/mode.ts` — `FLOATING_RESIZE_CORNERS = ["top-left","bottom-right"]`; expand to all corners/edges; `applyWindowEditDirection` routing.
- **Resize engine:** `src/plugins/pane-manager/floating-actions.ts` — `resizeFloatingPaneFromCorner` branches corners only; add edge support. `moveFloatingPane`, `floatAtRect` nearby.
- **Compaction / tiling inference:** `src/plugins/pane-manager/gridlock.ts` (`gridlockAllPanes`) + `gridlock-inference.ts` (`inferDockTreeFromRects`, `buildGridDockTree`) — currently a one-shot manual retile; extend to run live during drag for auto-compact.
- **Dock geometry:** `src/plugins/pane-manager/dock-tree.ts` — `collectDockGeometry`, `resolveSplitSizes`, `getDockResizeTargets`, divider layouts.
- **Layout model & persistence:** `src/types/config.ts` (`LayoutConfig`, `DockLayoutNode`, `FloatingPaneEntry`, `SavedLayout`, `normalizePaneLayout`), `src/core/state/app/layout-reducer.ts` (undo/redo/update/switch), `src/renderers/electrobun/bun/desktop/*` (detached OS windows, `window-events.ts` native resize).
- **Overlays/preview:** `src/components/layout/shell/window-mode/overlays.tsx`, `src/components/layout/window-edit/status.tsx` — resize-corner preview chrome (native + non-native paths).

## Scope Boundaries

**In scope:** partial-width snapping, all-8 resize (mouse + keyboard), auto-compact reflow for tiled panes, float escape hatch, both renderers, layout persistence/undo/detach preserved.

**Out of scope:**
- Adopting any web grid library (custom OpenTUI system stays).
- Data-source and AI-agent-pane behavior (investigated separately, see companion findings).
- Responsive/mobile layout.

**Deferred / open (for planning to resolve):**
- Column count and whether it is user-configurable (e.g. fixed 12/24 vs adjustable).
- Row-height model: fixed row units vs continuous cells.
- Compaction direction: vertical-only (Grafana) vs bidirectional.
- Whether floating→tiled and tiled→floating transitions need explicit UI affordance vs. drag gesture.
- Migration behavior for saved layouts created under the current half/quadrant snap model.

## Dependencies / Assumptions

- Layout logic is shared across renderers except the resize hitbox (duplicated in the two pointer runtimes) — verified.
- Detached GUI panes use native OS-window resize and are intentionally excluded from the in-window grid mechanics.
- The resize engine already supports at least two corners; extending to edges + all corners is an extension, not a rewrite.
- No backend/data-layer change required for this feature.
