"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { ContrastChecker } from "@/components/contrast-checker"
import { PaletteManager } from "@/components/palette-manager"
import { Header } from "@/components/header"
import { ResizablePanels } from "@/components/resizable-panels"
import { storage } from "@/lib/storage-utils"

export type ColorPalette = {
  id: string
  name: string
  foregroundColors: string[]
  backgroundColors: string[]
}

export type EditingColor = {
  type: "foreground" | "background"
  index: number
  color: string
} | null

const DEFAULT_FOREGROUND = ["#41B4C8", "#8C5887", "#BDDB59", "#F5A26E", "#15134B", "#B0B34C"]
const DEFAULT_BACKGROUND = ["#F0EFEF", "#BFBFBF", "#E0FFF8", "#221B4C", "#FFFFFF"]

function createDefaultPalette(): ColorPalette {
  return {
    id: "1",
    name: "Custom name 1",
    foregroundColors: [...DEFAULT_FOREGROUND],
    backgroundColors: [...DEFAULT_BACKGROUND],
  }
}

function createDefaultPalettes(): ColorPalette[] {
  return [createDefaultPalette()]
}

export default function Home() {
  const defaultPalettes = useMemo(() => createDefaultPalettes(), [])
  const defaultActiveId = defaultPalettes[0]?.id ?? "1"
  const [palettes, setPalettes] = useState<ColorPalette[]>(defaultPalettes)
  const [activePaletteId, setActivePaletteId] = useState(defaultActiveId)
  const [editingColor, setEditingColor] = useState<EditingColor>(null)
  const [lastInteractedColor, setLastInteractedColor] = useState<string>("#808080")
  const [collapseGroupsDuringGroupDrag, setCollapseGroupsDuringGroupDrag] = useState(true)

  const hasHydratedRef = useRef(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === "undefined" || hasHydratedRef.current) {
      return
    }

    const storedPalettes = storage.loadPalettes()
    const storedActivePaletteId = storage.loadActivePaletteId()
    if (storedPalettes && storedPalettes.length > 0) {
      const nextActiveId =
        storedActivePaletteId && storedPalettes.some((p) => p.id === storedActivePaletteId)
          ? storedActivePaletteId
          : storedPalettes[0].id
      setPalettes(storedPalettes)
      setActivePaletteId(nextActiveId)
    } else if (storedActivePaletteId) {
      setActivePaletteId((prev) => (prev === storedActivePaletteId ? prev : storedActivePaletteId))
    }

    hasHydratedRef.current = true
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hasHydratedRef.current) {
      return
    }
    storage.savePalettes(palettes)
  }, [palettes])

  useEffect(() => {
    if (!hasHydratedRef.current) {
      return
    }
    storage.saveActivePaletteId(activePaletteId)
  }, [activePaletteId])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      if (target.closest("[data-color-picker]")) {
        return
      }

      if (target.closest("[data-color-card]")) {
        return
      }

      if (
        target.closest("button") ||
        target.closest("input") ||
        target.tagName === "INPUT" ||
        target.tagName === "BUTTON"
      ) {
        return
      }

      setEditingColor(null)
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const focusNewColor = useCallback(
    (type: "foreground" | "background", colors: string[]) => {
      if (colors.length === 0) return
      const newIndex = colors.length - 1
      const newColor = colors[newIndex]
      if (!newColor) return
      const parts = newColor.split("#")
      const hex = "#" + (parts.length > 1 ? parts[1] : parts[0].replace("#", ""))
      setLastInteractedColor(hex)
      setEditingColor({ type, index: newIndex, color: newColor })
    },
    [setEditingColor, setLastInteractedColor],
  )

  const activePalette = palettes.find((p) => p.id === activePaletteId) || palettes[0]

  const updatePalette = (id: string, updates: Partial<ColorPalette>) => {
    setPalettes((prev) =>
      prev.map((palette) => {
        if (palette.id !== id) {
          return palette
        }

        const next: ColorPalette = {
          ...palette,
          ...updates,
          foregroundColors: updates.foregroundColors ?? palette.foregroundColors,
          backgroundColors: updates.backgroundColors ?? palette.backgroundColors,
        }

        if (id === activePaletteId) {
          if (
            updates.foregroundColors &&
            updates.foregroundColors.length > palette.foregroundColors.length
          ) {
            focusNewColor("foreground", updates.foregroundColors)
          }
          if (
            updates.backgroundColors &&
            updates.backgroundColors.length > palette.backgroundColors.length
          ) {
            focusNewColor("background", updates.backgroundColors)
          }
        }

        return next
      }),
    )
  }

  const addPalette = () => {
    const newPalette: ColorPalette = {
      id: Date.now().toString(),
      name: `Custom name ${palettes.length + 1}`,
      foregroundColors: ["#000000"],
      backgroundColors: ["#FFFFFF"],
    }
    setPalettes((prev) => [...prev, newPalette])
    setActivePaletteId(newPalette.id)
    setEditingColor({ type: "foreground", index: 0, color: "#000000" })
  }

  const duplicatePalette = () => {
    const newPalette: ColorPalette = {
      id: Date.now().toString(),
      name: `${activePalette.name} (Copy)`,
      foregroundColors: [...activePalette.foregroundColors],
      backgroundColors: [...activePalette.backgroundColors],
    }
    setPalettes((prev) => [...prev, newPalette])
    setActivePaletteId(newPalette.id)
  }

  const deletePalette = () => {
    if (palettes.length === 1) {
      alert("Cannot delete the last palette")
      return
    }
    const remainingPalettes = palettes.filter((p) => p.id !== activePaletteId)
    setPalettes(remainingPalettes)
    setActivePaletteId(remainingPalettes[0].id)
  }

  const reorderPalettes = (fromIndex: number, toIndex: number) => {
    const newPalettes = [...palettes]
    const [movedPalette] = newPalettes.splice(fromIndex, 1)
    newPalettes.splice(toIndex, 0, movedPalette)
    setPalettes(newPalettes)
  }

  const handleColorEdit = (type: "foreground" | "background", index: number) => {
    if (index === -1) {
      setEditingColor(null)
      return
    }

    const color = type === "foreground" ? activePalette.foregroundColors[index] : activePalette.backgroundColors[index]

    if (color) {
      const parts = color.split("#")
      const hex = "#" + (parts.length > 1 ? parts[1] : parts[0].replace("#", ""))
      setLastInteractedColor(hex)
      setEditingColor({ type, index, color: color }) // Pass full color string, not just hex
    }
  }

  const handleColorChange = (newColor: string) => {
    if (!editingColor) return

    const parts = newColor.split("#")
    const hex = "#" + (parts.length > 1 ? parts[1] : parts[0].replace("#", ""))
    setLastInteractedColor(hex)

    if (editingColor.type === "foreground") {
      const colors = [...activePalette.foregroundColors]
      colors[editingColor.index] = newColor
      updatePalette(activePalette.id, { foregroundColors: colors })
      setEditingColor({ ...editingColor, color: newColor })
    } else {
      const colors = [...activePalette.backgroundColors]
      colors[editingColor.index] = newColor
      updatePalette(activePalette.id, { backgroundColors: colors })
      setEditingColor({ ...editingColor, color: newColor })
    }
  }

  const handleColorUpdate = (type: "foreground" | "background", index: number, newColor: string) => {
    if (editingColor && editingColor.type === type && editingColor.index === index) {
      setEditingColor({ ...editingColor, color: newColor })
    }
  }

  const handleClearCache = () => {
    storage.clearAll()
    const defaultPalettes = [
      {
        id: Date.now().toString(),
        name: "Custom name 1",
        foregroundColors: ["#41B4C8", "#8C5887", "#BDDB59", "#F5A26E", "#15134B", "#B0B34C"],
        backgroundColors: ["#F0EFEF", "#BFBFBF", "#E0FFF8", "#221B4C", "#FFFFFF"],
      },
    ]
    setPalettes(defaultPalettes)
    setActivePaletteId(defaultPalettes[0].id)
    setEditingColor(null)
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header
        onClearCache={handleClearCache}
        paletteName={activePalette.name}
        onUpdatePaletteName={(name) => updatePalette(activePalette.id, { name })}
        onDuplicatePalette={duplicatePalette}
        onDeletePalette={deletePalette}
        collapseGroupsDuringGroupDrag={collapseGroupsDuringGroupDrag}
        onCollapseGroupsDuringDragChange={setCollapseGroupsDuringGroupDrag}
      />
      <ResizablePanels
        panel1Title="Palette Manager"
        panel2Title="Color Manager"
        panel3Title="Contrast Matrix"
        panel1={
          <PaletteManager
            palettes={palettes}
            activePaletteId={activePaletteId}
            onSelectPalette={setActivePaletteId}
            onAddPalette={addPalette}
            onReorderPalettes={reorderPalettes}
            editingColor={editingColor}
            onColorChange={handleColorChange}
            lastInteractedColor={lastInteractedColor}
          />
        }
        panel2={
          <ContrastChecker
            palette={activePalette}
            onUpdatePalette={(updates) => updatePalette(activePalette.id, updates)}
            onColorEdit={handleColorEdit}
            editingColor={editingColor}
            onColorUpdate={handleColorUpdate}
            lastInteractedColor={lastInteractedColor}
            collapseGroupsDuringGroupDrag={collapseGroupsDuringGroupDrag}
          />
        }
        panel3={
          <ContrastChecker
            palette={activePalette}
            onUpdatePalette={(updates) => updatePalette(activePalette.id, updates)}
            onColorEdit={handleColorEdit}
            editingColor={editingColor}
            onColorUpdate={handleColorUpdate}
            lastInteractedColor={lastInteractedColor}
            collapseGroupsDuringGroupDrag={collapseGroupsDuringGroupDrag}
            showOnlyGrid={true}
          />
        }
      />
    </div>
  )
}
