## APCA Contrast Mode: Spec & Implementation Plan

_Last updated: 2025-11-20_

---

### 1. Intent

Introduce APCA (Accessible Perceptual Contrast Algorithm) as an additional contrast evaluation mode alongside the
existing WCAG 2.x contrast ratio, so designers can:

- Explore palettes under either WCAG 2.x (ratio) or APCA (Lc).
- See how a given colour pair behaves under both models.
- Switch standards without breaking existing workflows, storage, or UI mental models.

WCAG 2.x stays as the default; APCA is an opt‑in, alternative contrast view.

---

### 2. Summary

- Add a global `contrastStandard` toggle: `WCAG 2.x (ratio)` ↔ `APCA (Lc)`.
- Implement APCA 0.0.98G‑4g‑base‑W3 as a separate utility (`lib/apca.ts`) operating on HEX/RGB.
- Extend `ContrastGrid` to:
  - Use the selected standard when computing contrast.
  - Display either ratio (`4.5:1`) or APCA lightness contrast (`Lc 75`).
  - Use APCA‑specific readability bands (minimum/preferred) instead of AA/AAA when APCA is active.
- Keep existing WCAG requirement presets (`Non-text`, `Large text`, `Normal text`) but:
  - Interpret thresholds per standard:
    - WCAG: existing AA/AAA ratio thresholds.
    - APCA: Lc thresholds derived from APCAeasyIntro and ARC conformance guidance.
- Persist the chosen standard in localStorage and thread it through the UI.

---

### 3. Goals

- **Dual standards**  
  Support both WCAG 2.x ratio and APCA Lc, switchable per user, with no schema changes.

- **APCA‑authentic behaviour**  
  Base APCA thresholds on APCA’s own readability levels (Lc 15–90) and range‑based scoring, not on back‑mapping from WCAG numbers.

- **Clear semantics**  
  Make it obvious which standard is active, what the numeric value is, and how it relates to readability guidance.

- **Non‑disruptive**  
  When WCAG mode is selected, behaviour should be indistinguishable from today.

- **Extensible**  
  Encapsulate contrast computation so future standards (updated APCA, WCAG 3) can plug in.

---

### 4. Non‑Goals

- Replacing WCAG 2.x as the primary standard for contrast.
- Implementing full APCA typographic lookup tables or dynamic font‑weight conformance logic.
- Changing colour storage (`ColorSwatch`, `ColorPalette`) or any non‑contrast colour math (e.g. HSLuv).
- Providing a full APCA training experience in‑app (we link out instead).

---

### 5. Background

#### 5.1 Current contrast behaviour (WCAG mode)

- Contrast is computed using WCAG 2.x relative luminance:
  - `lib/contrast-utils.ts`:
    - `calculateContrast(color1, color2): number` → ratio (for example, `4.5`).
    - `getWCAGLevel(ratio, thresholds)` → `{ aa: boolean; aaa: boolean }`.
- `ContrastGrid` (`components/contrast-grid.tsx`) currently:
  - Calls `calculateContrast(fgHex, bgHex)` for each cell.
  - Uses `getWCAGLevel(ratio, activeRequirement.thresholds)` to decide AA/AAA/FAIL.
  - Uses three requirement presets:
    - **Non-text** → AA 3:1, no AAA.
    - **Large text** → AA 3:1, AAA 4.5:1.
    - **Normal text** → AA 4.5:1, AAA 7:1.
- UI:
  - “Requirement focus” dropdown + slider chooses a preset.
  - Cells show ratio plus AA/AAA/FAIL badges.

#### 5.2 APCA overview (what we are implementing)

- APCA is a perceptual contrast predictor for self‑illuminated RGB displays and a candidate for WCAG 3.
- We implement the W3 base formula (`APCA-W3-LaTeX.md`), using:
  - APCA Contrast Prediction Equation 0.0.98G‑4g‑base‑W3.
  - APCA‑W3 version 0.1.9.
  - sRGB constants (0.0.98G‑4g‑sRGB), including:
    - `Strc = 2.4`, `Ntx = 0.57`, `Rtx = 0.62`, `Nbg = 0.56`, `Rbg = 0.65`.
    - `Bclip = 1.414`, `Bthrsh = 0.022`, `Wscale = 1.14`, `Woffset = 0.027`, `Wclamp = 0.1`.
- Output:
  - A signed lightness contrast value `Lc` (APCA notation `L^c`):
    - Positive `Lc` → dark text on light background (normal polarity).
    - Negative `Lc` → light text on dark background (reverse polarity).
    - Magnitude (`|Lc|`) roughly corresponds to perceived readability.

#### 5.3 APCA readability levels, content types & conformance bands

APCAeasyIntro, together with the ARC “Visual Readability Contrast” criterion and conformance docs, defines:

- **Lc readability levels (high‑level)**
  - `Lc 90` – Preferred level for fluent text and columns of body text (around 14 px/400 and up).
  - `Lc 75` – Minimum level for columns of body text (around 18 px/400 and up).
  - `Lc 60` – Minimum for content text that is not body/column text but that you still want people to read, e.g. larger labels (around 24 px/400 or 16 px/700).
  - `Lc 45` – Minimum for larger, heavier text, such as big headings and pictograms with fine detail.
  - `Lc 30` – Absolute minimum for other text and large/solid semantic non‑text.
  - `Lc 15` – Absolute minimum for non‑text that merely needs to be discernible; below this many users will not see it.

- **Content types / use‑cases**
  - **Body text / block fluent** – Columns of more than two lines of primary content.
  - **Fluent (non‑body)** – Up to about 2.5 lines of primary content such as headlines, captions, primary navigation, tool‑tips, “continued…” labels, and user‑entered form text.
  - **Large fluent** – Larger headings and similar prominent content where size/weight allow some reduction in contrast.
  - **Sub‑fluent** – Secondary/ancillary content with relaxed readability needs, including some dataviz call‑outs, secondary/tertiary navigation, bylines, footer matter.
  - **Non‑fluent / incidental / spot** – Disabled/placeholder text, purely decorative text, and incidental text in images.

- **Bronze / Silver / Gold conformance levels (ARC “conform”)**
  - **Bronze** – Covers primary content text only; no lookup tables.
    - Body text: minimum `Lc 75`, preferred `Lc 90`.
    - Other content text: minimum `Lc 60` (fonts roughly 16 px or larger).
    - Large fluent content: minimum `Lc 45`, maximum `Lc 90` for very large/bold.
  - **Silver** – Covers all text content; uses lookup tables.
    - Body & fluent: per lookup table; minimum font size around 14 px; large fonts capped at `Lc 90`.
    - Sub‑fluent & logos: per lookup table; contrast may be reduced by up to `Lc 15` but never below `Lc 40`; minimum size around 10 px.
    - Non‑fluent & incidental: per lookup table; contrast may be reduced by up to `Lc 30` but never below `Lc 30`.
  - **Gold** – Enhanced coverage for all text; stricter than Silver.
    - Body & fluent: per lookup table; when used for body text, any contrast below `Lc 75` must be increased by at least `Lc 15`; minimum font size around 16 px; large fonts capped at `Lc 90`.
    - Sub‑fluent & logos: per lookup table; contrast may be reduced by up to `Lc 15` but never below `Lc 45`; minimum size around 12 px.
    - Non‑fluent & incidental: per lookup table; contrast may be reduced by up to `Lc 20` with category‑specific floors.

Key points for this tool:

- APCA contrast is range‑based, not strictly pass/fail.
- Bronze/Silver/Gold describe which content types are covered and how strictly, not three simple global thresholds.
- Our grid is typography‑agnostic, so:
  - We use Bronze “use‑case conformance values for testing” (75/90, 60, 45, 30/15) as our default APCA bands.
  - We treat Silver/Gold primarily as explanatory context and external references, not something we enforce in‑tool.

#### 5.4 Licensing, naming, and conformance

- APCA docs stress that:
  - The base contrast algorithm 0.0.98G‑4g‑base‑W3 must be implemented correctly and unmodified (beyond language porting).
  - Use of the terms “APCA”, “APCA Lc Value”, “APCA Compatible”, and “APCA Compliant” is governed by the minimum_compliance guidance.
- For this tool we aim for behaviour equivalent to “APCA Compatible”:
  - Use the official algorithm and constants.
  - Provide APCA’s Lc levels and a short explanation adjacent to the output.
  - Clearly differentiate between WCAG 2.x ratio and APCA Lc.
  - Link to official APCA documentation and lookup tables.
- If we ever decide not to meet those conditions, the UI copy should be adjusted to use a generic label (for example, “Perceptual contrast (Lc)”) and avoid the “APCA” brand, while still honouring the license.

---

### 6. Architecture & Types

#### 6.1 Contrast standard type

Add a shared type, e.g. in `lib/contrast-utils.ts` or `types/contrast.ts`:

```ts
export type ContrastStandard = "wcag2" | "apca"
```

Used by:

- `app/page.tsx` (global state and storage).
- `components/header.tsx` (toggle).
- `components/contrast-checker.tsx` and `components/contrast-grid.tsx` (props).
- `lib/contrast-utils.ts` (dispatch to the correct algorithm).

#### 6.2 APCA utility module

New file: `lib/apca.ts`

Responsibilities:

- Implement APCA’s W3 base algorithm for sRGB colours expressed as HEX.
- Keep algorithm details encapsulated and testable.

API:

```ts
export type ApcaResult = {
  /** Signed lightness contrast (Lc), can be negative for reverse polarity */
  lc: number
  /** Absolute magnitude of Lc for threshold comparisons */
  lcAbs: number
  /** True if dark text on light background (normal polarity) */
  isNormalPolarity: boolean
}

/** Calculate APCA Lc for two hex colours (text, background). */
export function calculateApca(
  textHex: string,
  backgroundHex: string,
): ApcaResult | null
```

Implementation notes:

- Normalise hex using a helper similar to `hexToRgb` in `lib/contrast-utils.ts`.
- Follow `APCA-W3-LaTeX.md` exactly:
  - Convert sRGB 0–255 to 0–1, apply `Strc` exponent, compute `Ys`.
  - Soft‑clip via `f_sc` using `Bthrsh` and `Bclip`.
  - Choose `Nbg`/`Ntx` vs `Rbg`/`Rtx` based on polarity.
  - Compute `Sapc` and final `Lc` using `Wscale`, `Woffset`, `Wclamp`.
- Do not tweak constants or change algorithm semantics in this file.

#### 6.3 Contrast utilities (adapter layer)

Extend `lib/contrast-utils.ts` to centralise requirements and evaluation.

Types:

```ts
export type ContrastThresholds = {
  aa: number
  aaa?: number
}

export type ApcaThresholds = {
  /** Minimum absolute Lc for a “minimum” level */
  min: number
  /** Optional stronger “preferred” level */
  preferred?: number
}

export type ContrastRequirementId = "non-text" | "large-text" | "normal-text"

export type ContrastRequirement = {
  id: ContrastRequirementId
  label: string
  shortLabel: string
  description: string
  wcagThresholds: ContrastThresholds
  apcaThresholds: ApcaThresholds
}

export type ContrastEvaluation =
  | {
      standard: "wcag2"
      ratio: number
      level: { aa: boolean; aaa: boolean }
    }
  | {
      standard: "apca"
      lc: number
      lcAbs: number
      meetsMin: boolean
      meetsPreferred: boolean
    }

export function evaluateContrast(
  standard: ContrastStandard,
  textColor: string,
  backgroundColor: string,
  requirement: ContrastRequirement,
): ContrastEvaluation | null
```

Behaviour:

- `evaluateContrast("wcag2", ...)`:
  - Call `calculateContrast` and `getWCAGLevel` with `requirement.wcagThresholds`.
- `evaluateContrast("apca", ...)`:
  - Call `calculateApca` and compare `lcAbs` against `requirement.apcaThresholds.min` and `.preferred`.

#### 6.4 Requirement presets (shared data)

Define the requirements once (likely in `lib/contrast-utils.ts`) and import them into `ContrastGrid`:

```ts
export const CONTRAST_REQUIREMENTS: ContrastRequirement[] = [
  {
    id: "non-text",
    label: "Non-text contrast",
    shortLabel: "Non-text",
    description: "UI components, icons, and non-text elements.",
    wcagThresholds: { aa: 3 },
    apcaThresholds: { min: 30, preferred: 45 },
  },
  {
    id: "large-text",
    label: "Large text",
    shortLabel: "Large text",
    description: "Headlines and other large fluent content.",
    wcagThresholds: { aa: 3, aaa: 4.5 },
    apcaThresholds: { min: 60, preferred: 75 },
  },
  {
    id: "normal-text",
    label: "Normal text",
    shortLabel: "Body text",
    description: "Columns of body copy.",
    wcagThresholds: { aa: 4.5, aaa: 7 },
    apcaThresholds: { min: 75, preferred: 90 },
  },
]
```

This replaces the existing inline `CONTRAST_REQUIREMENT_OPTIONS` in `components/contrast-grid.tsx`.

---

### 7. APCA readability levels, content types & tool thresholds

APCAeasyIntro and the ARC criterion/conformance docs give us:

- Lc bands tied to readability.
- Named content types (body, fluent, large fluent, sub‑fluent, non‑fluent/incidental).
- Bronze/Silver/Gold levels that decide which types are in scope and how strictly they are treated.

Our grid is a typography‑agnostic palette tool with a simple set of requirement options. We therefore:

- Keep WCAG mode exactly as today (AA/AAA unchanged).
- In APCA mode:
  - Use `apcaThresholds` derived from Bronze “use‑case conformance values for testing” (no lookup tables).
  - Map those thresholds onto the existing requirement options (`normal-text`, `large-text`, `non-text`).
  - Document how they relate back to APCA’s richer content taxonomy.

#### 7.1 Thresholds per requirement in this app

For each `ContrastRequirement`, we define:

- `wcagThresholds` – unchanged from today.
- `apcaThresholds` – Lc thresholds aligned with Bronze values, with notes explaining how Silver/Gold differ.

Mapping:

- **Normal text (Body text)** – fluent body content
  - WCAG: `aa = 4.5`, `aaa = 7`.
  - APCA (Bronze “Body Text”):
    - `min = 75` – Minimum for columns of body text.
    - `preferred = 90` – Preferred level for body text.
  - Documentation context:
    - Silver: body/fluent text uses lookup tables and minimum font sizes (around 14 px and up).
    - Gold: for body text, contrasts below `Lc 75` must be increased by at least `Lc 15`, and fonts are larger (around 16 px and up).

- **Large text** – large fluent content, headings, key UI labels
  - WCAG: `aa = 3`, `aaa = 4.5`.
  - APCA (Bronze “Other Content Text” + “Large Fluent Content”):
    - `min = 60` – Minimum for non‑body content that you want people to read (other content text).
    - `preferred = 75` – Aligns with body‑text minimum; gives a comfortable margin for headings and labels.
  - Documentation context:
    - Bronze/Silver/Gold all cap very large/bold text at around `Lc 90`.

- **Non‑text contrast** – UI components, icons, pictograms, incidental/spot text
  - WCAG: `aa = 3`, no `aaa`.
  - APCA (Bronze + Silver/Gold non‑content guidance):
    - `min = 30` – Absolute minimum for semantic non‑text and incidental text.
    - `preferred = 45` – Stronger level appropriate for fine‑detail pictograms or highly salient UI elements.

Notes:

- Threshold comparisons use `lcAbs` so they apply to both normal and reverse polarity.
- In APCA mode we do not label these bands as AA/AAA; they are APCA‑specific “minimum” and “preferred” levels chosen to be consistent with Bronze.
- Silver and Gold introduce font‑size/weight‑dependent lookup tables and additional rules; these are out of scope for automation in this grid, but we link to ARC for teams that need them.

---

### 8. UI & Interaction Changes

#### 8.1 Global contrast standard toggle

Files:

- `app/page.tsx`
- `components/header.tsx`
- `lib/storage-utils.ts`

Behaviour:

- Add `const [contrastStandard, setContrastStandard] = useState<ContrastStandard>("wcag2")` in `Home`.
- Persist with `storage`:
  - New key, e.g. `"color-checker-contrast-standard"`.
  - `storage.saveContrastStandard(standard)` / `storage.loadContrastStandard()`.
  - Default to `"wcag2"` when unset or invalid.
- Pass `contrastStandard` to both `ContrastChecker` instances.

Header UI:

- Extend `Header` props:

```ts
contrastStandard: ContrastStandard
onContrastStandardChange: (standard: ContrastStandard) => void
```

- Render a small segmented control:
  - `WCAG 2.x` | `APCA`.
  - Show a subtle label “Standard” and tooltips:
    - WCAG: “Relative luminance ratio”.
    - APCA: “Perceptual lightness contrast (Lc)”.
- Optionally link to:
  - `documents/apca-contrast-spec.md`.
  - APCAeasyIntro and apcacontrast.com.

#### 8.2 ContrastChecker & ContrastGrid props

Files:

- `components/contrast-checker.tsx`
- `components/contrast-grid.tsx`

Changes:

- `ContrastChecker`:
  - Accept `contrastStandard` and pass to `ContrastGrid`.
- `ContrastGrid`:
  - Accept `contrastStandard`.
  - Use `CONTRAST_REQUIREMENTS` (imported) instead of a local array.
  - Use `evaluateContrast(contrastStandard, ...)` for each cell.

#### 8.3 Requirement focus UI (dropdown + slider)

Behaviour:

- Keep the existing structure (dropdown + slider selecting between “Non-text”, “Large text”, “Normal text”).
- Adapt copy based on `contrastStandard`:
  - **WCAG:**
    - Show “AA must reach X:1” / “AAA Y:1” as today.
    - Badges: `AA`, `AAA`, `FAIL`.
  - **APCA:**
    - Show “Minimum Lc: {apcaThresholds.min}” / “Preferred Lc: {apcaThresholds.preferred}` if defined.
    - Replace AA/AAA wording with APCA‑centric phrasing (for example, “minimum readability level”, “preferred readability level”).

Accessibility:

- Indicate the current standard in the control’s accessible name (for example, “Requirement focus (APCA)”).

#### 8.4 Cell display & badges

Cell content becomes standard‑aware:

- **WCAG mode:**
  - Keep existing behaviour:
    - Show ratio `X.Y:1`.
    - Show `AA` / `AAA` / `FAIL` badges using `getWCAGLevel`.
- **APCA mode:**
  - Show `Lc`:
    - Use `Math.round(lc)` or one decimal place (`Lc 75` or `Lc 75.2`).
    - Optionally indicate polarity: `Lc -60` vs `Lc 60`.
  - Replace badges with APCA bands:
    - `lcAbs >= preferred` → badge such as `Preferred`.
    - `lcAbs >= min` → badge such as `Minimum`.
    - Else → badge such as `Below min`.
  - Reuse colour semantics:
    - Green for `Preferred`.
    - Amber for `Minimum`.
    - Red for `Below min`.

ARIA / tooltips:

- WCAG mode cell label example:
  - “Contrast ratio 4.5 to 1, AA pass, AAA fail, WCAG 2.x Normal text.”
- APCA mode cell label example:
  - “APCA contrast Lc 75, meets minimum and preferred body-text levels.”

#### 8.5 APCA info panel

When APCA is active, display a small, collapsible info panel near the requirement picker:

- Summarise the Lc levels:
  - 90, 75, 60, 45, 30, 15, with short descriptions.
- Explain briefly:
  - APCA is range‑based, not a binary pass/fail.
  - Lc relates to perceived lightness contrast; values are uniform across the range.
  - Bronze/Silver/Gold describe how strictly those bands apply across content types.
- Provide links:
  - APCAeasyIntro: `https://git.apcacontrast.com/documentation/APCAeasyIntro`.
  - ARC “Visual Readability Contrast” (criterion & conformance).
  - APCA calculator: `https://apcacontrast.com`.

---

### 9. Storage & Persistence

File: `lib/storage-utils.ts`

- Extend `STORAGE_KEYS`:

```ts
CONTRAST_STANDARD: "color-checker-contrast-standard"
```

- Add:

```ts
saveContrastStandard: (standard: ContrastStandard) => void
loadContrastStandard: () => ContrastStandard | null
```

Behaviour:

- `loadContrastStandard`:
  - Return `"wcag2"` or `"apca"` if present and valid; otherwise `null`.
- `saveContrastStandard`:
  - Serialize as a simple string; swallow storage errors.
- `clearAll`:
  - Either:
    - Also clear `CONTRAST_STANDARD` (hard reset), or
    - Leave it intact as a user preference.
  - Document whichever choice is made.

---

### 10. Implementation Plan

**Phase 1 – Core utilities**

- Add `ContrastStandard` type.
- Implement `lib/apca.ts` with the W3 base algorithm and `calculateApca`.
- Extend `lib/contrast-utils.ts`:
  - Add `ContrastRequirement`, `ApcaThresholds`, `ContrastEvaluation`, `evaluateContrast`.
  - Define `CONTRAST_REQUIREMENTS` with both WCAG and APCA thresholds.

**Phase 2 – Grid integration**

- Update `components/contrast-grid.tsx`:
  - Replace direct `calculateContrast` / `getWCAGLevel` calls with `evaluateContrast`.
  - Replace local requirement array with `CONTRAST_REQUIREMENTS`.
  - Make cell rendering conditional on `contrastStandard`.

**Phase 3 – Global toggle & persistence**

- Extend `lib/storage-utils.ts` with contrast standard helpers.
- Add `contrastStandard` state in `app/page.tsx` and load/save it.
- Update `Header` and `ContrastChecker` props and wire up the toggle.

**Phase 4 – APCA info & docs**

- Add the APCA info panel in `ContrastGrid` (APCA‑only).
- Add a short attribution / legal blurb in the UI or an “About” area.
- Keep this spec updated as implementation details stabilise.

---

### 11. QA Checklist

- **Algorithm correctness**
  - Verify APCA outputs against published examples or the official calculator for a set of colour pairs.
  - Confirm sign and magnitude of `Lc` (for example, black/white, mid‑tones, low‑contrast pairs).

- **Threshold behaviour**
  - WCAG mode:
    - Confirm AA/AAA behaviour and UI matches current implementation.
  - APCA mode:
    - Check that `min`/`preferred` bands change at the expected Lc levels (30, 45, 60, 75, 90).
    - Spot‑check typical text scenarios (body text, headings, subtle UI) against APCAeasyIntro and ARC guidance.

- **UI & UX**
  - Switching standards updates all numeric displays and badges without losing palette state.
  - Requirement picker shows the right thresholds per standard.
  - APCA info panel appears only in APCA mode and links are valid.

- **Persistence**
  - Reloading the app restores the last chosen contrast standard.
  - Cache clearing behaves as documented for the standard preference.

- **Accessibility**
  - Screen readers announce:
    - The active standard.
    - The numeric value (ratio or Lc).
    - The band (AA/AAA/FAIL for WCAG, Minimum/Preferred/Below min for APCA).
  - Toggle is keyboard‑operable and labelled clearly.

---

### 12. References

- APCA main documentation: https://git.apcacontrast.com/documentation/README
- APCAeasyIntro: https://git.apcacontrast.com/documentation/APCAeasyIntro
- APCA base formula (LaTeX): https://github.com/Myndex/SAPC-APCA/blob/master/documentation/APCA-W3-LaTeX.md
- APCA minimum compliance / integration: https://git.apcacontrast.com/documentation/minimum_compliance
- ARC “Visual Readability Contrast” tests (criterion & conformance): https://readtech.org/ARC/tests/visual-readability-contrast/
- APCA calculator: https://apcacontrast.com

