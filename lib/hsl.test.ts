import { describe, expect, it } from "vitest"

import { hexToHSL, hslToHex } from "./hsl"

describe("hexToHSL", () => {
  it("maps black to (0, 0, 0)", () => {
    expect(hexToHSL("#000000")).toEqual({ h: 0, s: 0, l: 0 })
  })

  it("maps white to (0, 0, 100)", () => {
    expect(hexToHSL("#FFFFFF")).toEqual({ h: 0, s: 0, l: 100 })
  })

  it("maps pure red to (0, 100, 50)", () => {
    const { h, s, l } = hexToHSL("#FF0000")
    expect(h).toBeCloseTo(0, 6)
    expect(s).toBeCloseTo(100, 6)
    expect(l).toBeCloseTo(50, 6)
  })

  it("maps pure green to (120, 100, 50)", () => {
    const { h, s, l } = hexToHSL("#00FF00")
    expect(h).toBeCloseTo(120, 6)
    expect(s).toBeCloseTo(100, 6)
    expect(l).toBeCloseTo(50, 6)
  })

  it("maps pure blue to (240, 100, 50)", () => {
    const { h, s, l } = hexToHSL("#0000FF")
    expect(h).toBeCloseTo(240, 6)
    expect(s).toBeCloseTo(100, 6)
    expect(l).toBeCloseTo(50, 6)
  })

  it("maps mid-grey to (0, 0, ~50)", () => {
    const { h, s, l } = hexToHSL("#808080")
    expect(h).toBe(0)
    expect(s).toBe(0)
    expect(l).toBeCloseTo(50.19607, 4)
  })

  it("returns zeros on bad input", () => {
    expect(hexToHSL("nope")).toEqual({ h: 0, s: 0, l: 0 })
    expect(hexToHSL("")).toEqual({ h: 0, s: 0, l: 0 })
  })

  it("accepts hex without leading #", () => {
    expect(hexToHSL("FF0000")).toEqual(hexToHSL("#FF0000"))
  })
})

describe("hslToHex", () => {
  it("formats pure red", () => {
    expect(hslToHex(0, 100, 50)).toBe("#ff0000")
  })

  it("formats pure green", () => {
    expect(hslToHex(120, 100, 50)).toBe("#00ff00")
  })

  it("formats pure blue", () => {
    expect(hslToHex(240, 100, 50)).toBe("#0000ff")
  })

  it("wraps negative hues", () => {
    expect(hslToHex(-120, 100, 50)).toBe(hslToHex(240, 100, 50))
  })

  it("clamps saturation and lightness", () => {
    expect(hslToHex(0, 200, 200)).toBe("#ffffff")
    expect(hslToHex(0, -50, -50)).toBe("#000000")
  })
})

describe("hexToHSL / hslToHex round-trip", () => {
  const samples = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#00FFFF", "#FF00FF", "#808080"]

  for (const hex of samples) {
    it(`hex → HSL → hex returns ${hex} (case-insensitive)`, () => {
      const { h, s, l } = hexToHSL(hex)
      expect(hslToHex(h, s, l).toUpperCase()).toBe(hex.toUpperCase())
    })
  }
})
