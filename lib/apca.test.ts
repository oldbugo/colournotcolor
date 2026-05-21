import { describe, expect, it } from "vitest"

import { calculateApca } from "./apca"

/**
 * Reference vectors for APCA 0.0.98G-4g-base-W3 against the embedded
 * implementation. These are intentionally tight (1e-9) so a future change
 * to the constants or piecewise branches surfaces as a test failure rather
 * than a silent drift.
 *
 * Positive Lc → dark text on light background.
 * Negative Lc → light text on dark background.
 */
describe("calculateApca", () => {
  it("returns the canonical Lc for black on white", () => {
    expect(calculateApca("#000000", "#FFFFFF")).toBeCloseTo(106.04067321268862, 9)
  })

  it("returns the canonical reverse-polarity Lc for white on black", () => {
    expect(calculateApca("#FFFFFF", "#000000")).toBeCloseTo(-107.88473318309848, 9)
  })

  it("scores mid-grey text on white as ~Lc 63", () => {
    expect(calculateApca("#888888", "#FFFFFF")).toBeCloseTo(63.056469930209424, 9)
  })

  it("scores white text on mid-grey as ~Lc -68 (reverse polarity)", () => {
    expect(calculateApca("#FFFFFF", "#888888")).toBeCloseTo(-68.54146436644962, 9)
  })

  it("scores red on white", () => {
    expect(calculateApca("#FF0000", "#FFFFFF")).toBeCloseTo(64.12621538179167, 9)
  })

  it("scores blue on white", () => {
    expect(calculateApca("#0000FF", "#FFFFFF")).toBeCloseTo(85.82083364925681, 9)
  })

  it("returns 0 when text and background are identical", () => {
    expect(calculateApca("#888888", "#888888")).toBe(0)
    expect(calculateApca("#000000", "#000000")).toBe(0)
  })

  it("expands 3-digit hex to 6-digit (#fff === #FFFFFF)", () => {
    expect(calculateApca("#fff", "#000")).toBe(calculateApca("#FFFFFF", "#000000"))
  })

  it("returns null for malformed hex input", () => {
    expect(calculateApca("nope", "#FFFFFF")).toBeNull()
    expect(calculateApca("#FFFFFF", "nope")).toBeNull()
    expect(calculateApca("#GGGGGG", "#000000")).toBeNull()
  })

  it("returns a finite number for arbitrary in-gamut pairs", () => {
    const result = calculateApca("#123456", "#FEDCBA")
    expect(result).not.toBeNull()
    expect(Number.isFinite(result!)).toBe(true)
  })
})
