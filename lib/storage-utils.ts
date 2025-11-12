const STORAGE_KEYS = {
  PALETTES: "color-checker-palettes",
  ACTIVE_PALETTE_ID: "color-checker-active-palette",
  LAYOUT_PREFERENCES: "color-checker-layout-preferences",
} as const

export type StoredPalette = {
  id: string
  name: string
  foregroundColors: string[]
  backgroundColors: string[]
}

type LayoutPreferences = {
  [paletteId: string]: boolean
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

  // Load palettes from localStorage
  loadPalettes: (): StoredPalette[] | null => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PALETTES)
      return stored ? JSON.parse(stored) : null
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

  // Clear all stored data
  clearAll: () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.PALETTES)
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_PALETTE_ID)
      localStorage.removeItem(STORAGE_KEYS.LAYOUT_PREFERENCES)
    } catch {
      // Swallow storage errors
    }
  },
}
