"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { ContrastChecker } from "@/components/contrast-checker"
import { PaletteManager } from "@/components/palette-manager"
import { PaletteListManager } from "@/components/palette-list-manager"
import { Header } from "@/components/header"
import { ResizablePanels } from "@/components/resizable-panels"
import { storage } from "@/lib/storage-utils"
import type { ColorPalette, ColorSwatch, EditingColor } from "@/types/palette"
import { createSwatch, parseLegacyColor, splitLabel, swatchToLegacy, updateSwatch } from "@/lib/color-utils"
import type { ContrastStandard } from "@/lib/contrast-utils"

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
  const lastStickyEditingColorRef = useRef<EditingColor>(null)
  const [lastInteractedColor, setLastInteractedColor] = useState<string>("#808080")
  const [contrastStandard, setContrastStandard] = useState<ContrastStandard>("wcag2")

const hasHydratedRef = useRef(false)
const isMiddlePanningRef = useRef(false)
const lastMiddlePanRef = useRef<number | null>(null)
const commitEditingColor = useCallback(
  (next: EditingColor) => {
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

  const handleMiddlePanChange = useCallback((active: boolean) => {
    isMiddlePanningRef.current = active
    if (!active) {
      lastMiddlePanRef.current = Date.now()
    }
  }, [])

  useEffect(() => {
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

      if (target.closest("[data-palette-manager-dropdown]")) {
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
    })
    setLastInteractedColor(starterColors[0].hex)
  }

  const duplicatePalette = (paletteId: string = activePaletteId) => {
    const sourcePalette = palettes.find((palette) => palette.id === paletteId)
    if (!sourcePalette) {
      return
    }

    const clonedColors = sourcePalette.colors.map((swatch) =>
      createSwatch({ hex: swatch.hex, name: swatch.name, group: swatch.group }),
    )
    const newPalette: ColorPalette = {
      id: Date.now().toString(),
      name: `${sourcePalette.name} (Copy)`,
      colors: clonedColors,
    }
    setPalettes((prev) => [...prev, newPalette])
    setActivePaletteId(newPalette.id)
  }

  const deletePalette = (paletteId: string = activePaletteId) => {
    if (palettes.length <= 1) {
      return
    }
    const remainingPalettes = palettes.filter((p) => p.id !== paletteId)
    if (remainingPalettes.length === palettes.length || remainingPalettes.length === 0) {
      return
    }

    setPalettes(remainingPalettes)
    if (paletteId === activePaletteId) {
      setActivePaletteId(remainingPalettes[0].id)
      commitEditingColor(null)
      lastStickyEditingColorRef.current = null
    }
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
        commitEditingColor(null)
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
        commitEditingColor(next)
        lastStickyEditingColorRef.current = next
      }
    },
    [activePalette.colors, commitEditingColor],
  )

  const handleColorEditFromChild = useCallback(
    (index: number) => {
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
    commitEditingColor(next)
    lastStickyEditingColorRef.current = next
  }

  const handleColorUpdate = (index: number, newSwatch: ColorSwatch) => {
    if (editingColor && editingColor.index === index) {
      const next = {
        index,
        swatch: newSwatch,
        legacyValue: swatchToLegacy(newSwatch),
      }
      commitEditingColor(next)
      lastStickyEditingColorRef.current = next
      setLastInteractedColor(newSwatch.hex)
    }
  }

  const handleClearCache = () => {
    storage.clearAll()
    const defaultPalettes = createDefaultPalettes()
    setPalettes(defaultPalettes)
    setActivePaletteId(defaultPalettes[0].id)
    commitEditingColor(null)
    lastStickyEditingColorRef.current = null
    setContrastStandard("wcag2")
  }

  const handleImportPalette = (payload: { name: string; colors: ColorSwatch[] }) => {
    const nextName = payload.name.trim() || `Imported palette ${palettes.length + 1}`
    const newPalette: ColorPalette = {
      id: Date.now().toString(),
      name: nextName,
      colors: payload.colors,
    }
    setPalettes((prev) => [...prev, newPalette])
    setActivePaletteId(newPalette.id)
    if (payload.colors[0]) {
      setLastInteractedColor(payload.colors[0].hex)
    }
    commitEditingColor(null)
    lastStickyEditingColorRef.current = null
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
        paletteColors={activePalette.colors}
        onUpdatePaletteName={(name) => updatePalette(activePalette.id, { name })}
        onImportPalette={handleImportPalette}
        contrastStandard={contrastStandard}
        onContrastStandardChange={setContrastStandard}
        paletteManagerDropdownContent={({ close }) => (
          <PaletteListManager
            palettes={palettes}
            activePaletteId={activePaletteId}
            onSelectPalette={setActivePaletteId}
            onAddPalette={addPalette}
            onReorderPalettes={reorderPalettes}
            onImportPalette={handleImportPalette}
            onDuplicatePalette={duplicatePalette}
            onDeletePalette={deletePalette}
            canDeletePalette={palettes.length > 1}
            onRequestClose={close}
          />
        )}
      />
      <ResizablePanels
        panel1Title="Colour Picker"
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
            showPaletteList={false}
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
            onMiddlePanChange={handleMiddlePanChange}
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
            onMiddlePanChange={handleMiddlePanChange}
            showOnlyGrid={true}
          />
        }
      />
    </div>
  )
}
