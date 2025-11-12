## Feature: Scroll Snap & Illusion (Groups + Cards)

### Summary
Unify and simplify scrolling behavior after drag-and-drop operations for cards and groups. Ensure the final position brings the relevant target into view with minimal, purposeful animation. Prefer real scrolling; use the snap “illusion” only when scrolling is infeasible. Handle tall groups and interrupted interactions gracefully.

### Goals
- Deterministic visibility of the target (card or group) after moves.
- Predictable alignment: prefer top/bottom, center only when the card cannot fit.
- Minimize animation; illusion used sparingly and never chains.
- Consistent behavior across card moves, group reorders, and new-group creation.

### Non‑Goals
- Do not force entire tall groups into view.
- Do not introduce additional animation layers if real scrolling will suffice.

### Definitions
- Scroll Parent: The nearest scrollable container.
- Viewport Margin: Padding for visibility checks (defaults: Cards 48px, Groups 16px).
- Snap Illusion: A transient translation effect applied only when real scrolling isn't viable.
 - Group Edge Alignment: Aligning the viewport to the group header/top or the group bottom edge (not necessarily the card’s top-left).
 - Nudge Band (Comfort Band): A small safety offset (e.g., 24px–32px) from the viewport edges to avoid placing the card uncomfortably tight to an edge when neither group edge can be made visible.

---

## User Stories & Acceptance Criteria

### US1: Card moved across groups (edge‑aware)
As a user, when I drop a card into another group, I want the viewport to snap to a sensible group edge based on where I came from, and I want the card to end clearly in view.

Acceptance
- Evaluate the card’s final position relative to the viewport margins (top/bottom) regardless of the destination group.
  - If the card sits comfortably between the margins, do not move the viewport.
  - If the card is outside the margins or inside the nudge band near either edge, gently scroll until the card lands on the safe side of the band (top margin + nudge, bottom margin – nudge).
  - If the card cannot fit inside the margins, center it once and stop.
- Suppress the illusion unless the container cannot scroll.

### US2: Card within the same group (minimal movement)
As a user, when I drop a card within its current group and it’s already generally in view, I don’t want any unnecessary scrolling or animations.

Acceptance
- If the card is already within the viewport and not within the Nudge Band from either edge, do not scroll at all (no animation).
- If the card is too close to the top or bottom edge, gently nudge the scroll so the card sits inside the Nudge Band.
- If the card cannot fit between margins, center vertically once and skip the illusion.
- Always suppress the illusion for within‑group moves.

### US3: New group creation / drop to "New group"
As a user, when I create a group or drop onto the new‑group zone, I want the behavior to be the same as moving a card across groups.

Acceptance
- Functionally identical to US1 (margin-aware alignment):
  - Place the resulting card within the viewport margins/nudge band using the same rules as a standard cross-group drop.
- Avoid chained animations; suppress the illusion if real scrolling occurs.

### US4: Group reorder
As a user, when I reorder groups, I want the target group visible predictably.

Acceptance
- A group is considered fully in view only if its top-left is within the top margin and its bottom-right within the bottom margin.
- If not in view, scroll to reveal the group header/top.
- Apply illusion only if a large instant jump occurs and no user input interrupts.

### US5: Illusion rules
As a user, I don't want distracting bounce animations.

Acceptance
- Prefer natural smooth scrolling when the required scroll distance is small.
- If the required scroll distance exceeds a configurable jump threshold, perform a jump (instant scroll) to the target and follow with a small, brief scroll animation in the direction of travel to create the illusion of continuous motion.
- The illusion's amplitude and duration are minimal, clamped, and proportional to distance (e.g., amplitude ~ sqrt(delta) within a small range; duration ~160–240ms).
- Respect reduced-motion; suppress illusions and minimize transitions when enabled.
- A `skipSnapIllusion` flag is available to force suppression.

### US6: Interruption & cleanup
As a user/developer, I want safe interruption and no leaks.

Acceptance
- Wheel/touch interrupts cancel pending snaps/illusions immediately.
- All RAF/timeouts are tracked and cleared on unmount and cancellation.

### US7: Scroll parent detection
As a developer, detect the correct container reliably.

Acceptance
- Walk ancestors for overflow-y auto/scroll; fallback to document.scrollingElement; cache per session; revalidate when root changes.

### US8: Accessibility & motion
As a user, reduce motion when requested.

Acceptance
- Respect `prefers-reduced-motion`; avoid illusions and minimize transitions.

### US9: Performance guard rails
As a developer, keep behavior bounded and responsive.

Acceptance
- Limit alignment attempts (e.g., 8 frames). Reuse rects within a scheduling cycle.

---

## Implementation Guidance
- Provide a single scheduler capable of:
  - Optional group pre-alignment when required by visibility rules (prefer group top edge).
  - Margin-aware card alignment: keep the dropped card between the viewport margins, nudging only when it is outside or too close to an edge; center only when the card cannot fit in the allowed band.
  - Suppressing illusions by default; opt-in only for large instant jumps without follow-up alignment.
- Options to expose:
  - `skipSnapIllusion: boolean` for suppression.
  - Group snap: `force`, `align: "auto" | "top" | "bottom"`.
  - `nudgeBandPx: number` (default 24–32) to control how far from edges we keep the card when neither edge can be shown.

### Configurables (defaults)
- Card viewport margin: 48px.
- Group viewport margin: 16px.
- Nudge band: 24–32px.
- Smooth scroll duration: 260-320ms; honor reduced-motion.
- Max alignment attempts: 8 frames.

This feature requirement supersedes prior notes and is the single source of truth for rebuilding the scroll snap & illusion system.









