"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { ContrastChecker } from "@/components/contrast-checker"
import { PaletteManager } from "@/components/palette-manager"
import { Header } from "@/components/header"
import { ResizablePanels } from "@/components/resizable-panels"
import { storage } from "@/lib/storage-utils"
import type { ColorSwatch } from "@/types/palette"
import { createSwatch, parseLegacyColor, splitLabel, swatchToLegacy, updateSwatch } from "@/lib/color-utils"
import type { ContrastStandard } from "@/lib/contrast-utils"

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

// Disable auto-closing the color popup on outside clicks.
const DISABLE_POPUP_AUTO_CLOSE = false
// Freeze popup close requests unless explicitly allowed via the manual token.
const DEBUG_FREEZE_POPUP = false

export default function Home() {
  const defaultPalettes = useMemo(() => createDefaultPalettes(), [])
  const defaultActiveId = defaultPalettes[0]?.id ?? "1"
  const [palettes, setPalettes] = useState<ColorPalette[]>(defaultPalettes)
  const [activePaletteId, setActivePaletteId] = useState(defaultActiveId)
  const [editingColor, setEditingColor] = useState<EditingColor>(null)
  const lastStickyEditingColorRef = useRef<EditingColor>(null)
  const [lastInteractedColor, setLastInteractedColor] = useState<string>("#808080")
  const [collapseGroupsDuringGroupDrag, setCollapseGroupsDuringGroupDrag] = useState(true)
  const [contrastStandard, setContrastStandard] = useState<ContrastStandard>("wcag2")

const hasHydratedRef = useRef(false)
const isMiddlePanningRef = useRef(false)
const lastMiddlePanRef = useRef<number | null>(null)
const commitEditingColor = useCallback(
  (next: EditingColor, allowClear = false) => {
    if (DEBUG_FREEZE_POPUP && next === null && !allowClear) return
    setEditingColor(next)
  },
  [setEditingColor],
)

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPalettes(storedPalettes)
      setActivePaletteId(nextActiveId)
    } else if (storedActivePaletteId) {
      setActivePaletteId((prev) => (prev === storedActivePaletteId ? prev : storedActivePaletteId))
    }

    const storedStandard = storage.loadContrastStandard()
    if (storedStandard) {
      setContrastStandard(storedStandard)
    }

    hasHydratedRef.current = true
  }, [])

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
    if (!hasHydratedRef.current) {
      return
    }
    storage.saveContrastStandard(contrastStandard)
  }, [contrastStandard])

  useEffect(() => {
    // Debug trace for any editingColor change (including resets to null).
    // eslint-disable-next-line no-console
    console.log("[editingColor changed]", { editingColor, stack: new Error().stack })
  }, [editingColor])

  useEffect(() => {
    if (typeof window === "undefined") return
    const handlePanToggle = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail
      if (typeof detail === "boolean") {
        isMiddlePanningRef.current = detail
        if (!detail) {
          lastMiddlePanRef.current = Date.now()
        }
      }
    }
    window.addEventListener("contrastgrid:middlepan", handlePanToggle)
    return () => {
      window.removeEventListener("contrastgrid:middlepan", handlePanToggle)
    }
  }, [])

  useEffect(() => {
    if (DISABLE_POPUP_AUTO_CLOSE || DEBUG_FREEZE_POPUP) {
      return
    }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // Only close on a clear primary-button action. Middle clicks can spoof button=0/buttons=0,
      // so require a positive primary signal and ignore recent middle-pan gestures.
      const isRecentMiddlePan = typeof lastMiddlePanRef.current === "number" && Date.now() - lastMiddlePanRef.current < 1000
      const leftButtonHeld = typeof e.buttons === "number" ? e.buttons === 1 : false
      const isPrimaryWhich = e.which === 1
      const isPrimary = leftButtonHeld || isPrimaryWhich

      if (!isPrimary || isMiddlePanningRef.current || isRecentMiddlePan) {
        return
      }

      if (target.closest("[data-color-picker]")) {
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
  const effectiveEditingColor: EditingColor = editingColor

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
    commitEditingColor({
      index: 0,
      swatch: starterColors[0],
      legacyValue: swatchToLegacy(starterColors[0]),
    }, true)
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

  const handleColorEdit = useCallback(
    (index: number) => {
      if (index === -1) {
        if (DEBUG_FREEZE_POPUP) return
        commitEditingColor(null, true)
        lastStickyEditingColorRef.current = null
        return
      }

      const swatch = activePalette.colors[index]
      if (swatch) {
        setLastInteractedColor(swatch.hex)
        const next = {
          index,
          swatch,
          legacyValue: swatchToLegacy(swatch),
        }
        commitEditingColor(next, true)
        lastStickyEditingColorRef.current = next
      }
    },
    [activePalette.colors, commitEditingColor],
  )

  const handleColorEditFromChild = useCallback(
    (index: number) => {
      // Debug trace to identify callers that trigger popup changes.
      // eslint-disable-next-line no-console
      console.log("[onColorEdit]", { index, source: "child", stack: new Error().stack })
      handleColorEdit(index)
    },
    [handleColorEdit],
  )

  const handleColorChange = (newColor: string) => {
    const active = editingColor ?? effectiveEditingColor
    if (!active) {
      return
    }

    const { label, hex } = parseLegacyColor(newColor)
    const { name, group } = splitLabel(label)
    const updatedSwatch = updateSwatch(active.swatch, { hex, name, group })
    const colors = [...activePalette.colors]
    colors[active.index] = updatedSwatch
    setLastInteractedColor(updatedSwatch.hex)
    updatePalette(activePalette.id, { colors })
    const next = {
      index: active.index,
      swatch: updatedSwatch,
      legacyValue: swatchToLegacy(updatedSwatch),
    }
    commitEditingColor(next, true)
    lastStickyEditingColorRef.current = next
  }

  const handleColorUpdate = (index: number, newSwatch: ColorSwatch) => {
    if (editingColor && editingColor.index === index) {
      const next = {
        index,
        swatch: newSwatch,
        legacyValue: swatchToLegacy(newSwatch),
      }
      commitEditingColor(next, true)
      lastStickyEditingColorRef.current = next
      setLastInteractedColor(newSwatch.hex)
    }
  }

  const handleClearCache = () => {
    storage.clearAll()
    const defaultPalettes = createDefaultPalettes()
    setPalettes(defaultPalettes)
    setActivePaletteId(defaultPalettes[0].id)
    if (!DEBUG_FREEZE_POPUP) {
      commitEditingColor(null, false)
      lastStickyEditingColorRef.current = null
    }
    setContrastStandard("wcag2")
  }

  useEffect(() => {
    if (editingColor) {
      lastStickyEditingColorRef.current = editingColor
    }
  }, [editingColor])

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
        contrastStandard={contrastStandard}
        onContrastStandardChange={setContrastStandard}
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
        editingColor={effectiveEditingColor}
        onColorChange={handleColorChange}
        lastInteractedColor={lastInteractedColor}
      />
    }
    panel2={
      <ContrastChecker
        palette={activePalette}
        contrastStandard={contrastStandard}
        onContrastStandardChange={setContrastStandard}
        onUpdatePalette={(updates) => updatePalette(activePalette.id, updates)}
        onColorEdit={handleColorEditFromChild}
        editingColor={effectiveEditingColor}
        onColorUpdate={handleColorUpdate}
        lastInteractedColor={lastInteractedColor}
        collapseGroupsDuringGroupDrag={collapseGroupsDuringGroupDrag}
      />
    }
        panel3={
          <ContrastChecker
        palette={activePalette}
        contrastStandard={contrastStandard}
        onContrastStandardChange={setContrastStandard}
        onUpdatePalette={(updates) => updatePalette(activePalette.id, updates)}
        onColorEdit={handleColorEditFromChild}
        editingColor={effectiveEditingColor}
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
