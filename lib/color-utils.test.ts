import { describe, expect, it } from "vitest"

import {
  composeLabel,
  composeLegacyColor,
  createSwatch,
  getDisplayName,
  normalizeHex,
  parseLegacyColor,
  splitLabel,
  swatchFromLegacy,
  swatchToLegacy,
  updateSwatch,
} from "./color-utils"

describe("normalizeHex", () => {
  it("uppercases the hex", () => {
    expect(normalizeHex("#abcdef")).toBe("#ABCDEF")
  })

  it("adds a leading #", () => {
    expect(normalizeHex("ABCDEF")).toBe("#ABCDEF")
  })

  it("trims whitespace", () => {
    expect(normalizeHex("  #abcdef  ")).toBe("#ABCDEF")
  })

  it("falls back to #000000 on empty input", () => {
    expect(normalizeHex("")).toBe("#000000")
    expect(normalizeHex("   ")).toBe("#000000")
  })
})

describe("parseLegacyColor", () => {
  it("parses a label#hex pair", () => {
    expect(parseLegacyColor("warm/red#FF0000")).toEqual({ label: "warm/red", hex: "#FF0000" })
  })

  it("returns an empty label for plain hex input", () => {
    expect(parseLegacyColor("#abcdef")).toEqual({ label: "", hex: "#ABCDEF" })
  })

  it("treats a label-less string as a hex", () => {
    expect(parseLegacyColor("abcdef")).toEqual({ label: "", hex: "#ABCDEF" })
  })

  it("returns fallback hex on empty input", () => {
    expect(parseLegacyColor("")).toEqual({ label: "", hex: "#000000" })
  })
})

describe("composeLegacyColor", () => {
  it("joins label and hex", () => {
    expect(composeLegacyColor({ label: "warm/red", hex: "#FF0000" })).toBe("warm/red#FF0000")
  })

  it("omits an empty label", () => {
    expect(composeLegacyColor({ label: "", hex: "#FF0000" })).toBe("#FF0000")
  })

  it("normalises the hex part", () => {
    expect(composeLegacyColor({ label: "x", hex: "abcdef" })).toBe("x#ABCDEF")
  })
})

describe("splitLabel", () => {
  it("returns {name, group:null} when no '/' is present", () => {
    expect(splitLabel("red")).toEqual({ name: "red", group: null })
  })

  it("returns null group for an empty label", () => {
    expect(splitLabel("")).toEqual({ name: "", group: null })
  })

  it("splits on the first '/' only", () => {
    expect(splitLabel("warm/red")).toEqual({ name: "red", group: "warm" })
    expect(splitLabel("a/b/c")).toEqual({ name: "b/c", group: "a" })
  })

  it("trims whitespace around both parts", () => {
    expect(splitLabel("  warm  /  red  ")).toEqual({ name: "red", group: "warm" })
  })

  it("returns null group for a label starting with '/'", () => {
    expect(splitLabel("/red")).toEqual({ name: "red", group: null })
  })
})

describe("composeLabel", () => {
  it("joins group + name with '/'", () => {
    expect(composeLabel("red", "warm", "#FF0000")).toBe("warm/red")
  })

  it("returns the name alone when group is null", () => {
    expect(composeLabel("red", null, "#FF0000")).toBe("red")
  })

  it("uses hex without # when group is set but name is empty", () => {
    expect(composeLabel("", "warm", "#FF0000")).toBe("warm/FF0000")
  })

  it("returns empty string when both name and group are empty", () => {
    expect(composeLabel("", null, "#FF0000")).toBe("")
  })
})

describe("createSwatch / updateSwatch / swatchFromLegacy / swatchToLegacy", () => {
  it("createSwatch assigns a fresh id, normalises hex, trims name", () => {
    const swatch = createSwatch({ hex: "abcdef", name: "  red  ", group: "  warm  " })
    expect(swatch.hex).toBe("#ABCDEF")
    expect(swatch.name).toBe("red")
    expect(swatch.group).toBe("warm")
    expect(swatch.id).toBeTruthy()
  })

  it("createSwatch coerces empty group to null", () => {
    expect(createSwatch({ hex: "#FFF", group: "" }).group).toBeNull()
    expect(createSwatch({ hex: "#FFF", group: "   " }).group).toBeNull()
  })

  it("createSwatch honours an explicit id", () => {
    const swatch = createSwatch({ id: "fixed-id", hex: "#000" })
    expect(swatch.id).toBe("fixed-id")
  })

  it("updateSwatch preserves the id and patches fields", () => {
    const original = createSwatch({ hex: "#000000", name: "black", group: "neutral" })
    const updated = updateSwatch(original, { hex: "#111111" })
    expect(updated.id).toBe(original.id)
    expect(updated.hex).toBe("#111111")
    expect(updated.name).toBe("black")
    expect(updated.group).toBe("neutral")
  })

  it("swatchFromLegacy / swatchToLegacy round-trip", () => {
    const legacy = "warm/red#FF0000"
    const swatch = swatchFromLegacy(legacy, "id-1")
    expect(swatch.id).toBe("id-1")
    expect(swatch.name).toBe("red")
    expect(swatch.group).toBe("warm")
    expect(swatchToLegacy(swatch)).toBe(legacy)
  })

  it("swatchToLegacy keeps just the hex when the swatch is unlabelled", () => {
    const swatch = createSwatch({ hex: "#000000" })
    expect(swatchToLegacy(swatch)).toBe("#000000")
  })

  it("getDisplayName prefers name over hex", () => {
    expect(getDisplayName(createSwatch({ hex: "#FFFFFF", name: "white" }))).toBe("white")
    expect(getDisplayName(createSwatch({ hex: "#FFFFFF" }))).toBe("#FFFFFF")
  })

  it("normalizeHex does NOT expand 3-digit to 6-digit (just uppercases + prefixes #)", () => {
    // Document the current, intentionally-conservative behaviour. parseLegacyColor
    // and createSwatch both go through normalizeHex.
    const swatch = createSwatch({ hex: "#abc" })
    expect(swatch.hex).toBe("#ABC")
  })
})
