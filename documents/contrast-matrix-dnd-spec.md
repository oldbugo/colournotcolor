# Contrast Matrix Drag & Drop Uplift Spec

_Last updated: 2025-11-19_

This document describes the current drag-and-drop behaviour for:

- The **Contrast Matrix** (`ContrastGrid`) used in the contrast checker.
- The **Color Manager** (`ColorManager`) used to edit palettes.

It also captures decisions and a transition plan to reduce duplicated drag logic by reusing shared building blocks where possible, while preserving existing user-facing behaviour.

---

## 1. Scope & Goals

**Files in scope**

- Contrast matrix:
  - `components/contrast-grid.tsx`
  - Legacy/unused DnD helpers:
    - `components/contrast-grid/foreground-header.tsx`
    - `components/contrast-grid/background-row.tsx`
    - `components/contrast-grid/overlay-indicators.tsx`
    - `components/contrast-grid/types.ts`
- Color manager:
  - `components/color-manager.tsx`
  - `components/color-manager/color-card.tsx`
  - `components/color-manager/group-header.tsx`
  - `components/color-manager/group-section.tsx`
  - `components/color-manager/types.ts`
- Shared components & utils:
  - `components/ui/drag-handle.tsx`
  - `components/dnd/drop-indicator.tsx`
  - `lib/dnd-utils.ts`
  - `components/contrast-checker.tsx`

**Goals**

- Document how drag & drop currently works in:
  - `ColorManager` (canonical palette editor).
  - `ContrastGrid` (visual contrast matrix).
- Identify overlapping semantics and duplicated logic.
- Define a transition plan to:
  - Centralise shared 1D drag semantics (swap vs insert).
  - Reuse shared indicator / delete / handle UI where it makes sense.
  - Keep current UX intact (including matrix-specific behaviour).

**Out of scope (for this spec)**

- Introducing a new DnD framework or re-architecting all DnD around `@dnd-kit`.
- Changing scroll snapping / “illusion” timing in `ColorManager`.
- Changing filter behaviour in `ContrastGrid`.

---

## 2. Current Contrast Matrix Drag & Drop

Component: `ContrastGrid` in `components/contrast-grid.tsx`

### 2.1 Data model

- Input: `colors: ColorSwatch[]` from `ContrastChecker`.
- Normalisation:
  - `ColorEntry` is derived from each swatch:
    - `id`, `legacy` string, `label`, `baseIndex` (index into `palette.colors`), `groupKey`, `groupLabel`, `numericValue`.
  - Grouping is used for filters (not for the grid layout itself).
- Derived lists:
  - `rowEntries` → background colours.
  - `columnEntries` → foreground colours.
  - Mapping between view indices and palette indices:
    - `backgroundBaseIndexes`: row index → `palette.colors` index.
    - `foregroundBaseIndexes`: column index → `palette.colors` index.

### 2.2 Drag state (grid-level)

- Foreground (columns):
  - `draggedFgIndex`, `dragOverFgIndex`: indices into `columnEntries`.
  - `fgDragMode`: `"swap" | "insert" | null`.
  - `fgInsertPosition`: `"before" | "after" | null`.
  - `fgAnimationState`: `{ draggedIndex, targetIndex }` for column animations.
  - `fgOverlayStyle`, `fgSwapHighlightStyle`: fixed-position overlays highlighting the active column.
  - `fgIndicatorPosition`: `{ left, top, height? }` for the vertical insert guide.
- Background (rows):
  - `draggedBgIndex`, `dragOverBgIndex`.
  - `bgDragMode`, `bgInsertPosition`.
  - `bgAnimationState`.
  - `bgOverlayStyle`, `bgSwapHighlightStyle`.
  - `bgIndicatorPosition`: `{ left, top, width? }` for the horizontal insert guide.
- Shared:
  - `gridRef` to measure the grid container.
  - `fgHeaderRefs`, `bgLabelRefs` (`Map<number, HTMLDivElement>`) for header/label rects.
  - `hoveredFgIndex`, `hoveredBgIndex` for subtle column/row hover overlays.
  - `isDragOverTrash`, `trashLeaveTimeoutRef` for the floating “Delete” bucket.
  - `isAnyHeaderDragging = draggedFgIndex !== null || draggedBgIndex !== null` drives the trash visibility.

### 2.3 Drag entry points

- Foreground columns:
  - Drag starts from a “handle” area above each column header in `ContrastGrid`:
    - A small 2-line grip, marked `data-drag-handle`.
    - Implemented inline (not using `DragHandle`).
  - Cells themselves are not draggable; they only respond to drag over.
- Background rows:
  - Drag starts from a strip to the left of each row’s label:
    - Two vertical bars, also with `data-drag-handle`.

### 2.4 Drop semantics

**Thresholds**

- For both foreground and background, drag mode is selected based on pointer position within the target rect:
  - Left/top band: `< 20%` of width/height ⇒ `"insert"` before.
  - Right/bottom band: `> 80%` ⇒ `"insert"` after.
  - Middle band: between 20% and 80% ⇒ `"swap"`.

**Swap mode**

- `dragMode === "swap"`:
  - Foreground:
    - Uses `foregroundBaseIndexes` to map `draggedFgIndex` and `dragOverFgIndex` to palette indices.
    - Calls `onSwapColors(fromBaseIndex, targetBaseIndex)`.
  - Background:
    - Same pattern via `backgroundBaseIndexes`.

**Insert mode**

- `dragMode === "insert"` with `insertPosition` `"before"`/`"after"`:
  - Computes a `targetIndex` in view space, adjusting for:
    - Whether dropping “after” the target.
    - Whether the dragged index is before or after the target (to avoid off-by-one on removal).
  - Maps `draggedIndex` and `targetIndex` through `foregroundBaseIndexes`/`backgroundBaseIndexes` to palette indices.
  - Computes `insertionIndex` in palette space (adjusting when the target index moves because an item was removed).
  - Calls `onReorderColors(fromIndex, insertionIndex)`.

**Deleting via the floating trash bucket**

- When any header is being dragged (`isAnyHeaderDragging`), a fixed-position “Delete” bucket appears in the bottom-right.
- `handleDropOnTrash`:
  - Determines `baseIndex` by mapping `draggedFgIndex` or `draggedBgIndex` through the base-index arrays.
  - Calls `onColorEdit?.(-1)` to clear editing.
  - Calls `onRemoveColor?.(baseIndex)` to remove the colour from the palette.
- Hovering the bucket:
  - `isDragOverTrash` + a timeout drive the animated state (border style, icon size, label text).

**Grid-level drop handling**

- The grid container’s `onDragOver` keeps drag state alive when the cursor moves over gaps.
- Each cell’s `onDragOver` / `onDrop` delegates:
  - If `draggedFgIndex !== null`:
    - `handleCellFgDragOver(e, fgIndex)` to update foreground drag mode and insert position.
    - `handleFgDrop(e)` on drop.
  - Else if `draggedBgIndex !== null`:
    - `handleCellBgDragOver(e, bgIndex)` to update background drag mode.
    - `handleBgDrop(e)` on drop.

### 2.5 Visual feedback

- Column hover overlay:
  - `fgOverlayStyle` highlights the entire column (header + cells + add column button) when a foreground header is hovered.
- Row hover overlay:
  - `bgOverlayStyle` highlights the entire row (label + cells) when a background row is hovered.
- Swap highlights:
  - `fgSwapHighlightStyle`/`bgSwapHighlightStyle` draw dashed outlines for swap targets.
- Insert indicators:
  - `fgIndicatorPosition` drives a vertical 1px bar spanning all rows and the add-row area.
  - `bgIndicatorPosition` drives a horizontal 1px bar spanning all columns.

### 2.6 Legacy DnD code under `components/contrast-grid/`

These files represent an older, DnD Kit–based implementation of the contrast matrix interaction:

- `foreground-header.tsx`: uses `useSortable`, `useDroppable`, `DropIndicator`, and `foregroundSlotId`.
- `background-row.tsx`: similar for background rows with `backgroundSlotId`.
- `overlay-indicators.tsx`: draws fixed overlays for foreground/background highlights.
- `types.ts`: defines `VerticalIndicatorPosition`, `HorizontalIndicatorPosition`, and `OverlayStyle`.

**Decision:** treat these as legacy and mark them for removal once the new, shared drag helpers are in place and the matrix uses them consistently.

They will not be extended or reused for new work on the matrix.

---

## 3. Current Color Manager Drag & Drop

Component: `ColorManager` in `components/color-manager.tsx`

### 3.1 Data model & grouping

- Input: `colors: ColorSwatch[]` from `ContrastChecker`.
- Colours are converted to a legacy string representation and grouped via:
  - `groupColorsByCategory(colors: string[]): Map<string, ColorWithName[]>`.
  - Each `ColorWithName` has `name`, `hex`, and `originalIndex`.
- Group names are case-insensitive in logic but preserve casing for display.
- Rendering:
  - Each group becomes a `GroupSection`, which contains:
    - A `GroupHeader`.
    - A grid of `ColorCard`s.
    - An “Add color” button within the group.

### 3.2 Card-level drag state

- Index-based state:
  - `draggedIndex`, `dragOverIndex`: indices into the flattened `colors` array.
  - `dragMode`: `"swap" | "insert" | null`.
  - `insertPosition`: `"before" | "after" | null`.
- Group awareness:
  - `dragOverGroup`: which group’s grid we are currently over.
  - Group membership is encoded in the label (`groupName/...`), driven by `updateColorGroup`.
- UI state:
  - `isAnyCardDragging`.
  - New/trash/between-zone flags:
    - `isDragOverNewGroup`, `isDragOverTrash`, `isBetweenZonesActive`.
  - Insert indicator:
    - `indicatorPosition: DragIndicatorPosition | null` for a vertical line rendered inside the group grid.
  - Animation state:
    - `justDropped`, `droppedAtIndex`.
    - `poppingCardIds` for delete animations.
  - `cardRefs: Map<number, HTMLDivElement>` to:
    - Check if a card is comfortably visible.
    - Anchor scroll/snaps.

### 3.3 Card drag behaviours

**Drag entry**

- The main `ColorCard` container is draggable:
  - `draggable` on the card root; `onDragStart`, `onDragEnd`, `onDragOver`, `onDragLeave` are passed as props.
- Each card also has a reusable `DragHandle` (`components/ui/drag-handle.tsx`):
  - This visually communicates the drag affordance and forwards drag events to the same handlers.

**Mode selection (swap vs insert)**

- `handleDragOver(e, index)` uses the pointer’s x-position:
  - Left band `< 25%` of width ⇒ `"insert"` before.
  - Right band `> 75%` ⇒ `"insert"` after.
  - Middle band ⇒ `"swap"`.
- This is conceptually the same as the matrix, but using 25/75 instead of 20/80.

**Drop handling**

- `handleDrop(e)` considers `dragMode`:
  - `dragMode === "swap"`:
    - Swaps the two colours in the `colors` array.
    - If the groups differ, updates group labels for both colours using `updateColorGroup`, ensuring:
      - Group membership changes follow the target’s group.
  - `dragMode === "insert"`:
    - Removes the dragged colour, computes `targetIndex` with before/after adjustments, and re-inserts it.
    - If the move crosses groups, updates the group label of the dragged colour to match the target group.
  - In both cases:
    - Uses `onBatchUpdateColors` to update all swatches in one call.
    - Calls `triggerCardSnapIllusion` to ensure the card remains visible and, for cross-group moves, to apply a “snap illusion” as it appears in the new group.
- Insert-zone helpers:
  - `handleInsertZoneHover(targetIndex, targetGroup, position)` is called by `ColorCard`’s before/after insert zones.
  - This updates `dragMode`, `insertPosition`, `dragOverIndex`, `dragOverGroup`.
  - Adjacent moves are treated as no-ops to avoid jitter.

### 3.4 Group-level drag behaviours

- Group drag state:
  - `draggedGroup`, `dragOverGroupName`.
  - `groupDragMode`: `"swap" | "insert" | null`.
  - `groupInsertPosition`: `"before" | "after" | null`.
  - `groupDragPointerRef`, `groupSectionRectsRef`, `groupSectionRectsDirtyRef`.
  - `lastGroupIntentRef`, `groupDeadzoneLockRef`.
  - `areGroupsCollapsedForDrag`, `newlyCreatedGroups`, `removingGroups`.
- Drag entry:
  - The `GroupHeader` component exposes `onDragStart`/`onDragEnd` wired to a grip icon.
  - `handleGroupDragStart`:
    - Applies a custom drag image.
    - Captures the initial pointer position.
    - Measures all group section rects and caches them.
    - Optionally collapses all groups except the dragged one (controlled by `collapseGroupsDuringGroupDrag` prop from `ContrastChecker`).
    - Sets `draggedGroup` and clears previous modes.
- Intent resolution:
  - A document-level `dragover` handler updates `groupDragPointerRef`.
  - `evaluateGroupDragIntent` compares the pointer to cached group rects:
    - Inside a group:
      - Edge bands near the top and bottom are `"insert"` before/after.
      - The centre area is `"swap"`.
      - A deadzone and lock logic prevent flicker between swap and insert modes.
    - Between groups:
      - Gaps above/below groups are additional insert targets.
  - This updates `dragOverGroupName`, `groupDragMode`, `groupInsertPosition`.
- Drop:
  - `handleGroupDrop`:
    - Reorders `groupOrder` (array of group names) based on swap/insert.
    - Rebuilds a new colours array by concatenating groups in the new order.
    - Calls `onBatchUpdateColors`.
    - Uses `queueGroupScrollAnchor` and `requestGroupSnapPostExpansion` to keep the dragged group visible.
- `GroupSection` surfaces:
  - Top/bottom insert zones (`onInsertZoneDragOver`, `onInsertZoneDrop`).
  - A dashed swap outline when `isGroupDragOver` is true.
  - Card grid width measurement and collapse/expand height animations.

### 3.5 Global drop zones (new group & trash)

- Within `ColorManager`’s bottom area, there is a shared drop zone container with:
  - A “Create new group” zone.
  - A “Move to trash” zone.
- State flags:
  - `isBetweenZonesActive`, `isDragOverNewGroup`, `isDragOverTrash`.
  - A timeout debounces leave events to prevent flicker.
- `handleDropOnNewGroup`:
  - If `draggedIndex` is not null:
    - Infers the hex for the dragged colour.
    - Generates a unique new group name via `getNextGroupName()`.
    - Creates or updates the label to move the colour into the new group.
    - Calls `onUpdateColor` and `triggerCardSnapIllusion` with cross-group behaviour enabled.
- `handleDropOnTrash`:
  - Schedules visual deletion via `scheduleCardRemoval`, which:
    - Adds the swatch ID to `poppingCardIds` to drive animation.
    - After the animation delay, calls `onRemoveColor` at the correct index.

### 3.6 Scroll snapping & “snap illusion”

- ColorManager integrates with `lib/scroll-snap.ts`:
  - Uses `scheduleSnap`, `findScrollParent` (aliased as `detectScrollParent`), `Align`, `CancelHandle`.
  - Encapsulated helpers like `scheduleCardViewportSnap`, `queueGroupScrollAnchor`, `requestGroupSnapPostExpansion`.
- `triggerCardSnapIllusion(fromIndex, toIndex, groupName, options)`:
  - For cross-group moves:
    - Queues a group snap after expansion, with snap illusion enabled.
  - For same-group moves:
    - Checks whether the card is already comfortably visible.
    - If not, schedules a delayed snap to bring it into view.
- ContrastGrid does **not** integrate with scroll snap; its animations are local to the grid (keyframe-based zoom/slide) and overlay highlights.

---

## 4. Overlap, Duplication, and Decisions

### 4.1 Shared semantics (swap vs insert)

Both ColorManager and ContrastGrid implement essentially the same 1D drag semantics:

- A single dragged index and a potential drop index.
- Two modes:
  - `"swap"` → exchange the positions of two items.
  - `"insert"` → remove from original position and reinsert before/after a target.
- Insert positions:
  - `"before"` and `"after"` around the target index.

Differences:

- Thresholds:
  - ColorManager: 25%/75% bands for swap vs insert.
  - ContrastGrid: 20%/80% bands.
- Group awareness:
  - ColorManager is group-aware and updates labels to reflect group moves.
  - ContrastGrid is flat; groups are used only for filtering options.

**Decision:** standardise on **20/80 thresholds** for swap vs insert across both components, using this as the canonical behaviour.

### 4.2 Indicator types and geometry

- ColorManager:
  - Uses `DragIndicatorPosition` (left, top, height) to draw a vertical insert line within a group grid.
  - Indicator placement is derived from the target card’s rect and container rect, with clamping at grid edges.
- ContrastGrid:
  - Uses separate `fgIndicatorPosition` / `bgIndicatorPosition` with loosely similar shapes:
    - Foreground: vertical bar spanning all rows + add row.
    - Background: horizontal bar spanning all columns.
  - `VerticalIndicatorPosition` / `HorizontalIndicatorPosition` types exist in `components/contrast-grid/types.ts` but are not wired into `ContrastGrid`.

**Decision:** introduce a shared indicator representation and helpers, and reuse those from both ColorManager and ContrastGrid. Indicator computation will live in a shared helper module rather than inline effects.

### 4.3 Delete behaviours

- Both systems provide a drag-to-delete pathway:
  - ColorManager: via a trash zone in the bottom drop-strip.
  - ContrastGrid: via a floating bottom-right “Delete” bucket.
- Both:
  - Activate only while a drag is in progress.
  - Use leave timeouts to avoid flicker.
  - Map from local drag index to an underlying palette index before calling remove.

**Decision:** keep the **floating trash bucket UX for the contrast matrix** and the inline trash zone for ColorManager, but consolidate the underlying event/timeout pattern into a shared helper/component.

### 4.4 DnD infrastructure

- ColorManager:
  - HTML5 drag events only (no DnD Kit).
  - Uses `DragHandle` for consistent visual handles.
- ContrastGrid:
  - Current matrix drag uses HTML5 events (similar to ColorManager).
  - Legacy implementation uses `@dnd-kit/core`, `@dnd-kit/sortable`, and `DropIndicator`, backed by `lib/dnd-utils.ts`.

**Decision:** treat the DnD Kit–based matrix implementation as **legacy pending removal**:

- We **will not** reintroduce DnD Kit for the matrix as part of this uplift.
- We **will not** extend the legacy `foreground-header.tsx` / `background-row.tsx` / `overlay-indicators.tsx` for new work.
- Once shared HTML5-based drag helpers exist and are in use, the legacy files can be removed or moved into a separate `legacy/` area.

---

## 5. Transition Plan

### 5.1 Centralise 1D drag semantics

Introduce a small shared helper for index-based drag semantics:

- New module (example name): `lib/index-dnd.ts`.
- Responsibilities:
  - Define a shared state shape for 1D drag:
    - `{ draggedIndex, dragOverIndex, dragMode, insertPosition }`.
  - Provide utilities:
    - `computeDragMode(pointerRatio, insertThreshold = { before: 0.2, after: 0.8 })` → `"swap"` vs `"insert"` + position.
    - `computeInsertTargetIndex({ draggedIndex, dragOverIndex, insertPosition, length })` → target index in view space with adjacency and off-by-one handling.
    - `computePaletteIndices({ baseIndexes, draggedIndex, targetIndex, insertPosition })` → `fromIndex`/`toIndex` in palette space.
  - Configurability:
    - Thresholds default to 20%/80% but can be overridden for specific contexts if needed.

Integration steps:

1. **ColorManager**
   - Replace inline threshold and index adjustment logic in:
     - `handleDragOver(e, index)`.
     - `handleDrop(e)`.
   - Adopt 20/80 thresholds to match the shared helpers.
2. **ContrastGrid**
   - Replace inline logic in:
     - `handleFgDragOver` / `handleFgDrop`.
     - `handleCellFgDragOver`.
     - `handleBgDragOver` / `handleBgDrop`.
     - `handleCellBgDragOver`.
   - Ensure all mapping to/from `foregroundBaseIndexes` and `backgroundBaseIndexes` goes through the shared helpers, not hand-rolled logic.

### 5.2 Shared indicator helpers

Introduce a shared indicator helper:

- New module (example name): `lib/dnd-indicators.ts`.
- Responsibilities:
  - Given:
    - A container rect, a target item rect, insert position, item count, and gap.
  - Return:
    - For vertical indicators: `{ left, top, height }`.
    - For horizontal indicators: `{ left, top, width }`.
  - Apply clamping at container edges and safe insets to avoid cropping.

Integration steps:

1. **ColorManager**
   - Replace the inline logic that computes `indicatorPosition` for insert mode with calls into `lib/dnd-indicators.ts`.
   - Continue using `DragIndicatorPosition` as the runtime type, but have it originate from the shared helper.
2. **ContrastGrid**
   - Replace `fgIndicatorPosition` and `bgIndicatorPosition` computations with calls into the same helper.
   - Remove or adapt `VerticalIndicatorPosition` / `HorizontalIndicatorPosition` in `components/contrast-grid/types.ts` to align with the shared representation.

### 5.3 Reusable drop-to-trash behaviour

Extract the shared pattern for drag-to-delete:

- New component (example name): `components/dnd/drop-to-trash.tsx`.
- Props:
  - `active: boolean` — whether any drag is active.
  - `onDrop: () => void` — invoked when a dragged item is dropped on the trash.
  - `variant?: "inline" | "floating"` — inline (ColorManager-style) or fixed bottom-right (matrix-style).
  - Optional label overrides and icon overrides for styling differences.
- Responsibilities:
  - Maintain `isDragOver` state with a leave timeout to avoid flicker.
  - Expose `onDragOver`, `onDragLeave`, `onDrop` handlers to be attached where needed.
  - Render the appropriate visual treatment based on `variant`.

Integration steps:

1. **ContrastGrid**
   - Replace the existing bottom-right bucket implementation with `DropToTrash variant="floating"`.
   - Pass in `active={isAnyHeaderDragging}` and a callback that:
     - Maps `draggedFgIndex` / `draggedBgIndex` to a palette index.
     - Calls `onColorEdit?.(-1)` and `onRemoveColor?.(baseIndex)`.
2. **ColorManager**
   - Optionally wrap the trash zone in `DropToTrash variant="inline"` while preserving the current “New group” zone logic.

### 5.4 Standardise drag handle UI

- Adopt `DragHandle` (`components/ui/drag-handle.tsx`) wherever possible:
  - In `ColorCard` (already in use).
  - In `ContrastGrid` for:
    - Column header handles.
    - Row header handles.
- This consolidates:
  - Visual treatment (inline vs pill).
  - Cursor behaviour (grab/grabbing).
  - Hover/active highlight states via `highlighted` prop.

### 5.5 Legacy DnD Kit code path

After the above refactors:

- Mark the following as legacy:
  - `components/contrast-grid/foreground-header.tsx`
  - `components/contrast-grid/background-row.tsx`
  - `components/contrast-grid/overlay-indicators.tsx`
  - `components/contrast-grid/types.ts` (for DnD-specific types)
- Plan to:
  - Remove or move them to a `legacy/` folder after:
    - ContrastGrid uses the shared HTML5-based helpers.
    - There is enough confidence that no code path depends on them.
- `lib/dnd-utils.ts` and `components/dnd/drop-indicator.tsx` can remain if needed for future DnD Kit usage elsewhere, but are not part of the ContrastGrid uplift path.

---

## 6. Non-goals and Behaviour to Preserve

**Non-goals for this uplift**

- Introducing `DndContext` or making ColorManager depend on DnD Kit.
- Changing the overall layout of the matrix or ColorManager.
- Changing contrast-calculation or filter logic in `ContrastGrid`.
- Changing scroll snapping behaviour in `ColorManager`.

**Behaviours to preserve**

- ContrastGrid:
  - Independent reordering of rows and columns.
  - Swap vs insert semantics, including cell-based drop.
  - Floating Delete bucket UX for removing colours.
  - Existing zoom/slide animations when reordering.
- ColorManager:
  - Group-level swap/insert semantics for groups.
  - Card-level swap/insert semantics with cross-group moves.
  - Group rename, new-group creation, and trash flows.
  - Scroll snap & “snap illusion” behaviours for cards and groups.

Once the shared helpers are in place and both components use them, future drag-and-drop enhancements (e.g. new behaviours, tuning, accessibility work) can be implemented once and adopted by both ColorManager and ContrastGrid with minimal duplication.

