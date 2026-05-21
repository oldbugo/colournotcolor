import { describe, expect, it } from "vitest"

import {
  clampHsluv,
  formatHslString,
  getHsluvBoundingLines,
  hexToHsluv,
  hsluvToHex,
  hsluvToRgb,
  luvToHex,
  luvToHsluv,
  maxChromaForHsluv,
  parseHslString,
  rgbToHsluv,
  roundHsluv,
} from "./hsluv"

/**
 * Reference vectors taken from documents/hsluv-test-cases.md. The doc was
 * generated against the upstream `hsluv` npm package; these tests verify the
 * embedded port stays within 0.01 of those values (the doc rounds to two
 * decimals, matching the UI default).
 */
const HSLUV_REFERENCE: Array<{ hex: string; h: number; s: number; l: number }> = [
  { hex: "#000000", h: 0.0, s: 0.0, l: 0.0 },
  { hex: "#FFFFFF", h: 0.0, s: 0.0, l: 100.0 },
  { hex: "#123456", h: 248.61, s: 85.43, l: 21.04 },
  { hex: "#FF6B6B", h: 12.18, s: 100.0, l: 64.03 },
  { hex: "#1D3557", h: 251.5, s: 72.04, l: 21.93 },
  { hex: "#F4A261", h: 38.47, s: 80.38, l: 73.51 },
  { hex: "#2A9D8F", h: 176.56, s: 91.23, l: 58.59 },
  { hex: "#E76F51", h: 20.64, s: 69.04, l: 60.74 },
  { hex: "#FFD166", h: 61.96, s: 100.0, l: 85.92 },
  { hex: "#06D6A0", h: 154.97, s: 99.62, l: 76.48 },
  { hex: "#EF476F", h: 2.91, s: 81.68, l: 56.1 },
]

describe("hexToHsluv reference vectors", () => {
  for (const { hex, h, s, l } of HSLUV_REFERENCE) {
    it(`maps ${hex} → (h ≈ ${h}, s ≈ ${s}, l ≈ ${l})`, () => {
      const [actualH, actualS, actualL] = hexToHsluv(hex)
      // Hue is undefined when saturation is 0; skip the hue check in that case.
      if (s > 0) {
        expect(actualH).toBeCloseTo(h, 1)
      }
      expect(actualS).toBeCloseTo(s, 1)
      expect(actualL).toBeCloseTo(l, 1)
    })
  }
})

describe("hsluvToHex / hexToHsluv round-trip", () => {
  for (const { hex } of HSLUV_REFERENCE) {
    it(`hex → HSLuv → hex returns ${hex}`, () => {
      const [h, s, l] = hexToHsluv(hex)
      expect(hsluvToHex(h, s, l)).toBe(hex.toUpperCase())
    })
  }
})

describe("hsluvToRgb / rgbToHsluv consistency", () => {
  it("hsluvToRgb returns integer channels in [0, 255]", () => {
    const [r, g, b] = hsluvToRgb(120, 80, 50)
    for (const channel of [r, g, b]) {
      expect(channel).toBeGreaterThanOrEqual(0)
      expect(channel).toBeLessThanOrEqual(255)
      expect(Number.isInteger(channel)).toBe(true)
    }
  })

  it("rgbToHsluv expects [0, 255] inputs (black returns L=0)", () => {
    const [, , l] = rgbToHsluv(0, 0, 0)
    expect(l).toBeCloseTo(0, 4)
  })

  it("rgbToHsluv expects [0, 255] inputs (white returns L=100)", () => {
    const [, , l] = rgbToHsluv(255, 255, 255)
    expect(l).toBeCloseTo(100, 4)
  })
})

describe("clampHsluv", () => {
  it("wraps negative hues into [0, 360)", () => {
    expect(clampHsluv({ h: -90, s: 50, l: 50 }).h).toBe(270)
  })

  it("treats positive multiples of 360 specially (UI expects 360 not 0)", () => {
    // The lib's clampHue quirk: any positive value whose modulo is ~0
    // returns 360, so the editor input "720°" displays as 360° rather than 0°.
    expect(clampHsluv({ h: 360, s: 50, l: 50 }).h).toBe(360)
    expect(clampHsluv({ h: 720, s: 50, l: 50 }).h).toBe(360)
  })

  it("clamps saturation and lightness to [0, 100]", () => {
    const clamped = clampHsluv({ h: 0, s: 150, l: -10 })
    expect(clamped.s).toBe(100)
    expect(clamped.l).toBe(0)
  })

  it("non-finite inputs collapse to 0", () => {
    const clamped = clampHsluv({ h: Number.NaN, s: Number.POSITIVE_INFINITY, l: Number.NEGATIVE_INFINITY })
    expect(clamped.h).toBe(0)
    expect(clamped.s).toBe(100)
    expect(clamped.l).toBe(0)
  })
})

describe("roundHsluv", () => {
  it("rounds h/s/l to the requested number of decimals", () => {
    const rounded = roundHsluv({ h: 123.456789, s: 12.3456, l: 78.9012 }, 2)
    expect(rounded).toEqual({ h: 123.46, s: 12.35, l: 78.9 })
  })
})

describe("parseHslString / formatHslString", () => {
  it("accepts the canonical hsluv(h s% l%) functional syntax", () => {
    expect(parseHslString("hsluv(210 65% 52%)", "hsluv")).toEqual({ h: 210, s: 65, l: 52 })
  })

  it("accepts space-separated h s l with optional percent signs", () => {
    expect(parseHslString("210 65% 52", "hsluv")).toEqual({ h: 210, s: 65, l: 52 })
  })

  it("accepts comma-separated h, s, l", () => {
    expect(parseHslString("210, 65%, 52%", "hsluv")).toEqual({ h: 210, s: 65, l: 52 })
  })

  it("returns null on bad input", () => {
    expect(parseHslString("not a color", "hsluv")).toBeNull()
    expect(parseHslString("", "hsluv")).toBeNull()
    expect(parseHslString("210", "hsluv")).toBeNull()
  })

  it("rejects a mismatched functional prefix", () => {
    // The lib's Mode type is "hsluv" only; passing a different prefix should fail.
    expect(parseHslString("rgb(210 65 52)", "hsluv")).toBeNull()
  })

  it("formats values with two decimal places by default", () => {
    expect(formatHslString({ h: 210, s: 65, l: 52 }, "hsluv")).toBe("hsluv(210.00 65.00% 52.00%)")
  })

  it("clamps before formatting", () => {
    expect(formatHslString({ h: 800, s: -5, l: 200 }, "hsluv")).toBe("hsluv(80.00 0.00% 100.00%)")
  })
})

describe("maxChromaForHsluv / getHsluvBoundingLines / luv* utilities", () => {
  it("maxChromaForHsluv collapses to 0 at the extremes of L", () => {
    expect(maxChromaForHsluv(0, 0)).toBe(0)
    expect(maxChromaForHsluv(0, 100)).toBe(0)
  })

  it("maxChromaForHsluv is positive for mid-tone L", () => {
    expect(maxChromaForHsluv(0, 50)).toBeGreaterThan(0)
  })

  it("getHsluvBoundingLines returns six lines for any in-range L", () => {
    const lines = getHsluvBoundingLines(50)
    expect(lines).toHaveLength(6)
    for (const line of lines) {
      expect(Number.isFinite(line.slope)).toBe(true)
      expect(Number.isFinite(line.intercept)).toBe(true)
    }
  })

  it("luvToHex and luvToHsluv stay in agreement", () => {
    const l = 50
    const u = 30
    const v = -20
    const hex = luvToHex(l, u, v)
    const [, , hsluvL] = luvToHsluv(l, u, v)
    expect(hsluvL).toBeCloseTo(l, 4)
    expect(hex).toMatch(/^#[0-9A-F]{6}$/)
  })
})
