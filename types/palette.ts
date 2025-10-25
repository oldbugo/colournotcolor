export type ColorSwatch = {
  id: string
  hex: string
  name: string
  group: string | null
}

export type ColorPalette = {
  id: string
  name: string
  foregroundColors: ColorSwatch[]
  backgroundColors: ColorSwatch[]
}

export type EditingColor = {
  type: "foreground" | "background"
  index: number
  swatch: ColorSwatch
  legacyValue: string
} | null

export type PaletteState = {
  palettes: ColorPalette[]
  activePaletteId: string
  editingColor: EditingColor
  lastInteractedColor: string
  isHydrated: boolean
}

