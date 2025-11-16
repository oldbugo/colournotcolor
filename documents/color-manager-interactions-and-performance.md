## Color Manager Interactions & Performance Notes

Last updated: 2025-11-16

This document captures how the Color Manager, scroll snap, and resizable panels work together, where complexity and performance pressure tend to show up, and options for simplifying or optimising the system without losing functionality.

---

## 1. Scope & Goals

- Focus areas:
  - Card and group drag & drop in `components/color-manager.tsx`.
  - Scroll snapping and “illusion” effects in `lib/scroll-snap.ts`.
  - Section divider resizing in `components/resizable-panels.tsx`.
- Goals:
  - Reduce perceived lag when adjusting the main panel dividers.
  - Keep the existing UX semantics (group collapse, scroll snap, insert/swap modes) intact where possible.
  - Document trade-offs so future changes can be intentional rather than incremental hacks.

---

## 2. Key Components & Responsibilities

- `components/resizable-panels.tsx`
  - Three-panel layout with two draggable vertical dividers.
  - Stores widths in local state (`widths`, percentages) and recomputes on every `mousemove` during a drag.
  - Handles collapse/expand of individual panels and translates logical widths → “actual” widths via `computeActualWidths`.
  - Uses `ResizeObserver` (or window `resize` fallback) to track overall container width.

- `app/page.tsx`
  - Hosts `<ResizablePanels>` and provides:
    - Panel 1: `PaletteManager`
    - Panel 2: `ContrastChecker` (Color Manager + Contrast Grid)
    - Panel 3: `ContrastChecker` (Grid-only variant)
  - Drives palette state, current editing color, and the `collapseGroupsDuringGroupDrag` flag.

- `components/contrast-checker.tsx`
  - Bridges palette data to:
    - Two `ColorManager` instances (Foreground and Background).
    - One `ContrastGrid` grid for visual contrast matrix.
  - Converts between legacy string representation and `ColorSwatch` shape.

- `components/color-manager.tsx`
  - Core interaction state:
    - Card-level drag (insert vs swap, between-groups, new group, trash).
    - Group-level drag (swap vs insert, detection bands, deadzones).
    - Scroll snapping for groups and cards, including “snap illusion” animations.
    - Group collapsing during drag, and restoration with scroll anchor.
    - Card size selection + responsive drop zone layout.
  - Uses multiple refs/effects to:
    - Track drag pointers in viewport coordinates.
    - Schedule and cancel snaps using `scheduleSnap`.
    - Maintain a “scroll anchor” so the viewport does not jump when groups expand/collapse.

- `components/color-manager/group-section.tsx`
  - Per-group container for cards plus group header/controls.
  - Handles:
    - CSS grid column count based on available width and design tokens.
    - Animated expansion/collapse of groups.
    - Animated height collapse when a group is being removed.
    - Insert zones and outline visuals around group boundaries for group drag.
  - Uses `ResizeObserver` (when available) on the grid to:
    - Recompute column count as width changes.
    - Track content height for collapse/expand animations.

- `lib/scroll-snap.ts`
  - Centralised scroll snap and illusion engine:
    - `findScrollParent`, `measureRect` helpers.
    - `ensureGroupVisibility` and `ensureCardVisibility` for “is this in view?” logic.
    - `scheduleSnap` orchestrator with retry, settle delays, and interrupt handling.
  - Uses:
    - Smooth tweening for small scroll deltas.
    - Jump + small “in-direction” flourish for large deltas (if not in reduced-motion mode).
    - RAF + timeouts with careful cleanup and wheel/touch interruptions.

---

## 3. Where Complexity & Cost Accumulate

### 3.1 Panel Divider Dragging

Relevant file: `components/resizable-panels.tsx`

- During divider drag:
  - `handleMouseMove` in a `useEffect` runs on *every* `mousemove` while `resizingIndex !== null`.
  - For each event:
    - Computes new widths as percentages based on the mouse position and min-width constraints.
    - Calls `setWidths`, causing `ResizablePanels` to re-render with updated inline `style.width` for each panel.
  - Child panel contents (e.g. `ContrastChecker`, `ColorManager`) are passed as React nodes, so they are not fully recreated per width change, but:
    - The DOM layout of their content still reflows because panel widths change.
    - All width-dependent observers inside those panels (see below) fire frequently.

Net effect: divider drags cause continuous layout changes across the entire middle/side panels, plus a cascade of `ResizeObserver` callbacks and style recalculations in the Color Manager.

### 3.2 Color Manager Layout & Observers

Relevant files:
- `components/color-manager.tsx`
- `components/color-manager/group-section.tsx`

Key patterns:

- Card grids share a global column count:
  - `ColorManager` measures the first group’s grid width (via a single `ResizeObserver`) and derives a column count using the selected card size token and `minCardWidth`.
  - Every `GroupSection` receives that count and sets `gridTemplateColumns` accordingly, ensuring card widths remain consistent across groups and react to the card-size selector.

- Per-group `ResizeObserver` for content height:
  - Each `GroupSection` still observes the grid node to recompute `contentHeight`, which feeds the collapsible `height` animation.
  - Height measurements now use a ~70ms debounce to avoid reacting to every micro resize event, but rapid layout swings can still trigger multiple reads while the timer catches up.

- Drop zone layout in `ColorManager`:
  - `dropZoneWidth` is measured:
    - Once via a layout effect (`measureDropZoneWidth`) that reads the first card’s bounding rect.
    - Continuously via a `ResizeObserver` attached to the first card.
  - `recomputeDropZoneLayout` runs to decide whether the new/trash drop zones should stack or sit side-by-side, based on container width, column gap, and `dropZoneWidth`.

Net effect: when the panel width changes quickly (divider drag), both ColorManager instances still:
- Recompute group content heights.
- Measure card widths and recompute drop zone layout.
The CSS-based grid removes one set of observers, but remaining measurements can still contribute to cost on slower machines or with many groups/cards.

### 3.3 Drag & Scroll Snap Loops

Relevant file: `components/color-manager.tsx`

- Auto-scroll while dragging:
  - A `useEffect` sets up an RAF loop when either `draggedGroup` or `isAnyCardDragging` is active.
  - Each frame:
    - Reads `dragViewportPointerRef` and the scroll parent rect.
    - Computes a scroll delta near the top/bottom “heat zones” and updates `scrollTop`.
  - This is active only during drag, not during divider resizing, but it shares the same scroll parent and can compete for bandwidth when the viewport is already under layout stress.

- Group scroll anchor:
  - When groups expand/collapse (e.g. after a drag), `groupScrollAnchorRef` preserves the group’s vertical position via a separate RAF loop (`applyGroupScrollAnchor` + `scrollAnchorVersion`).
  - Helps avoid large jumps but adds another continuous adjustment while active.

- Snap scheduling:
  - `scheduleCardViewportSnap` and `snapGroupIntoView` call `scheduleSnap`, which:
    - May perform multiple attempts (up to `CARD_SNAP_MAX_ATTEMPTS` for cards).
    - Attaches wheel/touch interrupt handlers on the scroll parent.
    - Uses timeouts to wait for movement to settle.
  - These runs are bounded and typically triggered by discrete events (drop, cross-group moves), so they are *not* the main culprit for divider lag, but they increase overall complexity.

### 3.4 Group Drag Intent Resolution

Relevant file: `components/color-manager.tsx` (`evaluateGroupDragIntent`)

- On group drag:
  - Uses `document.querySelectorAll("[data-group-section]")` to get all sections.
  - For each section:
    - Reads its bounding rect.
    - Computes detection regions for swap vs insert, edge thresholds, mid-point deadzones, and a “best intent” candidate.
  - Ties into `groupDragPointerRef` updates on drag events.

This is sophisticated but relatively local to group drag behaviour; it adds conceptual complexity more than constant drag cost during divider resizing.

---

## 4. Optimisation & Simplification Ideas

The ideas below aim to improve divider-drag smoothness and reduce system complexity while keeping current behaviours as intact as possible. They are ordered from lowest-risk tweaks to larger architectural simplifications.

### 4.1 Panel Resize Path (Section Dividers)

**Problem:** Every `mousemove` during divider drag recomputes widths and triggers layout + observers across the app.

**Ideas:**

1. **Throttle width updates via `requestAnimationFrame`:**
   - Keep the raw mouse position in a ref (`pendingMouseXRef`).
   - On `mousemove`, update the ref and, if no RAF is scheduled, schedule one.
   - In the RAF callback, read the latest mouse position, compute widths once, and call `setWidths`.
   - Benefit: caps re-renders and downstream layout work at ~1 per frame, instead of potentially multiple per frame on high-frequency `mousemove` streams.
   - Files: `components/resizable-panels.tsx` (inside the `useEffect` that attaches `handleMouseMove`).

2. **Skip no-op width updates:**
   - Before calling `setWidths`, compare the newly computed `[w1, w2, w3]` to the current `widths` (or `actualWidths`) with a small epsilon (e.g. `0.1`).
   - If they are effectively identical, bail out.
   - Benefit: reduces state churn and reconciliation when divider movement is very small or snapped by min-width constraints.

3. **Optional: reduced-motion behaviour while resizing:**
   - Introduce a top-level “panel-resizing” flag (e.g. via context or prop) that the Color Manager can see.
   - While `resizingIndex !== null`:
     - Skip non-critical animations (snap illusions, card “pop” effects).
     - Possibly skip or defer `scheduleSnap` calls that are purely cosmetic.
   - This is more invasive because it requires wiring a flag down to components, but it can materially reduce animation pressure during divider drags.

### 4.2 Color Manager Layout (Columns & Heights)

**Problem:** Multiple `ResizeObserver` instances per group + card width observers produce extra layout work on each panel width change.

**Ideas:**

1. **CSS-driven grid instead of JS column counting (largest simplification):**
   - Replace `columnCount` calculation in `GroupSection` with CSS grid using `auto-fit`/`auto-fill` and `minmax`:
     - e.g. `gridTemplateColumns: repeat(auto-fit, minmax(MIN_CARD_WIDTH_PX, 1fr))`.
   - Use design tokens to set `MIN_CARD_WIDTH_PX` per card size mode.
   - Remove the `ResizeObserver` that recomputes `columnCount`.
   - Benefit:
     - Eliminates per-group column-count state and its observer.
     - Lets the browser handle responsive wrapping efficiently.
   - Trade-off: columns may not match the current “target width” heuristics exactly, but behaviour is usually close and much simpler.
   - Files: `components/color-manager/group-section.tsx`.

2. **Centralise column computation per Color Manager (medium change):**
   - If we want to preserve current “target width” logic:
     - Attach a single `ResizeObserver` at the Color Manager root (or a single shared grid container).
     - Compute a shared `columnCount` per card size.
     - Pass it down as a prop to all `GroupSection` instances.
   - Benefit:
     - One observer and one state update instead of N per group.
   - Trade-off: all groups will share the same column count, which is acceptable given groups sit in the same column layout.
   - Files: `components/color-manager.tsx`, `components/color-manager/group-section.tsx`.

3. **Debounce content-height recomputation:**
   - For the `contentHeight` `ResizeObserver` in `GroupSection`, introduce a small debounce (e.g. 50–80ms) before updating height.
   - This avoids thrashing `scrollHeight` reads when divider drag produces many small width changes.
   - Trade-off: collapse/expand height may lag slightly behind instantaneous layout, but within a tolerable range.

4. **Simplify drop zone width measurement:**
   - Reconsider whether we really need to measure the first card’s width for `dropZoneWidth`, vs using the selected card size token directly.
   - If the token widths are already an accurate visual proxy, we can:
     - Remove the `ResizeObserver` on the first card.
     - Use `selectedCardSize.width` as the `dropZoneWidth` baseline.
   - Benefit: fewer observers and DOM reads on panel width changes.
   - Files: `components/color-manager.tsx` (drop zone width logic and related effects).

### 4.3 Drag Intent & Scroll Behaviour

**Ideas:**

1. **Cache group rects per drag gesture:**
   - ✅ Implemented: group section rects are captured on drag start and reused until the drag ends (or layout changes mark them as dirty).
   - Benefit: reduces repeated `getBoundingClientRect()` calls on every drag-update path.

2. **Guard auto-scroll and anchor loops during heavy resize:**
   - If we add a global “panel-resizing” flag:
     - Pause the drag auto-scroll RAF loop while a divider is actively moving, or lower its speed.
     - Optionally pause `groupScrollAnchor` corrections until the user stops resizing.
   - This prevents competing RAF-driven behaviours when layout is already in flux from divider adjustments.

3. **Unify and document snap triggers:**
   - Ensure we call `scheduleSnap` only from well-defined discrete events (drop, explicit “focus card” interactions).
   - Avoid any “hidden” snap calls from layout-related hooks that might re-trigger snaps during width changes.
   - This is largely the case already but worth keeping in mind when adding new behaviours.

### 4.4 Animation & Illusion Tuning

**Ideas:**

1. **Expose a “low-interaction” mode:**
   - Add a top-level config (or environment flag) that can:
     - Disable snap illusions (`skipSnapIllusion: true`) globally while we debug perf.
     - Optionally reduce scroll durations to the minimum safe values.
   - This is useful for quick A/B checks: “is lag mostly from illusions or from layout?”.

2. **Tighten `DEFAULT_MAX_ATTEMPTS` and settle times:**
   - For cards, we currently allow up to `CARD_SNAP_MAX_ATTEMPTS` (8) attempts.
   - We could lower this for “normal” snaps and only allow more attempts when explicitly requested.
   - Similarly, we can clamp settle durations closer to `MIN_SETTLE_MS` for short-distance snaps.

---

## 5. Suggested Implementation Order

1. **Panel resize improvements (low risk, high impact):**
   - Implement RAF-based throttling + no-op guard in `ResizablePanels`.
   - Optionally add a temporary toggle to disable illusions while resizing, to verify perceived improvements.

2. **Color Manager layout simplifications:**
   - Decide between CSS-driven grid (simpler) vs shared column-count (more precise).
   - Implement the chosen approach and remove redundant `ResizeObserver` usage.

### Current Divider Baseline (2025-11-18)
- Divider 1 (between Palette Manager and Color Manager):
  - Panels A → B → C consume/return width sequentially. Dragging the handle to the right shrinks B until it hits its minimum, then begins shrinking C; dragging left grows B first.
  - Minimums respect collapse width (when collapsed) or the shared percentage threshold (when expanded). The handle itself highlights while active for better visual feedback.
- Divider 2 (between Color Manager and Contrast Matrix):
  - Panels C → B → A follow the same sequential rules in the opposite direction: C gives up space first, then B if needed, keeping section transitions smooth.
- Both handles use a single RAF-throttled loop, ignore no-op updates, and the visual affordances now reflect active drag states.
- Divider handles are marked with `data-panel-divider` so global “click outside” handlers ignore them, preventing unintended color deselection when resizing.
- Panel headers (Palette Manager / Color Manager / Contrast Matrix) now use a shared, full-width shadcn-inspired treatment with rounded icon badges, subtle sublabels, soft hover states, and simplified divider rails, removing the legacy “floating” hover effect and excess lines.

3. **Targeted drag optimisations:**
   - Cache group section rects during group drag.
   - Optionally reduce height recomputation frequency for collapsible content.

4. **Fine-tuning scroll snap & animations:**
   - Adjust `scheduleSnap` tuning parameters only after layout improvements, so changes are based on a “cleaner” baseline.

This sequence should address the current pain point (divider lag) first, then gradually simplify and harden the more complex interaction layers (group drag, scroll snap) without dropping key behaviours.

---

## 6. Recent Updates

- **Panel divider throttling (2025-11-16):**
  - `components/resizable-panels.tsx` now processes pointer movement through a single `requestAnimationFrame` loop, stores the latest event in a ref, and cancels redundant frames.
  - Width updates are skipped when the delta is below 0.1 percentage points, which keeps `setWidths` from firing on tiny movements.

- **Shared card column count (2025-11-17):**
  - `components/color-manager.tsx` now measures the first group's grid width and computes a single column count based on the card-size selector and `minCardWidth`.
  - The count is passed to every `GroupSection`, keeping card widths aligned across groups while still responding to panel width changes.
- **Insert indicator edge clamp (2025-11-17):**
  - `components/color-manager.tsx` now clamps the indicator's horizontal position to stay within the grid bounds, so the vertical guide remains visible when targeting the first or last column in a row.
  - Added a small (≈1.5px) safety inset beyond the 2px half-width margin so the guide stays fully visible even when layout rounding would otherwise crop it.
- **Group drag intent caching (2025-11-18):**
  - `components/color-manager.tsx` captures `[data-group-section]` rects when a group drag begins and only re-measures when the layout changes, minimizing repeated DOM queries during intent resolution.
- **Group section height debounce (2025-11-18):**
  - `components/color-manager/group-section.tsx` now debounces content-height measurements (~70 ms) so divider resizes no longer trigger a flood of `scrollHeight` reads.
- **Divider baseline refinement (2025-11-18):**
   - `components/resizable-panels.tsx` enforces sequential min-width clamps (B before C for divider 1, C before B for divider 2), mirroring the palette-manager/colour-manager expectations and updating the handle visuals to show active drag state.

These changes implement steps 1–3 from the plan above. Future optimisation work can focus on pausing auto-scroll/anchor loops during divider movement and tuning the snap scheduler parameters.
