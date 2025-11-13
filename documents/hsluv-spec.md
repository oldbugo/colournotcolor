## HSLuv + HPLuv: Single Source of Truth (Spec + Implementation Plan)

### Intent
HSLuv/HPLuv are provided to help users pick colours more intuitively. HEX remains the canonical asset for developer handoff and storage. All conversions happen at the UI boundary, and the contrast logic continues to use HEX/RGB.

---

### Summary
- Add first‑class support for HSLuv and HPLuv alongside existing HEX editing.
- Provide an embedded, dependency‑free TypeScript port for conversions to/from RGB/HEX.
- Add a per‑swatch three‑way toggle: `HEX | HSLuv | HPLuv`.
- Accept percentage input for S and L; display values with decimals.
- Keep HEX as the single source of truth for storage and handoff.

---

### Goals
- Accurate, reference‑matching conversions for HSLuv and HPLuv.
- Non‑disruptive UI: HEX remains default; users can temporarily switch to HSLuv/HPLuv while editing.
- Robust parsing/formatting: accept `hsluv()/hpluv()` functional syntax, spaces or commas, with `%` for S/L.
- Predictable copy behaviour based on the active mode.

### Non‑Goals
- Changing persisted palette schema.
- Replacing existing OKLCH CSS tokens.
- Persisting the chosen mode beyond the current editing context.

---

### Architecture
- Embedded TS port in `lib/hsluv.ts` (no external dependency) exporting both HSLuv and HPLuv APIs.
- UI changes limited to `components/color-manager/color-card.tsx` (and any small utilities).
- `lib/contrast-utils.ts` remains unchanged and continues to operate on HEX/RGB.

---

### Public API (TypeScript)
```ts
// lib/hsluv.ts
export type Hsluv = { h: number; s: number; l: number }

export function hsluvToRgb(h: number, s: number, l: number): [number, number, number]
export function rgbToHsluv(r: number, g: number, b: number): [number, number, number]
export function hsluvToHex(h: number, s: number, l: number): string
export function hexToHsluv(hex: string): [number, number, number]

export function hpluvToRgb(h: number, s: number, l: number): [number, number, number]
export function rgbToHpluv(r: number, g: number, b: number): [number, number, number]
export function hpluvToHex(h: number, s: number, l: number): string
export function hexToHpluv(hex: string): [number, number, number]

export function clampHsluv(v: Hsluv): Hsluv
export function roundHsluv(v: Hsluv, decimals?: number): Hsluv

// UI helpers
export function parseHslString(input: string, kind: 'hsluv' | 'hpluv'): Hsluv | null
export function formatHslString(v: Hsluv, kind: 'hsluv' | 'hpluv', decimals?: number): string
```

Contracts
- Input ranges: `h ∈ [0, 360)`, `s,l ∈ [0, 100]`.
- Hue wraps to `[0, 360)`; saturation/lightness clamp to `[0, 100]`.
- `rgb` returns integers in `[0, 255]`; `hex` is uppercase `#RRGGBB`.

---

### Parsing and Formatting
- Accept inputs as:
  - `210 65% 52%`
  - `210,65%,52%`
  - `hsluv(210 65% 52%)` / `hpluv(210 65% 52%)`
- S and L accept optional `%` in input; output always formatted with `%`.
- Display decimals: default 2 decimal places; clamp and round consistently.
- Invalid inputs: show inline error; do not commit.

---

### UI Behaviour (Color Card)
- Toggle: `HEX | HSLuv | HPLuv` rendered near the existing HEX control.
- HEX mode: current behaviour unchanged; copy copies `RRGGBB` (no `#`) as today.
- HSLuv/HPLuv modes:
  - Show a single input for H, S, L; accepts formats above.
  - On save (Enter or explicit action), convert to HEX and update the swatch.
  - Copy action provides `hsluv(H S% L%)` / `hpluv(H S% L%)` with decimals.
- The mode toggle is transient (not persisted) and scoped to the active edit.

---

### Storage & Contrast
- `types/palette.ts` unchanged; `ColorSwatch.hex` remains canonical.
- Contrast functions continue to consume HEX/RGB; no behavioural change expected.

---

### Acceptance Criteria
- Conversions
  - `hex → hsluv → hex` and `hex → hpluv → hex` roundtrip to the original hex (case‑insensitive) for a representative set.
  - Numeric roundtrip tolerance within ±0.5 for H/S/L.
  - Matches official reference vectors for ≥ 10–20 test colours (black, white, greys, primaries, edge hues).

- UI
  - Toggling modes updates the view without committing until save.
  - Percentage input for S/L works with spaces or commas; functional syntax tolerated.
  - Readouts and copied strings show decimals (2 dp) consistently.
  - Keyboard: Enter saves; Escape cancels; focus mirrors current HEX editor.

- Performance
  - No noticeable lag on toggling or editing.

---

### Implementation Plan (Phased)
1) Utilities (core)
- Implement embedded `lib/hsluv.ts` with APIs for HSLuv and HPLuv.
- Add `parseHslString` and `formatHslString` helpers; clamp/round utilities.
- Create `documents/hsluv-test-cases.md` with reference vectors (or unit tests if test harness exists).

2) UI Integration (standard)
- Add three‑way toggle and mode‑aware editor to `components/color-manager/color-card.tsx`.
- Wire save/cancel to convert back to HEX and update swatch.
- Mode‑aware copy implementation.

3) Optional Enhancements
- HSLuv/HPLuv slider controls; palette generators (harmonies, stepped hues).

---

### Risks & Mitigations
- Accuracy drift from the reference: adopt official constants; add golden tests.
- UX complexity from three modes: default to HEX; concise labels; preserve existing flows.
- Input edge cases: robust parsing; clear error styles; clamp/wrap as specified.

---

### QA Checklist
- Verify toggle behaviour per card; ensure no cross‑contamination of mode state.
- Paste inputs with extra spaces/commas/% and confirm parsing.
- Validate copied outputs per mode.
- Confirm contrast grid unchanged for identical visual colours.

---

### References
- HSLuv project: https://github.com/hsluv/hsluv
- Reference algorithm (Haxe): https://github.com/hsluv/hsluv-haxe

