"use client"

import type { ColorPalette } from "@/app/page"
import { ContrastGrid } from "@/components/contrast-grid"
import { ColorManager } from "@/components/color-manager"
import type { ColorSwatch } from "@/types/palette"
import { swatchFromLegacy, swatchToLegacy } from "@/lib/color-utils"

type ContrastCheckerProps = {
  palette: ColorPalette
  onUpdatePalette: (updates: Partial<ColorPalette>) => void
  onColorEdit?: (type: "foreground" | "background", index: number) => void
  editingColor?: { type: "foreground" | "background"; index: number; color: string } | null
  onColorUpdate?: (type: "foreground" | "background", index: number, newColor: string) => void
  lastInteractedColor?: string
  showOnlyGrid?: boolean
  collapseGroupsDuringGroupDrag: boolean
}

export function ContrastChecker({
  palette,
  onUpdatePalette,
  onColorEdit,
  editingColor,
  onColorUpdate,
  lastInteractedColor = "#808080",
  showOnlyGrid = false,
  collapseGroupsDuringGroupDrag,
}: ContrastCheckerProps) {
  type LegacyColor = string | ColorSwatch

  const foregroundSwatches = palette.foregroundColors.map((color, index) =>
    swatchFromLegacy(color, `foreground-${palette.id}-${index}`),
  )
  const backgroundSwatches = palette.backgroundColors.map((color, index) =>
    swatchFromLegacy(color, `background-${palette.id}-${index}`),
  )

  const toLegacy = (value: LegacyColor): string => (typeof value === "string" ? value : swatchToLegacy(value))

  const handleReorderForeground = (fromIndex: number, toIndex: number) => {
    const colors = [...palette.foregroundColors]
    const [removed] = colors.splice(fromIndex, 1)
    colors.splice(toIndex, 0, removed)
    onUpdatePalette({ foregroundColors: colors })
  }

  const handleReorderBackground = (fromIndex: number, toIndex: number) => {
    const colors = [...palette.backgroundColors]
    const [removed] = colors.splice(fromIndex, 1)
    colors.splice(toIndex, 0, removed)
    onUpdatePalette({ backgroundColors: colors })
  }

  const handleSwapForeground = (fromIndex: number, toIndex: number) => {
    const colors = [...palette.foregroundColors]
    const temp = colors[fromIndex]
    colors[fromIndex] = colors[toIndex]
    colors[toIndex] = temp
    onUpdatePalette({ foregroundColors: colors })
  }

  const handleSwapBackground = (fromIndex: number, toIndex: number) => {
    const colors = [...palette.backgroundColors]
    const temp = colors[fromIndex]
    colors[fromIndex] = colors[toIndex]
    colors[toIndex] = temp
    onUpdatePalette({ backgroundColors: colors })
  }

  const addColor = (type: "foreground" | "background", color: LegacyColor): number => {
    const legacyColor = toLegacy(color)

    if (type === "foreground") {
      const newColors = [...palette.foregroundColors, legacyColor]
      onUpdatePalette({ foregroundColors: newColors })
      return newColors.length - 1
    } else {
      const newColors = [...palette.backgroundColors, legacyColor]
      onUpdatePalette({ backgroundColors: newColors })
      return newColors.length - 1
    }
  }

  const removeColor = (type: "foreground" | "background", index: number) => {
    if (type === "foreground") {
      const colors = [...palette.foregroundColors]
      colors.splice(index, 1)
      onUpdatePalette({ foregroundColors: colors })
    } else {
      const colors = [...palette.backgroundColors]
      colors.splice(index, 1)
      onUpdatePalette({ backgroundColors: colors })
    }
  }

  const updateColor = (type: "foreground" | "background", index: number, color: LegacyColor) => {
    const legacyColor = toLegacy(color)

    if (type === "foreground") {
      const colors = [...palette.foregroundColors]
      colors[index] = legacyColor
      onUpdatePalette({ foregroundColors: colors })
    } else {
      const colors = [...palette.backgroundColors]
      colors[index] = legacyColor
      onUpdatePalette({ backgroundColors: colors })
    }
    onColorUpdate?.(type, index, legacyColor)
  }

  const batchUpdateForeground = (colors: LegacyColor[]) => {
    onUpdatePalette({ foregroundColors: colors.map(toLegacy) })
  }

  const batchUpdateBackground = (colors: LegacyColor[]) => {
    onUpdatePalette({ backgroundColors: colors.map(toLegacy) })
  }

  const handleAddForeground = () => {
    const newColor = swatchFromLegacy(lastInteractedColor)
    const newIndex = addColor("foreground", newColor)
    onColorEdit?.("foreground", newIndex)
  }

  const handleAddBackground = () => {
    const newColor = swatchFromLegacy(lastInteractedColor)
    const newIndex = addColor("background", newColor)
    onColorEdit?.("background", newIndex)
  }

  if (showOnlyGrid) {
    return (
      <div className="p-6 px-4">
        <ContrastGrid
          foregroundColors={palette.foregroundColors}
          backgroundColors={palette.backgroundColors}
          onReorderForeground={handleReorderForeground}
          onReorderBackground={handleReorderBackground}
          onSwapForeground={handleSwapForeground}
          onSwapBackground={handleSwapBackground}
          onColorEdit={onColorEdit}
          editingColor={editingColor}
          onAddForeground={handleAddForeground}
          onAddBackground={handleAddBackground}
          onRemoveForeground={(index) => removeColor("foreground", index)}
          onRemoveBackground={(index) => removeColor("background", index)}
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <ColorManager
        label="Foreground"
        colors={foregroundSwatches}
        onAddColor={(swatch) => {
          const newIndex = addColor("foreground", swatch)
          onColorEdit?.("foreground", newIndex)
        }}
        onRemoveColor={(index) => removeColor("foreground", index)}
        onUpdateColor={(index, swatch) => updateColor("foreground", index, swatch)}
        onBatchUpdateColors={batchUpdateForeground}
        onColorEdit={(index) => onColorEdit?.("foreground", index)}
        activeEditingIndex={editingColor?.type === "foreground" ? editingColor.index : null}
        lastInteractedColor={lastInteractedColor}
        collapseGroupsDuringGroupDrag={collapseGroupsDuringGroupDrag}
      />
      <ColorManager
        label="Background"
        colors={backgroundSwatches}
        onAddColor={(swatch) => {
          const newIndex = addColor("background", swatch)
          onColorEdit?.("background", newIndex)
        }}
        onRemoveColor={(index) => removeColor("background", index)}
        onUpdateColor={(index, swatch) => updateColor("background", index, swatch)}
        onBatchUpdateColors={batchUpdateBackground}
        onColorEdit={(index) => onColorEdit?.("background", index)}
        activeEditingIndex={editingColor?.type === "background" ? editingColor.index : null}
        lastInteractedColor={lastInteractedColor}
        collapseGroupsDuringGroupDrag={collapseGroupsDuringGroupDrag}
      />
    </div>
  )
}
