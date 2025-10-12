"use client"

import type { ColorPalette } from "@/app/page"
import { ContrastGrid } from "@/components/contrast-grid"
import { ColorManager } from "@/components/color-manager"

type ContrastCheckerProps = {
  palette: ColorPalette
  onUpdatePalette: (updates: Partial<ColorPalette>) => void
  onColorEdit?: (type: "foreground" | "background", index: number) => void
  editingColor?: { type: "foreground" | "background"; index: number; color: string } | null
  onColorUpdate?: (type: "foreground" | "background", index: number, newColor: string) => void
  lastInteractedColor?: string
  showOnlyGrid?: boolean
}

export function ContrastChecker({
  palette,
  onUpdatePalette,
  onColorEdit,
  editingColor,
  onColorUpdate,
  lastInteractedColor = "#808080",
  showOnlyGrid = false,
}: ContrastCheckerProps) {
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

  const addColor = (type: "foreground" | "background", color: string): number => {
    if (type === "foreground") {
      const newColors = [...palette.foregroundColors, color]
      onUpdatePalette({ foregroundColors: newColors })
      return newColors.length - 1
    } else {
      const newColors = [...palette.backgroundColors, color]
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

  const updateColor = (type: "foreground" | "background", index: number, color: string) => {
    if (type === "foreground") {
      const colors = [...palette.foregroundColors]
      colors[index] = color
      onUpdatePalette({ foregroundColors: colors })
    } else {
      const colors = [...palette.backgroundColors]
      colors[index] = color
      onUpdatePalette({ backgroundColors: colors })
    }
    onColorUpdate?.(type, index, color)
  }

  const batchUpdateForeground = (colors: string[]) => {
    onUpdatePalette({ foregroundColors: colors })
  }

  const batchUpdateBackground = (colors: string[]) => {
    onUpdatePalette({ backgroundColors: colors })
  }

  const handleAddForeground = () => {
    const newColor = lastInteractedColor
    const newIndex = addColor("foreground", newColor)
    onColorEdit?.("foreground", newIndex)
  }

  const handleAddBackground = () => {
    const newColor = lastInteractedColor
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
        colors={palette.foregroundColors}
        onAddColor={(color) => addColor("foreground", color)}
        onRemoveColor={(index) => removeColor("foreground", index)}
        onUpdateColor={(index, color) => updateColor("foreground", index, color)}
        onReorderColors={handleReorderForeground}
        onBatchUpdateColors={batchUpdateForeground}
        onColorEdit={(index) => onColorEdit?.("foreground", index)}
        activeEditingIndex={editingColor?.type === "foreground" ? editingColor.index : null}
        lastInteractedColor={lastInteractedColor}
      />
      <ColorManager
        label="Background"
        colors={palette.backgroundColors}
        onAddColor={(color) => addColor("background", color)}
        onRemoveColor={(index) => removeColor("background", index)}
        onUpdateColor={(index, color) => updateColor("background", index, color)}
        onReorderColors={handleReorderBackground}
        onBatchUpdateColors={batchUpdateBackground}
        onColorEdit={(index) => onColorEdit?.("background", index)}
        activeEditingIndex={editingColor?.type === "background" ? editingColor.index : null}
        lastInteractedColor={lastInteractedColor}
      />
    </div>
  )
}
