export type ColorSwatch = {
  id: string
  hex: string
  name: string
  group: string | null
}

export type ColorPalette = {
  id: string
  name: string
  colors: ColorSwatch[]
}

export type EditingColor = {
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

