import type { ColorSwatch } from "@/types/palette"
import { createSwatch, swatchFromLegacy } from "@/lib/color-utils"
import type { ContrastStandard } from "@/lib/contrast-utils"

const STORAGE_KEYS = {
  PALETTES: "color-checker-palettes",
  ACTIVE_PALETTE_ID: "color-checker-active-palette",
  LAYOUT_PREFERENCES: "color-checker-layout-preferences",
  CONTRAST_STANDARD: "color-checker-contrast-standard",
  PALETTE_PICKER_HEIGHTS: "palette-picker-heights-v1",
  CONTRAST_GRID_FILTERS: "contrast-grid-number-filters-v1",
} as const

export type StoredPalette = {
  id: string
  name: string
  colors: ColorSwatch[]
}

type StoredPaletteV1 = {
  id: string
  name: string
  foregroundColors: string[]
  backgroundColors: string[]
}

type RawStoredPalette = StoredPalette | StoredPaletteV1

type LayoutPreferences = {
  [paletteId: string]: boolean
}

export type NumberRange = {
  min: number
  max: number
}

export type StoredContrastFilters = {
  rowRange: NumberRange | null
  columnRange: NumberRange | null
  rowIds: string[] | null
  columnIds: string[] | null
  filterStepIndex: number | null
}

const isNumberRange = (value: unknown): value is NumberRange => {
  if (!value || typeof value !== "object") {
    return false
  }
  return (
    typeof (value as NumberRange).min === "number" && typeof (value as NumberRange).max === "number"
  )
}

const normalizeStoredContrastFilters = (value: unknown): StoredContrastFilters => {
  if (!value || typeof value !== "object") {
    return {
      rowRange: null,
      columnRange: null,
      rowIds: null,
      columnIds: null,
      filterStepIndex: null,
    }
  }

  const candidate = value as Partial<Record<string, unknown>>
  const rowRangeCandidate = (candidate.rowRange ?? candidate.rows) as NumberRange | null
  const columnRangeCandidate = (candidate.columnRange ?? candidate.columns) as NumberRange | null

  const rowIds = Array.isArray(candidate.rowIds)
    ? candidate.rowIds.filter((id): id is string => typeof id === "string")
    : null
  const columnIds = Array.isArray(candidate.columnIds)
    ? candidate.columnIds.filter((id): id is string => typeof id === "string")
    : null

  return {
    rowRange: isNumberRange(rowRangeCandidate) ? rowRangeCandidate : null,
    columnRange: isNumberRange(columnRangeCandidate) ? columnRangeCandidate : null,
    rowIds,
    columnIds,
    filterStepIndex: typeof candidate.filterStepIndex === "number" ? candidate.filterStepIndex : null,
  }
}

const readContrastFilterMap = (): Record<string, StoredContrastFilters> => {
  if (typeof window === "undefined") {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.CONTRAST_GRID_FILTERS)
    return raw ? (JSON.parse(raw) as Record<string, StoredContrastFilters>) : {}
  } catch {
    return {}
  }
}

const ensureSwatch = (value: ColorSwatch | string): ColorSwatch => {
  if (typeof value === "string") {
    return swatchFromLegacy(value)
  }
  const hasId = value.id && value.id.trim().length > 0
  return createSwatch({
    id: hasId ? value.id : undefined,
    hex: value.hex ?? "#000000",
    name: value.name,
    group: value.group,
  })
}

const normalizeStoredPalette = (palette: RawStoredPalette): StoredPalette => {
  if ("colors" in palette) {
    return {
      id: String(palette.id ?? ""),
      name: palette.name ?? "Untitled",
      colors: Array.isArray(palette.colors) ? palette.colors.map(ensureSwatch) : [],
    }
  }
  const foreground = Array.isArray(palette.foregroundColors) ? palette.foregroundColors : []
  const background = Array.isArray(palette.backgroundColors) ? palette.backgroundColors : []
  const combined = [...foreground, ...background]
  return {
    id: String(palette.id ?? ""),
    name: palette.name ?? "Untitled",
    colors: combined.map(ensureSwatch),
  }
}

export const storage = {
  // Save palettes to localStorage
  savePalettes: (palettes: StoredPalette[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.PALETTES, JSON.stringify(palettes))
    } catch {
      // Swallow storage errors
    }
  },

  saveContrastStandard: (standard: ContrastStandard) => {
    try {
      localStorage.setItem(STORAGE_KEYS.CONTRAST_STANDARD, standard)
    } catch {
      // Swallow storage errors
    }
  },

  loadContrastStandard: (): ContrastStandard | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CONTRAST_STANDARD)
      if (stored === "apca" || stored === "both" || stored === "apca-silver") {
        return "apca-bronze"
      }
      return stored === "wcag2" || stored === "apca-bronze" ? stored : null
    } catch {
      return null
    }
  },

  // Load palettes from localStorage
  loadPalettes: (): StoredPalette[] | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PALETTES)
      if (!stored) {
        return null
      }
      const parsed = JSON.parse(stored) as RawStoredPalette[]
      if (!Array.isArray(parsed)) {
        return null
      }
      return parsed.map(normalizeStoredPalette)
    } catch {
      return null
    }
  },

  // Save active palette ID
  saveActivePaletteId: (id: string) => {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PALETTE_ID, id)
    } catch {
      // Swallow storage errors
    }
  },

  // Load active palette ID
  loadActivePaletteId: (): string | null => {
    try {
      return localStorage.getItem(STORAGE_KEYS.ACTIVE_PALETTE_ID)
    } catch {
      return null
    }
  },

  saveLayoutPreference: (paletteId: string, isHorizontal: boolean) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.LAYOUT_PREFERENCES)
      const preferences: LayoutPreferences = stored ? JSON.parse(stored) : {}
      preferences[paletteId] = isHorizontal
      localStorage.setItem(STORAGE_KEYS.LAYOUT_PREFERENCES, JSON.stringify(preferences))
    } catch {
      // Swallow storage errors
    }
  },

  loadLayoutPreference: (paletteId: string): boolean | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.LAYOUT_PREFERENCES)
      if (!stored) return null
      const preferences: LayoutPreferences = JSON.parse(stored)
      return preferences[paletteId] ?? null
    } catch {
      return null
    }
  },

  loadPickerHeight: (paletteId: string): number | null => {
    if (typeof window === "undefined") {
      return null
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.PALETTE_PICKER_HEIGHTS)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const value = parsed?.[paletteId]
      return typeof value === "number" ? value : null
    } catch {
      return null
    }
  },

  savePickerHeight: (paletteId: string, height: number) => {
    if (typeof window === "undefined") {
      return
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.PALETTE_PICKER_HEIGHTS)
      const parsed = raw ? ((JSON.parse(raw) as Record<string, unknown>) ?? {}) : {}
      parsed[paletteId] = height
      window.localStorage.setItem(STORAGE_KEYS.PALETTE_PICKER_HEIGHTS, JSON.stringify(parsed))
    } catch {
      // Swallow storage errors
    }
  },

  loadContrastFilters: (paletteId: string): StoredContrastFilters => {
    return normalizeStoredContrastFilters(readContrastFilterMap()[paletteId])
  },

  saveContrastFilters: (paletteId: string, filters: StoredContrastFilters) => {
    if (typeof window === "undefined") {
      return
    }
    try {
      const existing = readContrastFilterMap()
      existing[paletteId] = filters
      window.localStorage.setItem(STORAGE_KEYS.CONTRAST_GRID_FILTERS, JSON.stringify(existing))
    } catch {
      // Swallow storage errors
    }
  },

  // Clear all stored data (including the contrast standard preference for a complete reset)
  clearAll: () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.PALETTES)
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_PALETTE_ID)
      localStorage.removeItem(STORAGE_KEYS.LAYOUT_PREFERENCES)
      localStorage.removeItem(STORAGE_KEYS.CONTRAST_STANDARD)
      localStorage.removeItem(STORAGE_KEYS.PALETTE_PICKER_HEIGHTS)
      localStorage.removeItem(STORAGE_KEYS.CONTRAST_GRID_FILTERS)
    } catch {
      // Swallow storage errors
    }
  },
}
