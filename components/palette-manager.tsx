"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { ColorPalette, EditingColor } from "@/app/page"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronUp, Pipette } from "lucide-react"
import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from "react"
import { clampHsluv, hexToHpluv, hexToHsluv, hpluvToHex, hsluvToHex, type Hsluv } from "@/lib/hsluv"

type PaletteManagerProps = {
  palettes: ColorPalette[]
  activePaletteId: string
  onSelectPalette: (id: string) => void
  onAddPalette: () => void
  onReorderPalettes: (fromIndex: number, toIndex: number) => void
  editingColor: EditingColor
  onColorChange: (color: string) => void
  lastInteractedColor?: string
}

type ColorMode = "hsl" | "hsluv" | "hpluv"
type PlaneAxis = "h" | "s" | "l"

const COLOR_MODE_OPTIONS: Array<{ key: ColorMode; label: string }> = [
  { key: "hsl", label: "HSL" },
  { key: "hsluv", label: "HSLuv" },
  { key: "hpluv", label: "HPLuv" },
]
const PLANE_MODE_OPTIONS: Array<{ key: PlaneAxis; label: string }> = [
  { key: "h", label: "H" },
  { key: "s", label: "S" },
  { key: "l", label: "L" },
]

const PICKER_HEIGHTS_STORAGE_KEY = "palette-picker-heights-v1"

function readPickerHeightFromStorage(paletteId: string): number | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(PICKER_HEIGHTS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const value = parsed?.[paletteId]
    return typeof value === "number" ? value : null
  } catch {
    return null
  }
}

function writePickerHeightToStorage(paletteId: string, height: number) {
  if (typeof window === "undefined") {
    return
  }
  try {
    const raw = window.localStorage.getItem(PICKER_HEIGHTS_STORAGE_KEY)
    const parsed = raw ? ((JSON.parse(raw) as Record<string, unknown>) ?? {}) : {}
    parsed[paletteId] = height
    window.localStorage.setItem(PICKER_HEIGHTS_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // ignore persistence errors
  }
}

export function PaletteManager({
  palettes,
  activePaletteId,
  onSelectPalette,
  onAddPalette,
  onReorderPalettes,
  editingColor,
  onColorChange,
  lastInteractedColor: _lastInteractedColor = "#808080",
}: PaletteManagerProps) {
  void _lastInteractedColor
  const [isPickerExpanded, setIsPickerExpanded] = useState(true)
  const [pickerHeight, setPickerHeight] = useState<number | null>(null)
  const [isResizingPicker, setIsResizingPicker] = useState(false)
  const [hasCustomPickerHeight, setHasCustomPickerHeight] = useState(false)
  const supportsEyedropper = typeof window !== "undefined" && "EyeDropper" in window
  const [liveUpdate, setLiveUpdate] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null)
  const pickerContentRef = useRef<HTMLDivElement>(null)
  const pickerHeightPendingRef = useRef<number | null>(null)

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(100)
  const [lightness, setLightness] = useState(50)
  const [preservedHue, setPreservedHue] = useState(0)
  const [hexValue, setHexValue] = useState("")
  const [customName, setCustomName] = useState("")
  const [colorMode, setColorMode] = useState<ColorMode>("hsl")
  const [planeMode, setPlaneMode] = useState<PlaneAxis>("h")

  const [isEditingHex, setIsEditingHex] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempHexValue, setTempHexValue] = useState("")
  const [tempCustomName, setTempCustomName] = useState("")

  const planeRef = useRef<HTMLDivElement>(null)
  const hueSliderRef = useRef<HTMLDivElement>(null)
  const saturationSliderRef = useRef<HTMLDivElement>(null)
  const lightnessSliderRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [isDraggingPlane, setIsDraggingPlane] = useState(false)
  const [draggingSlider, setDraggingSlider] = useState<PlaneAxis | null>(null)

  const pendingColorRef = useRef<string | null>(null)
  const previousEditingColorRef = useRef<string | null>(null)
  const lastEmittedColorRef = useRef<string | null>(null)
  const lastEmittedChannelsRef = useRef<Hsluv | null>(null)
  const lastEmittedModeRef = useRef<ColorMode>(colorMode)
  const throttledColorRef = useRef<string | null>(null)
  const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const LIVE_EMIT_THROTTLE_MS = 32

  const emitColorNow = useCallback(
    (colorString: string) => {
      onColorChange(colorString)
      lastEmittedColorRef.current = colorString
      lastEmittedModeRef.current = colorMode
    },
    [colorMode, onColorChange],
  )

  const flushThrottledColor = useCallback(() => {
    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current)
      throttleTimeoutRef.current = null
    }
    if (throttledColorRef.current) {
      emitColorNow(throttledColorRef.current)
      throttledColorRef.current = null
    }
  }, [emitColorNow])

  const queueColorEmit = useCallback(
    (colorString: string, immediate: boolean) => {
      if (immediate) {
        throttledColorRef.current = null
        if (throttleTimeoutRef.current) {
          clearTimeout(throttleTimeoutRef.current)
          throttleTimeoutRef.current = null
        }
        emitColorNow(colorString)
        return
      }
      throttledColorRef.current = colorString
      if (throttleTimeoutRef.current) {
        return
      }
      throttleTimeoutRef.current = setTimeout(() => {
        throttleTimeoutRef.current = null
        if (throttledColorRef.current) {
          emitColorNow(throttledColorRef.current)
          throttledColorRef.current = null
        }
      }, LIVE_EMIT_THROTTLE_MS)
    },
    [emitColorNow],
  )

  const updateColorFromChannels = useCallback(
    (next: Hsluv, mode: "auto" | "immediate" | "silent" = "auto") => {
      const clamped = clampHsluv(next)
      setHue(clamped.h)
      setSaturation(clamped.s)
      setLightness(clamped.l)
      lastEmittedChannelsRef.current = clamped

      const newHex = channelsToHexByMode(clamped, colorMode).toUpperCase()
      setHexValue(newHex)

      if (mode === "silent") {
        return
      }

      const fullColor = customName ? `${customName}#${newHex.replace("#", "")}` : newHex
      if (mode === "immediate") {
        queueColorEmit(fullColor, true)
        pendingColorRef.current = null
      } else if (liveUpdate) {
        queueColorEmit(fullColor, false)
      } else {
        pendingColorRef.current = fullColor
      }
    },
    [colorMode, customName, liveUpdate, queueColorEmit],
  )

  useEffect(() => {
    const node = sidebarRef.current
    if (!node) {
      return
    }

    const updateWidth = () => {
      const width = node.offsetWidth
      setSidebarWidth((prev) => (prev === width ? prev : width))
    }

    updateWidth()

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) {
          return
        }
        const width = entry.contentRect.width
        setSidebarWidth((prev) => (Math.abs((prev ?? 0) - width) < 0.5 ? prev : width))
      })
      observer.observe(node)
      return () => {
        observer.disconnect()
      }
    }

    if (typeof window === "undefined") {
      return
    }

    window.addEventListener("resize", updateWidth)
    return () => {
      window.removeEventListener("resize", updateWidth)
    }
  }, [])

  const activePlaneMode = colorMode === "hsl" ? "h" : planeMode

  const planeAxes = useMemo(
    () =>
      activePlaneMode === "h"
        ? (["s", "l"] as const)
        : activePlaneMode === "s"
          ? (["h", "l"] as const)
          : (["h", "s"] as const),
    [activePlaneMode],
  )

  const updatePlanePosition = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!planeRef.current) return

      const rect = planeRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height))
      if (rect.width === 0 || rect.height === 0) {
        return
      }

      const nextChannels: Hsluv = { h: hue, s: saturation, l: lightness }
      const [axisX, axisY] = planeAxes
      const ratioX = x / rect.width
      const ratioY = y / rect.height

      nextChannels[axisX] = ratioToValue(axisX, ratioX)
      nextChannels[axisY] = ratioToValue(axisY, 1 - ratioY)

      if ((axisX === "s" || axisY === "s") && nextChannels.s > 0) {
        setPreservedHue(nextChannels.h)
      }
      updateColorFromChannels(nextChannels)
    },
    [hue, lightness, planeAxes, saturation, updateColorFromChannels],
  )

  const updateSliderFromEvent = useCallback(
    (axis: PlaneAxis, e: React.MouseEvent | MouseEvent) => {
      const slider =
        axis === "h" ? hueSliderRef.current : axis === "s" ? saturationSliderRef.current : lightnessSliderRef.current
      if (!slider) return
      const rect = slider.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
      if (rect.width === 0) {
        return
      }

      const ratio = x / rect.width
      const nextValue = ratioToValue(axis, ratio)
      const nextChannels: Hsluv = { h: hue, s: saturation, l: lightness }
      nextChannels[axis] = nextValue
      if (axis === "h") {
        setPreservedHue(nextValue)
      } else if (axis === "s" && nextValue > 0) {
        setPreservedHue(nextChannels.h)
      }
      updateColorFromChannels(nextChannels)
    },
    [hue, saturation, lightness, updateColorFromChannels],
  )

  useEffect(() => {
    if (!editingColor?.swatch) {
      previousEditingColorRef.current = null
      return
    }

    const colorKey = `${editingColor.swatch.id}-${editingColor.swatch.hex}-${editingColor.swatch.name ?? ""}-${editingColor.swatch.group ?? ""}`
    if (previousEditingColorRef.current === colorKey) {
      return
    }
    previousEditingColorRef.current = colorKey

    const applyEditingColor = () => {
      const hex = editingColor.swatch.hex
      const name = editingColor.swatch.name ?? ""

      setCustomName(name)
      const reuseStored =
        lastEmittedColorRef.current === editingColor.legacyValue &&
        lastEmittedModeRef.current === colorMode &&
        lastEmittedChannelsRef.current
      const channels = reuseStored ? lastEmittedChannelsRef.current! : hexToChannelsByMode(hex, colorMode)
      setHue(channels.h)
      setSaturation(channels.s)
      setLightness(channels.l)
      if (channels.s > 0) {
        setPreservedHue(channels.h)
      }
      setHexValue(hex.toUpperCase())
    }

    if (typeof queueMicrotask === "function") {
      queueMicrotask(applyEditingColor)
      return
    }

    if (typeof window !== "undefined") {
      const rafId = window.requestAnimationFrame(applyEditingColor)
      return () => {
        window.cancelAnimationFrame(rafId)
      }
    }

    applyEditingColor()
  }, [colorMode, editingColor])


  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingPicker || !sidebarRef.current) return

      e.preventDefault()

      const sidebarRect = sidebarRef.current.getBoundingClientRect()
      const newHeight = sidebarRect.bottom - e.clientY - 46
      const minHeight = 200
      const maxHeight = sidebarRect.height - 200

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setPickerHeight(newHeight)
        setHasCustomPickerHeight(true)
        pickerHeightPendingRef.current = newHeight
      }
    }

    const handleMouseUp = () => {
      setIsResizingPicker(false)
      document.body.style.userSelect = ""
    }

    if (isResizingPicker) {
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizingPicker])

  useLayoutEffect(() => {
    if (!isPickerExpanded || hasCustomPickerHeight) {
      return
    }
    const node = pickerContentRef.current
    if (!node) return
    const measuredHeight = node.scrollHeight
    if (measuredHeight <= 0) {
      return
    }
    setPickerHeight((current) => {
      const next = Math.ceil(measuredHeight)
      if (current === next) {
        return current
      }
      return next
    })
  }, [activePaletteId, colorMode, editingColor, hasCustomPickerHeight, isPickerExpanded, planeMode, sidebarWidth])

  useEffect(() => {
    if (!isResizingPicker && hasCustomPickerHeight && pickerHeightPendingRef.current !== null) {
      writePickerHeightToStorage(activePaletteId, Math.round(pickerHeightPendingRef.current))
      pickerHeightPendingRef.current = null
    }
  }, [activePaletteId, hasCustomPickerHeight, isResizingPicker])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const storedHeight = readPickerHeightFromStorage(activePaletteId)
    if (typeof storedHeight === "number" && storedHeight > 0) {
      setPickerHeight(storedHeight)
      setHasCustomPickerHeight(true)
    } else {
      setPickerHeight(null)
      setHasCustomPickerHeight(false)
    }
    pickerHeightPendingRef.current = null
  }, [activePaletteId])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingPlane) {
        updatePlanePosition(e)
      }
    }

  const handleMouseUp = () => {
      setIsDraggingPlane(false)
      if (!liveUpdate && pendingColorRef.current) {
        emitColorNow(pendingColorRef.current)
        pendingColorRef.current = null
      } else {
        flushThrottledColor()
      }
    }

    if (isDraggingPlane) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [emitColorNow, flushThrottledColor, isDraggingPlane, liveUpdate, updatePlanePosition])

  useEffect(() => {
    if (!draggingSlider) {
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      updateSliderFromEvent(draggingSlider, e)
    }

    const handleMouseUp = () => {
      setDraggingSlider(null)
      if (!liveUpdate && pendingColorRef.current) {
        emitColorNow(pendingColorRef.current)
        pendingColorRef.current = null
      } else {
        flushThrottledColor()
      }
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [draggingSlider, emitColorNow, flushThrottledColor, liveUpdate, updateSliderFromEvent])

  const handlePlaneMouseDown = (e: React.MouseEvent) => {
    setIsDraggingPlane(true)
    updatePlanePosition(e)
  }

  const handleSliderMouseDown = (axis: PlaneAxis, e: React.MouseEvent) => {
    e.preventDefault()
    setDraggingSlider(axis)
    updateSliderFromEvent(axis, e)
  }

  const handleHexClick = () => {
    setIsEditingHex(true)
    setTempHexValue(hexValue)
  }

  const handleHexInputChange = (value: string) => {
    setTempHexValue(value)
  }

  const handleHexSave = () => {
    const hex = tempHexValue.startsWith("#") ? tempHexValue : `#${tempHexValue}`
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      const channels = hexToChannelsByMode(hex, colorMode)
      if (channels.s > 0) {
        setPreservedHue(channels.h)
      }
      updateColorFromChannels(channels, "immediate")
    }
    setIsEditingHex(false)
  }

  const handleHexCancel = () => {
    setIsEditingHex(false)
  }

  const handleNameClick = () => {
    setIsEditingName(true)
    setTempCustomName(customName)
  }

  const handleNameInputChange = (value: string) => {
    setTempCustomName(value)
  }

  const handleNameInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const input = e.target
    const value = input.value
    const lastSlashIndex = value.lastIndexOf("/")

    // Use setTimeout to ensure selection happens after focus is complete
    setTimeout(() => {
      if (lastSlashIndex !== -1) {
        // Select text after the last "/"
        const start = lastSlashIndex + 1
        const end = value.length
        input.setSelectionRange(start, end)
      } else {
        // No slash found, select all
        input.select()
      }
    }, 0)
  }

  const handleNameSave = () => {
    setCustomName(tempCustomName)
    const fullColor = tempCustomName ? `${tempCustomName}#${hexValue.replace("#", "")}` : hexValue
    emitColorNow(fullColor)
    setIsEditingName(false)
  }

  const handleNameCancel = () => {
    setIsEditingName(false)
  }

  const handleSliderInputChange = (axis: PlaneAxis, value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      return
    }
    const normalized =
      axis === "h" ? ((parsed % 360) + 360) % 360 : Math.max(0, Math.min(100, parsed))
    const nextChannels: Hsluv = { h: hue, s: saturation, l: lightness }
    nextChannels[axis] = normalized
    if (axis === "h") {
      setPreservedHue(normalized)
    } else if (axis === "s" && normalized > 0) {
      setPreservedHue(nextChannels.h)
    }
    updateColorFromChannels(nextChannels, "immediate")
  }

  const handlePlaneModeChange = (mode: PlaneAxis) => {
    if (colorMode === "hsl") {
      return
    }
    setPlaneMode(mode)
  }

  const handleColorModeChange = (mode: ColorMode) => {
    if (mode === colorMode) {
      return
    }
    setColorMode(mode)
    if (mode === "hsl") {
      setPlaneMode("h")
    }
    if (!hexValue) {
      return
    }
    const channels = hexToChannelsByMode(hexValue, mode)
    setHue(channels.h)
    setSaturation(channels.s)
    setLightness(channels.l)
    if (channels.s > 0) {
      setPreservedHue(channels.h)
    }
  }

  const handleEyedropper = async () => {
    try {
      const eyeDropper = new window.EyeDropper()
      const result = await eyeDropper.open()
      const hex = result.sRGBHex.toUpperCase()
      const channels = hexToChannelsByMode(hex, colorMode)
      if (channels.s > 0) {
        setPreservedHue(channels.h)
      }
      updateColorFromChannels(channels, "immediate")
    } catch {
      // User cancelled
    }
  }

  const maxVisiblePerRow = useMemo(() => {
    if (!sidebarWidth || sidebarWidth <= 0) {
      return 2
    }
    const availableWidth = sidebarWidth - 80
    const circleWidth = 28
    const overlap = 8
    const effectiveCircleWidth = circleWidth - overlap
    const maxCircles = Math.floor((availableWidth - circleWidth) / effectiveCircleWidth) + 1
    return Math.max(2, maxCircles - 1)
  }, [sidebarWidth])

  const renderColorRow = (colors: ColorPalette["colors"]) => {
    const maxVisible = maxVisiblePerRow
    const visibleColors = colors.slice(0, maxVisible)
    const remainingCount = colors.length - maxVisible

    return (
      <div className="flex items-center -space-x-2 py-1.5 px-2">
        {visibleColors.map((color, i) => (
          <div
            key={color.id}
            className="h-7 w-7 rounded-full flex-shrink-0"
            style={{
              backgroundColor: color.hex,
              zIndex: i,
              boxShadow: "0 0 0 2px white, 0 0 0 3px black",
            }}
          />
        ))}
        {remainingCount > 0 && (
          <div
            className="h-7 w-7 rounded-full bg-white flex items-center justify-center flex-shrink-0"
            style={{
              zIndex: visibleColors.length + 1,
              boxShadow: "0 0 0 2px black",
            }}
          >
            <span className="text-[11px] font-bold leading-none text-black">+{remainingCount}</span>
          </div>
        )}
      </div>
    )
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverIndex(index)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      onReorderPalettes(draggedIndex, index)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleTopZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverIndex(0)
  }

  const handleTopZoneDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== 0) {
      onReorderPalettes(draggedIndex, 0)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const displayHue = saturation === 0 ? preservedHue : hue

  const currentColorHex = useMemo(
    () => channelsToHexByMode({ h: hue, s: saturation, l: lightness }, colorMode),
    [colorMode, hue, saturation, lightness],
  )

  const getChannelValue = (axis: PlaneAxis) => (axis === "h" ? hue : axis === "s" ? saturation : lightness)

  const planeCursorX = valueToRatio(planeAxes[0], getChannelValue(planeAxes[0])) * 100
  const planeCursorY = (1 - valueToRatio(planeAxes[1], getChannelValue(planeAxes[1]))) * 100

  const [planeTextureUrl, setPlaneTextureUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (typeof document === "undefined") {
      return undefined
    }

    const computeTexture = () => {
      const texture = generatePlaneTexture(colorMode, activePlaneMode, { h: hue, s: saturation, l: lightness })
      if (!cancelled) {
        setPlaneTextureUrl(texture)
      }
    }

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(computeTexture)
    } else {
      computeTexture()
    }

    return () => {
      cancelled = true
    }
  }, [activePlaneMode, colorMode, hue, saturation, lightness])

  useEffect(() => {
    return () => {
      flushThrottledColor()
    }
  }, [flushThrottledColor])

  useEffect(() => {
    if (!liveUpdate) {
      flushThrottledColor()
    }
  }, [flushThrottledColor, liveUpdate])

  const fallbackPlaneGradient =
    activePlaneMode === "h"
      ? `linear-gradient(to bottom, transparent, black), linear-gradient(to right, white, hsl(${displayHue}, 100%, 50%))`
      : activePlaneMode === "s"
        ? `linear-gradient(to bottom, black, white), linear-gradient(to right, #ff0000, #00ffff)`
        : `linear-gradient(to bottom, rgba(0,0,0,0.6), transparent), linear-gradient(to right, white, hsl(${displayHue}, 100%, 50%))`

  const planeBackgroundStyle = planeTextureUrl
    ? {
        backgroundImage: `url(${planeTextureUrl}), ${fallbackPlaneGradient}`,
        backgroundSize: "100% 100%, 100% 100%",
        backgroundRepeat: "no-repeat, no-repeat",
      }
    : {
        backgroundImage: fallbackPlaneGradient,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
      }

  const sliderValues: Record<PlaneAxis, number> = { h: hue, s: saturation, l: lightness }

  const sliderBackgrounds = useMemo(() => {
    const hueStopsNumbers = [0, 60, 120, 180, 240, 300, 360]
    const hueSegments = hueStopsNumbers
      .map((stop, index) => {
        const color = channelsToHexByMode({ h: stop, s: 100, l: 50 }, colorMode)
        const percentage = (index / (hueStopsNumbers.length - 1)) * 100
        return `${color} ${percentage}%`
      })
      .join(", ")

    const saturationStart = channelsToHexByMode({ h: hue, s: 0, l: lightness }, colorMode)
    const saturationEnd = channelsToHexByMode({ h: hue, s: 100, l: lightness }, colorMode)
    const lightnessStart = channelsToHexByMode({ h: hue, s: saturation, l: 0 }, colorMode)
    const lightnessEnd = channelsToHexByMode({ h: hue, s: saturation, l: 100 }, colorMode)

    return {
      h: `linear-gradient(to right, ${hueSegments})`,
      s: `linear-gradient(to right, ${saturationStart}, ${saturationEnd})`,
      l: `linear-gradient(to right, ${lightnessStart}, ${lightnessEnd})`,
    }
  }, [colorMode, hue, lightness, saturation])

  const sliderHandleColors: Record<PlaneAxis, string> = {
    h: channelsToHexByMode({ h: displayHue, s: 100, l: 50 }, colorMode),
    s: currentColorHex,
    l: `hsl(0 0% ${Math.max(0, Math.min(100, lightness))}%)`,
  }

  const sliderPercents: Record<PlaneAxis, number> = {
    h: valueToRatio("h", sliderValues.h) * 100,
    s: valueToRatio("s", sliderValues.s) * 100,
    l: valueToRatio("l", sliderValues.l) * 100,
  }

  const sliderLabels: Record<PlaneAxis, string> = { h: "Hue", s: "Saturation", l: "Lightness" }

  const formatChannelValue = (axis: PlaneAxis, value: number) => value.toFixed(axis === "h" ? 1 : 2)


  return (
    <div ref={sidebarRef} className="flex flex-col h-full bg-secondary">
      <div className="flex-1 overflow-auto min-h-0 space-y-3 relative px-6 py-4">
        <div
          className="relative -mb-8 z-50 h-8"
          onDragOver={handleTopZoneDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleTopZoneDrop}
        >
          {dragOverIndex === 0 && draggedIndex !== null && draggedIndex !== 0 && (
            <div className="absolute bottom-[36px] left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
          )}
        </div>

        {palettes.map((palette, index) => {
          const isCustomPalette = palette.id !== "default"
          const isDragging = draggedIndex === index
          const isDropTarget = dragOverIndex === index && draggedIndex !== index
          const showIndicatorAbove =
            isDropTarget && draggedIndex !== null && draggedIndex > index && !(index === 0 && dragOverIndex === 0)
          const showIndicatorBelow = isDropTarget && draggedIndex !== null && draggedIndex < index

          return (
            <div key={palette.id} className="relative border-0">
              {showIndicatorAbove && (
                <div className="absolute -top-[7px] left-0 right-0 h-0.5 bg-blue-500 rounded-full z-50" />
              )}

              <button
                onClick={() => onSelectPalette(palette.id)}
                className={cn(
                  "flex flex-1 flex-col items-start bg-card p-3 text-left transition-all hover:bg-accent w-full relative border-border gap-2 py-3 border rounded-xs",
                  activePaletteId === palette.id && "border-[3px] border-foreground",
                  isDragging && "opacity-50 scale-95",
                  !isCustomPalette && "cursor-pointer",
                )}
              >
                {isCustomPalette && (
                  <div
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing border-0"
                    style={{ backgroundColor: "transparent" }}
                  />
                )}

                <div className="flex flex-col gap-3 w-full">{renderColorRow(palette.colors)}</div>
                <span className="text-xs text-foreground">{palette.name}</span>
              </button>

              {showIndicatorBelow && (
                <div className="absolute -bottom-[7px] left-0 right-0 h-0.5 bg-blue-500 rounded-full z-50" />
              )}
            </div>
          )
        })}
        <Button
          variant="outline"
          className="w-full bg-transparent cursor-pointer font-semibold border rounded-xs"
          onClick={onAddPalette}
        >
          + New Palette
        </Button>
      </div>

      <div className="flex flex-col px-4 border-t-2 border-border" data-color-picker>
        {isPickerExpanded && (
          <div
            className={cn(
              "relative group h-6 w-full cursor-row-resize flex items-center justify-center my-1 transition-colors",
              isResizingPicker ? "bg-blue-50/60" : "hover:bg-blue-500/10",
            )}
            onMouseDown={(e) => {
              e.preventDefault()
              setIsResizingPicker(true)
            }}
          >
            {/* Thin horizontal line spanning full width */}
            <div
              className={cn(
                "absolute inset-x-0 top-1/2 -translate-y-1/2 h-px transition-colors",
                isResizingPicker ? "bg-blue-500" : "bg-border group-hover:bg-blue-500",
              )}
            />

            {/* Double bar indicator in the middle */}
            <div
              className={cn(
                "pointer-events-none relative flex flex-col gap-1 px-2 py-1 rounded transition-opacity duration-200",
                isResizingPicker ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
              <div
                className={cn(
                  "w-8 h-0.5 rounded-full transition-colors",
                  isResizingPicker ? "bg-blue-500" : "bg-muted-foreground/60",
                )}
              />
              <div
                className={cn(
                  "w-8 h-0.5 rounded-full transition-colors",
                  isResizingPicker ? "bg-blue-500" : "bg-muted-foreground/60",
                )}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between py-0 px-0 pl-4 my-2">
          <h3 className="text-sm font-semibold">Colour Picker</h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Live</span>
              <Switch
                checked={liveUpdate}
                onCheckedChange={setLiveUpdate}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsPickerExpanded(!isPickerExpanded)}
              className="h-6 w-6 cursor-pointer"
            >
              {isPickerExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        <div
          ref={pickerContentRef}
          className="overflow-hidden transition-all duration-200 ease-out px-0"
          style={{
            height: isPickerExpanded ? (pickerHeight === null ? "auto" : `${pickerHeight}px`) : "0px",
          }}
        >
          {editingColor ? (
            <div className="space-y-3 pb-2">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase text-muted-foreground">
                <span>Color Mode</span>
                <div className="flex gap-1">
                  {COLOR_MODE_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleColorModeChange(key)}
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] tracking-wide transition",
                        colorMode === key
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {colorMode !== "hsl" && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-semibold uppercase text-muted-foreground">
                  <span>Plane</span>
                  <div className="flex gap-1">
                    {PLANE_MODE_OPTIONS.map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handlePlaneModeChange(key)}
                        className={cn(
                          "rounded px-2 py-0.5 text-[10px] tracking-wide transition",
                          planeMode === key
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                ref={planeRef}
                className="relative w-full h-40 rounded-lg cursor-crosshair overflow-hidden border border-border"
                style={planeBackgroundStyle}
                onMouseDown={handlePlaneMouseDown}
              >
                <div
                  className="absolute w-4 h-4 border-2 border-white rounded-full shadow-lg pointer-events-none"
                  style={{
                    left: `calc(${planeCursorX}% - 8px)`,
                    top: `calc(${planeCursorY}% - 8px)`,
                    backgroundColor: currentColorHex,
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)",
                    willChange: "transform",
                  }}
                />
              </div>

              <div className="space-y-3">
                {(["h", "s", "l"] as const).map((axis) => (
                  <div className="space-y-1" key={axis}>
                    <div className="flex items-center justify-between text-xs font-medium text-foreground">
                      <span>{sliderLabels[axis]}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {axis === "h"
                          ? `${formatChannelValue(axis, sliderValues[axis])}°`
                          : `${formatChannelValue(axis, sliderValues[axis])}%`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div
                        ref={axis === "h" ? hueSliderRef : axis === "s" ? saturationSliderRef : lightnessSliderRef}
                        className="relative w-full h-3 rounded-full cursor-pointer"
                        style={{ background: sliderBackgrounds[axis] }}
                        onMouseDown={(event) => handleSliderMouseDown(axis, event)}
                      >
                        <div
                          className="absolute w-4 h-4 border-2 border-white rounded-full shadow-lg pointer-events-none -top-0.5"
                          style={{
                            left: `calc(${sliderPercents[axis]}% - 8px)`,
                            backgroundColor: sliderHandleColors[axis],
                            boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)",
                            willChange: "transform",
                          }}
                        />
                      </div>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step={axis === "h" ? 0.1 : 0.01}
                        min={0}
                        max={axis === "h" ? 359.99 : 100}
                        value={formatChannelValue(axis, sliderValues[axis])}
                        onChange={(event) => handleSliderInputChange(axis, event.target.value)}
                        className="h-8 w-20 text-center font-mono text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium w-12">Name</span>
                {isEditingName ? (
                  <Input
                    ref={nameInputRef}
                    value={tempCustomName}
                    onChange={(e) => handleNameInputChange(e.target.value)}
                    onFocus={handleNameInputFocus}
                    onBlur={handleNameCancel}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleNameSave()
                      if (e.key === "Escape") handleNameCancel()
                    }}
                    className="flex-1 text-xs h-8 border-2 border-input"
                    placeholder="e.g. primary/500"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={handleNameClick}
                    className="flex-1 text-left text-xs h-8 px-3 rounded-md border border-input hover:text-blue-600 hover:border-blue-600 transition-colors cursor-pointer bg-background"
                  >
                    {customName || "Click to add name"}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium w-12">Hex</span>
                {isEditingHex ? (
                  <Input
                    value={tempHexValue}
                    onChange={(e) => handleHexInputChange(e.target.value)}
                    onBlur={handleHexCancel}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleHexSave()
                      if (e.key === "Escape") handleHexCancel()
                    }}
                    className="flex-1 font-mono text-xs h-8 border-2 border-input"
                    placeholder="#000000"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={handleHexClick}
                    className="flex-1 text-left font-mono text-xs h-8 px-3 rounded-md border border-input hover:text-blue-600 hover:border-blue-600 transition-colors cursor-pointer bg-background"
                  >
                    {hexValue}
                  </button>
                )}
                {supportsEyedropper && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleEyedropper}
                    className="h-8 w-8 cursor-pointer bg-transparent"
                    title="Pick color from screen"
                  >
                    <Pipette className="h-3 w-3" />
                  </Button>
                )}
              </div>

            </div>
          ) : (
            <div className="flex items-center justify-center text-center text-xs text-muted-foreground p-4">
              Click on a color hex value to start editing
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function hexToChannelsByMode(hex: string, mode: ColorMode): Hsluv {
  if (mode === "hsl") {
    const { h, s, l } = hexToHSL(hex)
    return clampHsluv({ h, s, l })
  }
  const [h, s, l] = mode === "hsluv" ? hexToHsluv(hex) : hexToHpluv(hex)
  return clampHsluv({ h, s, l })
}

function channelsToHexByMode(channels: Hsluv, mode: ColorMode): string {
  const clamped = clampHsluv(channels)
  if (mode === "hsl") {
    return hslToHex(clamped.h, clamped.s, clamped.l).toUpperCase()
  }
  return (mode === "hsluv"
    ? hsluvToHex(clamped.h, clamped.s, clamped.l)
    : hpluvToHex(clamped.h, clamped.s, clamped.l)
  ).toUpperCase()
}

const ratioToValue = (axis: PlaneAxis, ratio: number) => (axis === "h" ? ratio * 360 : ratio * 100)
const valueToRatio = (axis: PlaneAxis, value: number) => (axis === "h" ? value / 360 : value / 100)

function generatePlaneTexture(mode: ColorMode, plane: PlaneAxis, base: Hsluv): string | null {
  if (typeof document === "undefined") {
    return null
  }

  const canvas = document.createElement("canvas")
  const size = 64
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return null
  }

  const axes = plane === "h" ? (["s", "l"] as const) : plane === "s" ? (["h", "l"] as const) : (["h", "s"] as const)
  const imageData = ctx.createImageData(size, size)
  const data = imageData.data

  for (let y = 0; y < size; y += 1) {
    const ratioY = 1 - y / (size - 1)
    const axisYValue = ratioToValue(axes[1], ratioY)
    for (let x = 0; x < size; x += 1) {
      const ratioX = x / (size - 1)
      const axisXValue = ratioToValue(axes[0], ratioX)
      const next: Hsluv = { ...base }
      next[axes[0]] = axisXValue
      next[axes[1]] = axisYValue
      const hex = channelsToHexByMode(next, mode)
      const r = Number.parseInt(hex.slice(1, 3), 16)
      const g = Number.parseInt(hex.slice(3, 5), 16)
      const b = Number.parseInt(hex.slice(5, 7), 16)
      const idx = (y * size + x) * 4
      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
      data[idx + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL()
}

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return { h: 0, s: 0, l: 0 }

  const r = Number.parseInt(result[1], 16) / 255
  const g = Number.parseInt(result[2], 16) / 255
  const b = Number.parseInt(result[3], 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
  }
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0

  if (0 <= h && h < 60) {
    r = c
    g = x
    b = 0
  } else if (60 <= h && h < 120) {
    r = x
    g = c
    b = 0
  } else if (120 <= h && h < 180) {
    r = 0
    g = c
    b = x
  } else if (180 <= h && h < 240) {
    r = 0
    g = x
    b = c
  } else if (240 <= h && h < 300) {
    r = x
    g = 0
    b = c
  } else if (300 <= h && h < 360) {
    r = c
    g = 0
    b = x
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16)
    return hex.length === 1 ? "0" + hex : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
