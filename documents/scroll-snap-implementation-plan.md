## Implementation Plan: Scroll Snap & Illusion (Groups + Cards)

This plan translates the feature requirements in `documents/scroll-snap-spec.md` into concrete refactors, APIs, and phased delivery tasks.

---

### 1) Success Criteria (maps to US1–US9)
- Card and group snaps are deterministic, edge‑aware, and minimize animation.
- Oversized groups: the card remains visible without forced centering unless necessary.
- Illusion used only for large jumps, with small in‑direction flourish and reduced‑motion respected.
- Interruptions (wheel/touch) cancel ongoing animations/snaps cleanly.
- No ghost animations: all RAF/timeouts are tracked and cleared.

---

### 2) Architecture & Modules

Create a dedicated scroll-snap orchestration module to centralize logic and reduce coupling:

- New file: `lib/scroll-snap.ts` (pure, no React imports). Exposes:
  - `findScrollParent(root: HTMLElement | null): HTMLElement | null`
  - `measureRect(node: Element): DOMRect` (safe wrapper)
  - `ensureGroupVisibility(opts): Promise<boolean>`
  - `ensureCardVisibility(opts): Promise<boolean>`
  - `scheduleSnap(request: SnapRequest): CancelHandle`
  - `runSnapIllusion(delta: number, opts?: IllusionOptions): void`

Keep all low‑level concerns here (rect math, thresholds, margins, jump/illusion rules).

React components (ColorManager, GroupSection) consume these via small adapters/hooks.

---

### 3) Core APIs

Types (pseudocode):

- Align: "auto" | "top" | "bottom"
- PreferredEdge: "top" | "bottom" | null
- VisibilityMargins: `{ card: number, group: number, nudge: number }`
- IllusionOptions: `{ skip?: boolean, jumpThresholdPx?: number, amplitudePx?: { min, max }, durationMs?: { min, max } }`
- GroupSnapOptions: `{ root, target, scrollParent?, align?, margins?, illusion?, force? }`
- CardSnapOptions: `{ root, card, group?, scrollParent?, preferredEdge?, margins?, allowCenter?, illusion? }`
- SnapRequest: `{ kind: "group", opts: GroupSnapOptions } | { kind: "card", opts: CardSnapOptions }`
- CancelHandle: `{ cancel(): void }`

Behaviors:
- ensureGroupVisibility:
  - Visible iff group top-left ≥ top margin AND bottom-right ≤ bottom margin (from spec).
  - If not visible, smoothly scroll to align group top (header) by default.
  - If distance > jumpThresholdPx, perform an instant jump followed by a small, in‑direction illusion.
  - Returns true when a movement occurred; false if no move.

- ensureCardVisibility (edge‑aware):
  - Compute visible band using card margins and nudge band.
  - If card fits between margins:
    - Try to align to preferred group edge (top when moving from above, bottom when moving from below) only if that keeps card in view.
    - If preferred edge not feasible, try the opposite edge.
    - Else nudge so the card sits comfortably within the nudge band (no centering unless necessary).
  - If card cannot fit between margins: center once; illusion skipped.
  - Use smooth scrolling for short distances; use jump + small flourish when distance > threshold.

- scheduleSnap:
  - Accepts a request, performs preconditions (find scroll parent, measure rects), applies US rules, schedules RAF‑bounded retries (e.g., max 8 attempts), and exposes cancel().
  - Adds global interruption listeners (wheel/touch) to abort.
  - Ensures all timers/RAFs are tracked and cleared.

---

### 4) Integration Plan (Codebase)

Refactor touchpoints in `components/color-manager.tsx`:
1. Replace direct calls to the current `scheduleCardViewportSnap`, `snapGroupIntoViewNextFrame`, and raw illusion calls with the new `scheduleSnap` orchestrations.
2. Where we decide preferred edge (based on fromIndex → toIndex, and group order changes), derive `preferredEdge` and pass to `ensureCardVisibility`.
3. For new group creation (pending swatch id), treat as US1 cross‑group move and route through the same scheduler.
4. For within‑group moves, if card already generally visible, perform a nudge only when in the nudge band; otherwise do nothing.
5. Wire interruption handlers centrally (single registration per active snap). Ensure cleanup on component unmount.

In `components/color-manager/group-section.tsx`:
- Keep layout/height observers as is, but remove illusion‑class side effects that compete with the new scheduler.

In `lib/scroll-snap.ts` (new):
- Implement core math and scrolling primitives:
  - get/set scrollTop, smooth tween (with reduced‑motion opt‑out), instant jump, delta clamp.
  - rect helpers: in‑view tests for edges, can‑fit checks, nudge calculations.
  - illusion: small amplitude flourish with clamped duration/amplitude derived from distance.

---

### 5) Configuration Defaults & Flags
- margins: `{ card: 48, group: 16, nudge: 28 }` (tunable).
- jumpThresholdPx: 420 (initial; test/tune).
- illusion.amplitudePx: `{ min: 4, max: 18 }` with amplitude ≈ clamp(sqrt(|delta|) * k).
- illusion.durationMs: `{ min: 160, max: 220 }` with light ease curves.
- maxAttempts: 8 frames per snap cycle.
- All honor `prefers-reduced-motion`.

---

### 6) Phased Delivery
Phase A: Foundation
- Add `lib/scroll-snap.ts` with primitives (find parent, rects, smooth/jump, illusion).
- Add `scheduleSnap` and the two visibility helpers with unit‑style utilities (pure functions).
- Feature flag: `SCROLL_SNAP_V2=true` environment/constant.

Phase B: Card Snap (US1, US2, US3)
- Integrate card edge‑aware alignment in `ColorManager` drop paths.
- Implement preferred edge derivation from movement direction.
- Remove old per‑card illusion usage; use illusion only for large jumps.

Phase C: Group Snap (US4)
- Route group reorder and group‑targeted drops through `ensureGroupVisibility`.
- Ensure post‑group alignment calls `ensureCardVisibility` when a specific card is relevant.

Phase D: Interruption, Cleanup, Reduced Motion (US5–US9 renumbered)
- Global interrupt listeners during active snaps; verified cancellation.
- Centralized RAF/timeout tracking with strong cleanup semantics.
- Honor `prefers-reduced-motion` across helper functions.

Phase E: Remove Legacy Paths
- Delete or gate legacy illusion/jump logic scattered across components.
- Consolidate constants in a config module.

---

### 7) Test Plan (Manual + Automated Spots)
- Within same group: near‑top, near‑bottom, mid‑list; verify no movement unless in nudge band.
- Across groups: bottom→top and top→bottom; verify edge preference and fallback.
- Oversized group: ensure card is visible, centered only when necessary.
- Large distance: verify jump + small flourish; small distance: smooth scroll without flourish.
- Reduced motion: no flourish / minimal motion.
- Interrupt during snap: immediate cancel, no ghost animations.

---

### 8) Risks & Mitigations
- Race conditions with rapidly changing layout: mitigate via short retry loop (RAF capped), and snapshot rects per cycle.
- Over‑scroll when using jump + flourish: clamp amplitude/duration and directionally align only once.
- Regression in existing drag UX: roll out behind `SCROLL_SNAP_V2` flag and stage by phase.

---

### 9) Task Breakdown (high level)
1. Add `lib/scroll-snap.ts` with primitives and illusions.
2. Implement `ensureGroupVisibility`, `ensureCardVisibility`.
3. Implement `scheduleSnap` (queue, cancel, interrupts, attempts).
4. Integrate card paths (US1/US2/US3) into `ColorManager`.
5. Integrate group paths (US4) into `ColorManager`.
6. Add reduced‑motion handling and remove legacy illusion calls.
7. Tune thresholds (jump, margins, nudge) via manual tests.
