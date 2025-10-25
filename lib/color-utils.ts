import type { ColorSwatch } from "@/types/palette"

export type ParsedLegacyColor = {
  label: string
  hex: string
}

const FALLBACK_HEX = "#000000"

const generateSwatchId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `swatch-${Math.random().toString(36).slice(2, 11)}`
}

export function normalizeHex(value: string): string {
  const cleaned = value.trim()
  if (!cleaned) return FALLBACK_HEX
  const prefixed = cleaned.startsWith("#") ? cleaned : `#${cleaned}`
  return prefixed.toUpperCase()
}

export function parseLegacyColor(value: string): ParsedLegacyColor {
  if (!value) {
    return { label: "", hex: FALLBACK_HEX }
  }

  const trimmed = value.trim()
  if (!trimmed.includes("#")) {
    return { label: "", hex: normalizeHex(trimmed) }
  }

  const [maybeLabel, ...rest] = trimmed.split("#")
  const hexPart = rest.join("#")
  const label = rest.length > 0 ? maybeLabel.trim() : ""
  const hex = rest.length > 0 ? normalizeHex(hexPart) : normalizeHex(trimmed)

  return { label, hex }
}

export function composeLegacyColor({ label, hex }: ParsedLegacyColor): string {
  const normalizedHex = normalizeHex(hex)
  const cleanedLabel = label.trim()
  return cleanedLabel ? `${cleanedLabel}${normalizedHex}` : normalizedHex
}

export function splitLabel(label: string): { name: string; group: string | null } {
  const trimmed = label.trim()
  if (!trimmed) {
    return { name: "", group: null }
  }

  if (!trimmed.includes("/")) {
    return { name: trimmed, group: null }
  }

  const [group, ...rest] = trimmed.split("/")
  const name = rest.join("/").trim()

  return {
    name,
    group: group.trim() || null,
  }
}

export function composeLabel(name: string, group: string | null, hexFallback: string): string {
  const cleanedName = name.trim()
  const cleanedGroup = group?.trim()

  if (cleanedGroup && cleanedName) {
    return `${cleanedGroup}/${cleanedName}`
  }

  if (cleanedGroup && !cleanedName) {
    return `${cleanedGroup}/${hexFallback.replace("#", "")}`
  }

  return cleanedName
}

type CreateSwatchInput = {
  id?: string
  hex: string
  name?: string
  group?: string | null
}

export function createSwatch({ id, hex, name = "", group = null }: CreateSwatchInput): ColorSwatch {
  const normalizedHex = normalizeHex(hex)
  const cleanedName = name.trim()
  const cleanedGroup = group?.trim() ?? null

  return {
    id: id ?? generateSwatchId(),
    hex: normalizedHex,
    name: cleanedName,
    group: cleanedGroup && cleanedGroup.length > 0 ? cleanedGroup : null,
  }
}

export function swatchFromLegacy(color: string, id?: string): ColorSwatch {
  const { label, hex } = parseLegacyColor(color)
  const { name, group } = splitLabel(label)
  return createSwatch({ id, hex, name, group })
}

export function swatchToLegacy(swatch: ColorSwatch): string {
  const label = composeLabel(swatch.name, swatch.group, swatch.hex)
  return composeLegacyColor({ label, hex: swatch.hex })
}

export function getDisplayName(swatch: ColorSwatch): string {
  return swatch.name || swatch.hex
}

export function updateSwatch(source: ColorSwatch, updates: Partial<Omit<ColorSwatch, "id">>): ColorSwatch {
  return createSwatch({
    id: source.id,
    hex: updates.hex ?? source.hex,
    name: updates.name ?? source.name,
    group: updates.group ?? source.group,
  })
}

