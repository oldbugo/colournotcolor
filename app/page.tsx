"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { ContrastChecker } from "@/components/contrast-checker"
import { PaletteManager } from "@/components/palette-manager"
import { Header } from "@/components/header"
import { ResizablePanels } from "@/components/resizable-panels"
import { storage } from "@/lib/storage-utils"
import type { ColorSwatch } from "@/types/palette"
import { createSwatch, parseLegacyColor, splitLabel, swatchToLegacy, updateSwatch } from "@/lib/color-utils"

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

const DEFAULT_COLOR_VALUES = [
  "#41B4C8",
  "#8C5887",
  "#BDDB59",
  "#F5A26E",
  "#15134B",
  "#B0B34C",
  "#F0EFEF",
  "#BFBFBF",
  "#E0FFF8",
  "#221B4C",
  "#FFFFFF",
]

const STARTER_COLOR_VALUES = ["#000000", "#FFFFFF"]

const createDefaultColors = (): ColorSwatch[] => DEFAULT_COLOR_VALUES.map((hex) => createSwatch({ hex }))
const createStarterColors = (): ColorSwatch[] => STARTER_COLOR_VALUES.map((hex) => createSwatch({ hex }))

function createDefaultPalette(): ColorPalette {
  return {
    id: "1",
    name: "Custom name 1",
    colors: createDefaultColors(),
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

      if (target.closest("[data-panel-divider]")) {
        return
      }

      setEditingColor(null)
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const focusNewColor = useCallback(
    (colors: ColorSwatch[]) => {
      if (colors.length === 0) return
      const newIndex = colors.length - 1
      const newSwatch = colors[newIndex]
      if (!newSwatch) return
      setLastInteractedColor(newSwatch.hex)
      setEditingColor({
        index: newIndex,
        swatch: newSwatch,
        legacyValue: swatchToLegacy(newSwatch),
      })
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

        const nextColors = updates.colors ?? palette.colors

        if (id === activePaletteId && updates.colors && updates.colors.length > palette.colors.length) {
          focusNewColor(updates.colors)
        }

        return {
          ...palette,
          ...updates,
          colors: nextColors,
        }
      }),
    )
  }

  const addPalette = () => {
    const starterColors = createStarterColors()
    const newPalette: ColorPalette = {
      id: Date.now().toString(),
      name: `Custom name ${palettes.length + 1}`,
      colors: starterColors,
    }
    setPalettes((prev) => [...prev, newPalette])
    setActivePaletteId(newPalette.id)
    setEditingColor({
      index: 0,
      swatch: starterColors[0],
      legacyValue: swatchToLegacy(starterColors[0]),
    })
    setLastInteractedColor(starterColors[0].hex)
  }

  const duplicatePalette = () => {
    const clonedColors = activePalette.colors.map((swatch) =>
      createSwatch({ hex: swatch.hex, name: swatch.name, group: swatch.group }),
    )
    const newPalette: ColorPalette = {
      id: Date.now().toString(),
      name: `${activePalette.name} (Copy)`,
      colors: clonedColors,
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

  const handleColorEdit = (index: number) => {
    if (index === -1) {
      setEditingColor(null)
      return
    }

    const swatch = activePalette.colors[index]

    if (swatch) {
      setLastInteractedColor(swatch.hex)
      setEditingColor({
        index,
        swatch,
        legacyValue: swatchToLegacy(swatch),
      })
    }
  }

  const handleColorChange = (newColor: string) => {
    if (!editingColor) return

    const { label, hex } = parseLegacyColor(newColor)
    const { name, group } = splitLabel(label)
    const updatedSwatch = updateSwatch(editingColor.swatch, { hex, name, group })
    const colors = [...activePalette.colors]
    colors[editingColor.index] = updatedSwatch
    setLastInteractedColor(updatedSwatch.hex)
    updatePalette(activePalette.id, { colors })
    setEditingColor({
      index: editingColor.index,
      swatch: updatedSwatch,
      legacyValue: swatchToLegacy(updatedSwatch),
    })
  }

  const handleColorUpdate = (index: number, newSwatch: ColorSwatch) => {
    if (editingColor && editingColor.index === index) {
      setEditingColor({
        index,
        swatch: newSwatch,
        legacyValue: swatchToLegacy(newSwatch),
      })
      setLastInteractedColor(newSwatch.hex)
    }
  }

  const handleClearCache = () => {
    storage.clearAll()
    const defaultPalettes = createDefaultPalettes()
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
        panel2Title="Colour Manager"
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
