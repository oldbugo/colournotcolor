import { describe, expect, it } from "vitest"
import { PALETTE_TEMPLATES } from "./palette-templates"

describe("palette templates", () => {
  it("provides multiple importable design system templates", () => {
    expect(PALETTE_TEMPLATES.length).toBeGreaterThanOrEqual(6)
    expect(PALETTE_TEMPLATES.map((template) => template.id)).toContain("atlassian-design-system")
  })

  it("contains valid color records", () => {
    const ids = new Set<string>()

    for (const template of PALETTE_TEMPLATES) {
      expect(template.id).toBeTruthy()
      expect(ids.has(template.id)).toBe(false)
      ids.add(template.id)
      expect(template.name).toBeTruthy()
      expect(template.colors.length).toBeGreaterThan(0)

      for (const color of template.colors) {
        expect(color.hex).toMatch(/^#[0-9A-F]{6}$/)
        expect(typeof color.name).toBe("string")
      }
    }
  })
})
