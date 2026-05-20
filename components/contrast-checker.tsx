"use client"

import { ContrastGrid } from "@/components/contrast-grid"
import { ColorManager } from "@/components/color-manager"
import type { ColorPalette, ColorSwatch, EditingColor } from "@/types/palette"
import { createSwatch } from "@/lib/color-utils"
import type { ContrastStandard } from "@/lib/contrast-utils"

type ContrastCheckerProps = {
  palette: ColorPalette
  contrastStandard: ContrastStandard
  onContrastStandardChange?: (standard: ContrastStandard) => void
  onUpdatePalette: (updates: Partial<ColorPalette>) => void
  onColorEdit?: (index: number) => void
  editingColor?: EditingColor
  onColorUpdate?: (index: number, newColor: ColorSwatch) => void
  lastInteractedColor?: string
  showOnlyGrid?: boolean
  collapseGroupsDuringGroupDrag: boolean
  onMiddlePanChange?: (active: boolean) => void
}

export function ContrastChecker({
  palette,
  contrastStandard,
  onContrastStandardChange,
  onUpdatePalette,
  onColorEdit,
  editingColor,
  onColorUpdate,
  lastInteractedColor = "#808080",
  showOnlyGrid = false,
  collapseGroupsDuringGroupDrag,
  onMiddlePanChange,
}: ContrastCheckerProps) {
  const handleReorderColors = (fromIndex: number, toIndex: number) => {
    const colors = [...palette.colors]
    const [removed] = colors.splice(fromIndex, 1)
    colors.splice(toIndex, 0, removed)
    onUpdatePalette({ colors })
  }

  const handleSwapColors = (fromIndex: number, toIndex: number) => {
    const colors = [...palette.colors]
    ;[colors[fromIndex], colors[toIndex]] = [colors[toIndex], colors[fromIndex]]
    onUpdatePalette({ colors })
  }

  const handleAddColor = () => {
    const swatch = createSwatch({ hex: lastInteractedColor })
    const colors = [...palette.colors, swatch]
    onUpdatePalette({ colors })
    onColorEdit?.(colors.length - 1)
  }

  const handleRemoveColor = (index: number) => {
    const colors = [...palette.colors]
    colors.splice(index, 1)
    onUpdatePalette({ colors })
  }

  const handleUpdateColor = (index: number, swatch: ColorSwatch) => {
    const colors = [...palette.colors]
    colors[index] = swatch
    onUpdatePalette({ colors })
    onColorUpdate?.(index, swatch)
  }

  const handleBatchUpdateColors = (swatches: ColorSwatch[]) => {
    onUpdatePalette({ colors: swatches })
    if (editingColor && swatches[editingColor.index]) {
      onColorUpdate?.(editingColor.index, swatches[editingColor.index])
    }
  }

  if (showOnlyGrid) {
    return (
      <div className="h-full min-h-0 p-0">
        <ContrastGrid
          paletteId={palette.id}
          colors={palette.colors}
          contrastStandard={contrastStandard}
          onContrastStandardChange={onContrastStandardChange}
          onReorderColors={handleReorderColors}
          onSwapColors={handleSwapColors}
          onColorEdit={onColorEdit}
          editingColor={editingColor}
          onAddColor={handleAddColor}
          onRemoveColor={handleRemoveColor}
          onMiddlePanChange={onMiddlePanChange}
        />
      </div>
    )
  }

  return (
    <ColorManager
      label="Palette"
      colors={palette.colors}
      onAddColor={(swatch) => {
        const colors = [...palette.colors, swatch]
        onUpdatePalette({ colors })
        onColorEdit?.(colors.length - 1)
      }}
      onRemoveColor={handleRemoveColor}
      onUpdateColor={handleUpdateColor}
      onBatchUpdateColors={handleBatchUpdateColors}
      onColorEdit={onColorEdit}
      activeEditingIndex={editingColor?.index ?? null}
      lastInteractedColor={lastInteractedColor}
      collapseGroupsDuringGroupDrag={collapseGroupsDuringGroupDrag}
    />
  )
}
