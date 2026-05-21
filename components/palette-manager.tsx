"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { ColorPalette, EditingColor } from "@/types/palette"
import { storage } from "@/lib/storage-utils"
import { SEGMENTED_TOGGLE_CLASSNAMES } from "@/lib/design-tokens"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronUp, Pipette } from "lucide-react"
import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect, useSyncExternalStore } from "react"
import {
  clampHsluv,
  hexToHsluv,
  hsluvToHex,
  maxChromaForHsluv,
  type Hsluv,
} from "@/lib/hsluv"
import {
  HSLUV_LIGHTNESS_EPSILON,
  HSLUV_TEXTURE_SIZE,
  getPickerGeometry,
  getPickerScale,
  mapHsluvSelectionToPlanePoint,
  mapPlanePointToHsluvSelection,
  normalizeHueInputDegrees,
  toPixelCoordinate,
} from "@/lib/hsluv-picker-geometry"
import { hexToHSL, hslToHex } from "@/lib/hsl"
import { drawHslPlaneTexture, generatePlaneTexture } from "@/lib/picker-plane-texture"

type PaletteManagerProps = {
  palettes: ColorPalette[]
  activePaletteId: string
  onSelectPalette: (id: string) => void
  onAddPalette: () => void
  onReorderPalettes: (fromIndex: number, toIndex: number) => void
  editingColor: EditingColor
  onColorChange: (color: string) => void
  lastInteractedColor?: string
  showPaletteList?: boolean
}

type ColorMode = "hsl" | "hsluv"
type PlaneAxis = "h" | "s" | "l"

const COLOR_MODE_OPTIONS: Array<{ key: ColorMode; label: string }> = [
  { key: "hsl", label: "HSL" },
  { key: "hsluv", label: "HSLuv" },
]

const subscribeToStaticCapability = () => () => {}
const getEyedropperSnapshot = () => typeof window !== "undefined" && "EyeDropper" in window
const getServerEyedropperSnapshot = () => false

export function PaletteManager({
  palettes,
  activePaletteId,
  onSelectPalette,
  onAddPalette,
  onReorderPalettes,
  editingColor,
  onColorChange,
  lastInteractedColor: _lastInteractedColor = "#808080",
  showPaletteList = true,
}: PaletteManagerProps) {
  void _lastInteractedColor
  const [isPickerExpanded, setIsPickerExpanded] = useState(true)
  const [pickerHeight, setPickerHeight] = useState<number | null>(null)
  const [isResizingPicker, setIsResizingPicker] = useState(false)
  const [hasCustomPickerHeight, setHasCustomPickerHeight] = useState(false)
  const supportsEyedropper = useSyncExternalStore(
    subscribeToStaticCapability,
    getEyedropperSnapshot,
    getServerEyedropperSnapshot,
  )
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

  const [isEditingHex, setIsEditingHex] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [tempHexValue, setTempHexValue] = useState("")
  const [tempCustomName, setTempCustomName] = useState("")

  const planeRef = useRef<HTMLDivElement>(null)
  const planeCanvasRef = useRef<HTMLCanvasElement>(null)
  const hueSliderRef = useRef<HTMLDivElement>(null)
  const saturationSliderRef = useRef<HTMLDivElement>(null)
  const lightnessSliderRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [isDraggingPlane, setIsDraggingPlane] = useState(false)
  const [draggingSlider, setDraggingSlider] = useState<PlaneAxis | null>(null)

  const pendingColorRef = useRef<string | null>(null)
  const previousEditingColorRef = useRef<string | null>(null)
  const frozenEditingColorRef = useRef<EditingColor | null>(null)
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

  const activePlaneMode: PlaneAxis = colorMode === "hsl" ? "h" : "l"
  const pickerGeometry = useMemo(
    () =>
      colorMode === "hsl"
        ? { lines: [], vertices: [], angles: [], outerCircleRadius: 0, innerCircleRadius: 0 }
        : getPickerGeometry(lightness),
    [colorMode, lightness],
  )
  const pickerScale = useMemo(
    () => getPickerScale(pickerGeometry, HSLUV_TEXTURE_SIZE, HSLUV_TEXTURE_SIZE),
    [pickerGeometry],
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

      if (colorMode === "hsl") {
        const ratioX = x / rect.width
        const ratioY = y / rect.height
        const nextChannels: Hsluv = {
          h: hue,
          s: ratioToValue("s", ratioX),
          l: ratioToValue("l", 1 - ratioY),
        }
        if (nextChannels.s > 0) {
          setPreservedHue(nextChannels.h)
        }
        updateColorFromChannels(nextChannels)
        return
      }

      const scaleForRect = getPickerScale(pickerGeometry, rect.width, rect.height)
      const selection = mapPlanePointToHsluvSelection(
        x,
        y,
        rect.width,
        rect.height,
        lightness,
        pickerGeometry,
        scaleForRect,
        preservedHue,
      )
      const nextChannels: Hsluv = {
        h: selection.h,
        s: selection.s,
        l: lightness,
      }

      if (nextChannels.s > 0) {
        setPreservedHue(nextChannels.h)
      }
      updateColorFromChannels(nextChannels)
    },
    [colorMode, hue, lightness, pickerGeometry, preservedHue, updateColorFromChannels],
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
    if (isDraggingPlane || draggingSlider !== null) {
      return
    }

    const activeEditing = editingColor ?? frozenEditingColorRef.current
    if (!activeEditing?.swatch) {
      previousEditingColorRef.current = null
      return
    }

    const colorKey = `${activeEditing.swatch.id}-${activeEditing.swatch.hex}-${activeEditing.swatch.name ?? ""}-${activeEditing.swatch.group ?? ""}`
    if (previousEditingColorRef.current === colorKey) {
      return
    }
    previousEditingColorRef.current = colorKey
    frozenEditingColorRef.current = activeEditing

    const applyEditingColor = () => {
      const hex = activeEditing.swatch.hex
      const name = activeEditing.swatch.name ?? ""

      setCustomName(name)
      const reuseStored =
        lastEmittedColorRef.current === activeEditing.legacyValue &&
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
  }, [colorMode, draggingSlider, editingColor, isDraggingPlane])


  useEffect(() => {
    if (!showPaletteList) {
      return
    }
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
  }, [isResizingPicker, showPaletteList])

  useLayoutEffect(() => {
    if (!showPaletteList || !isPickerExpanded || hasCustomPickerHeight) {
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
  }, [activePaletteId, colorMode, editingColor, hasCustomPickerHeight, isPickerExpanded, showPaletteList, sidebarWidth])

  useEffect(() => {
    if (!showPaletteList) {
      return
    }
    if (!isResizingPicker && hasCustomPickerHeight && pickerHeightPendingRef.current !== null) {
      storage.savePickerHeight(activePaletteId, Math.round(pickerHeightPendingRef.current))
      pickerHeightPendingRef.current = null
    }
  }, [activePaletteId, hasCustomPickerHeight, isResizingPicker, showPaletteList])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!showPaletteList) {
      setPickerHeight(null)
      setHasCustomPickerHeight(false)
      pickerHeightPendingRef.current = null
      return
    }
    const storedHeight = storage.loadPickerHeight(activePaletteId)
    if (typeof storedHeight === "number" && storedHeight > 0) {
      setPickerHeight(storedHeight)
      setHasCustomPickerHeight(true)
    } else {
      setPickerHeight(null)
      setHasCustomPickerHeight(false)
    }
    pickerHeightPendingRef.current = null
  }, [activePaletteId, showPaletteList])
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
      setIsEditingHex(false)
      return
    }
    setTempHexValue(hexValue)
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

  const sliderValues: Record<PlaneAxis, number> = { h: hue, s: saturation, l: lightness }

  const formatChannelValue = (axis: PlaneAxis, value: number) => value.toFixed(axis === "h" ? 1 : 2)

  const [sliderInputValues, setSliderInputValues] = useState<Record<PlaneAxis, string>>(() => ({
    h: formatChannelValue("h", sliderValues.h),
    s: formatChannelValue("s", sliderValues.s),
    l: formatChannelValue("l", sliderValues.l),
  }))

  const handleSliderInputChange = (axis: PlaneAxis, value: string) => {
    setSliderInputValues((current) => ({
      ...current,
      [axis]: value,
    }))
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSliderInputValues({
      h: formatChannelValue("h", hue),
      s: formatChannelValue("s", saturation),
      l: formatChannelValue("l", lightness),
    })
  }, [hue, saturation, lightness])
  /* eslint-enable react-hooks/set-state-in-effect */

  const commitSliderInputValue = useCallback(
    (axis: PlaneAxis) => {
      setSliderInputValues((current) => {
        const raw = (current[axis] ?? "").trim().replace(",", ".")
        const fallbackValue = axis === "h" ? hue : axis === "s" ? saturation : lightness
        const revertState = { ...current, [axis]: formatChannelValue(axis, fallbackValue) }

        if (!raw) {
          return revertState
        }

        const parsed = Number(raw)
        if (!Number.isFinite(parsed)) {
          return revertState
        }

        const normalized =
          axis === "h"
            ? normalizeHueInputDegrees(parsed)
            : Math.max(0, Math.min(100, parsed))
        const nextChannels: Hsluv = { h: hue, s: saturation, l: lightness }
        nextChannels[axis] = normalized
        if (axis === "h") {
          setPreservedHue(normalized)
        } else if (axis === "s" && normalized > 0) {
          setPreservedHue(nextChannels.h)
        }
        updateColorFromChannels(nextChannels, "immediate")
        return {
          ...current,
          [axis]: formatChannelValue(axis, normalized),
        }
      })
    },
    [hue, saturation, lightness, updateColorFromChannels],
  )

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

  const handleColorModeChange = (nextMode: ColorMode) => {
    if (nextMode === colorMode) {
      return
    }
    setColorMode(nextMode)
    if (!hexValue) {
      return
    }
    const channels = hexToChannelsByMode(hexValue, nextMode)
    setHue(channels.h)
    setSaturation(channels.s)
    setLightness(channels.l)
    if (channels.s > 0) {
      setPreservedHue(channels.h)
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
  const isExtremeLightness =
    colorMode === "hsluv" &&
    (lightness <= HSLUV_LIGHTNESS_EPSILON || lightness >= 100 - HSLUV_LIGHTNESS_EPSILON)

  const currentColorHex = useMemo(
    () => channelsToHexByMode({ h: hue, s: saturation, l: lightness }, colorMode),
    [colorMode, hue, saturation, lightness],
  )

  const planeSelection = useMemo(
    () => {
      if (colorMode === "hsl") {
        return {
          xPercent: Math.max(0, Math.min(100, saturation)),
          yPercent: Math.max(0, Math.min(100, 100 - lightness)),
        }
      }
      return mapHsluvSelectionToPlanePoint(
        saturation > 0 ? hue : preservedHue,
        saturation,
        lightness,
        pickerGeometry,
        pickerScale,
        HSLUV_TEXTURE_SIZE,
        HSLUV_TEXTURE_SIZE,
      )
    },
    [colorMode, hue, lightness, pickerGeometry, pickerScale, preservedHue, saturation],
  )
  const planeCursorX = planeSelection.xPercent
  const planeCursorY = planeSelection.yPercent
  const planeOverlay = useMemo(() => {
    if (colorMode === "hsl") {
      return null
    }
    if (pickerGeometry.vertices.length === 0 || pickerGeometry.outerCircleRadius <= 0) {
      return null
    }
    const points = pickerGeometry.vertices
      .map((point) => toPixelCoordinate(point, HSLUV_TEXTURE_SIZE, HSLUV_TEXTURE_SIZE, pickerScale))
      .map((point) => `${(point.x / HSLUV_TEXTURE_SIZE) * 100},${(point.y / HSLUV_TEXTURE_SIZE) * 100}`)
      .join(" ")
    const innerRadiusPercent = (pickerScale * pickerGeometry.innerCircleRadius * 100) / HSLUV_TEXTURE_SIZE
    const outerRadiusPercent = (pickerScale * pickerGeometry.outerCircleRadius * 100) / HSLUV_TEXTURE_SIZE
    return {
      points,
      innerRadiusPercent,
      outerRadiusPercent,
    }
  }, [colorMode, pickerGeometry, pickerScale])
  const overlayStroke = lightness > 70 ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.9)"
  const outerCircleStroke = "#000000"
  const selectedHueForSafety = saturation > 0 ? hue : preservedHue
  const selectedChroma = useMemo(() => {
    const maxChroma = maxChromaForHsluv(selectedHueForSafety, lightness)
    return (maxChroma * Math.max(0, Math.min(100, saturation))) / 100
  }, [lightness, saturation, selectedHueForSafety])
  const isChromaSafe = !isExtremeLightness && selectedChroma <= pickerGeometry.innerCircleRadius + 0.0001
  const chromaSafetyText = isExtremeLightness
    ? "N/A at L 0/100"
    : isChromaSafe
      ? "Chroma safe"
      : "Outside safe range"

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined
    }
    const canvas = planeCanvasRef.current
    const planeNode = planeRef.current
    if (!canvas || !planeNode) {
      return undefined
    }

    let cancelled = false
    const drawTexture = () => {
      if (cancelled) {
        return
      }

      const rect = planeNode.getBoundingClientRect()
      const cssWidth = Math.max(1, Math.round(rect.width))
      const cssHeight = Math.max(1, Math.round(rect.height))
      const dpr = window.devicePixelRatio || 1
      const pixelWidth = Math.max(1, Math.round(cssWidth * dpr))
      const pixelHeight = Math.max(1, Math.round(cssHeight * dpr))

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }
      canvas.style.width = `${cssWidth}px`
      canvas.style.height = `${cssHeight}px`

      const context = canvas.getContext("2d")
      if (!context) {
        return
      }

      if (isExtremeLightness) {
        context.clearRect(0, 0, canvas.width, canvas.height)
        return
      }

      context.clearRect(0, 0, canvas.width, canvas.height)
      if (colorMode === "hsl") {
        const gradientHue = saturation === 0 ? preservedHue : hue
        drawHslPlaneTexture(context, pixelWidth, pixelHeight, gradientHue)
      } else {
        const textureCanvas = generatePlaneTexture(
          colorMode,
          activePlaneMode,
          { h: 0, s: 0, l: lightness },
          pickerGeometry,
          pixelWidth,
          pixelHeight,
        )
        if (textureCanvas) {
          context.drawImage(textureCanvas, 0, 0)
        }
      }
    }

    const frameId = window.requestAnimationFrame(drawTexture)

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
    }
  }, [activePlaneMode, colorMode, hue, isExtremeLightness, lightness, pickerGeometry, preservedHue, sidebarWidth, saturation])

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
  const pickerExpanded = showPaletteList ? isPickerExpanded : true
  const pickerContentHeight = showPaletteList
    ? pickerExpanded
      ? (pickerHeight === null ? "auto" : `${pickerHeight}px`)
      : "auto"
    : undefined


  return (
    <div ref={sidebarRef} className="flex h-full flex-col bg-background">
      {showPaletteList && (
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
                    "flex flex-1 flex-col items-start bg-card p-3 text-left transition-all hover:bg-accent w-full relative border-border gap-2 py-3 border rounded-lg",
                    activePaletteId === palette.id && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
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
            className="w-full bg-transparent cursor-pointer font-semibold border rounded-lg"
            onClick={onAddPalette}
          >
            + New Palette
          </Button>
        </div>
      )}

      <div
        className={cn("flex flex-col", showPaletteList ? "border-t-2 border-border px-4" : "flex-1 min-h-0 px-1.5 py-4")}
        data-color-picker
      >
        {showPaletteList && pickerExpanded && (
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
            <div
              className={cn(
                "absolute inset-x-0 top-1/2 -translate-y-1/2 h-px transition-colors",
                isResizingPicker ? "bg-blue-500" : "bg-border group-hover:bg-blue-500",
              )}
            />
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

        <div
          ref={pickerContentRef}
          className={cn(
            "px-0",
            showPaletteList
              ? "overflow-hidden transition-all duration-200 ease-out"
              : "flex-1 overflow-y-auto overflow-x-visible",
          )}
          style={{
            height: pickerContentHeight,
          }}
        >
          <div className="space-y-3 px-2.5 pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Colour space
                </span>
                <div className={SEGMENTED_TOGGLE_CLASSNAMES.container}>
                  {COLOR_MODE_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleColorModeChange(key)}
                      className={cn(
                        SEGMENTED_TOGGLE_CLASSNAMES.option,
                        colorMode === key
                          ? SEGMENTED_TOGGLE_CLASSNAMES.optionActive
                          : SEGMENTED_TOGGLE_CLASSNAMES.optionInactive,
                      )}
                      aria-pressed={colorMode === key}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Live</span>
                <Switch
                  checked={liveUpdate}
                  onCheckedChange={setLiveUpdate}
                  className="data-[state=checked]:bg-blue-600"
                />
                {showPaletteList && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsPickerExpanded(!isPickerExpanded)}
                    className="h-6 w-6 cursor-pointer"
                  >
                    {pickerExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                  </Button>
                )}
              </div>
            </div>

            <>
                <div
                  ref={planeRef}
                  className={cn(
                    "relative mx-auto w-full aspect-square overflow-visible",
                    isExtremeLightness ? "cursor-default" : "cursor-crosshair",
                  )}
                  onMouseDown={isExtremeLightness ? undefined : handlePlaneMouseDown}
                >
                  <div className="absolute inset-0 rounded-lg overflow-hidden border border-border bg-muted/50">
                    <canvas ref={planeCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
                    {!isExtremeLightness && planeOverlay && (
                      <svg
                        className="pointer-events-none absolute inset-0 h-full w-full"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        aria-hidden
                      >
                        <circle
                          cx="50"
                          cy="50"
                          r={planeOverlay.outerRadiusPercent.toString()}
                          fill="none"
                          stroke={outerCircleStroke}
                          strokeWidth="0.35"
                          strokeOpacity="1"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r={planeOverlay.innerRadiusPercent.toString()}
                          fill="none"
                          stroke={overlayStroke}
                          strokeWidth="0.45"
                          strokeOpacity="0.65"
                        />
                        <circle cx="50" cy="50" r="0.7" fill={overlayStroke} />
                      </svg>
                    )}
                  </div>
                  {!isExtremeLightness && (
                    <div
                      className="pointer-events-none absolute z-20 h-4 w-4 rounded-full border border-white shadow-lg"
                      style={{
                        left: `clamp(-8px, calc(${planeCursorX}% - 8px), calc(100% - 9px))`,
                        top: `clamp(-7px, calc(${planeCursorY}% - 8px), calc(100% - 8px))`,
                        backgroundColor: currentColorHex,
                        boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)",
                        willChange: "transform",
                      }}
                    />
                  )}
                </div>

              <div className="space-y-3">
                {(["h", "s", "l"] as const).map((axis) => (
                  <div className="space-y-1" key={axis}>
                    <div className="flex items-center justify-between text-xs font-medium text-foreground">
                      <span>{sliderLabels[axis]}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {axis === "h"
                          ? `${formatChannelValue(axis, sliderValues[axis])} deg`
                          : `${formatChannelValue(axis, sliderValues[axis])}%`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 overflow-visible">
                      <div className="flex-1">
                        <div
                          ref={axis === "h" ? hueSliderRef : axis === "s" ? saturationSliderRef : lightnessSliderRef}
                          className="relative h-3 w-full cursor-pointer rounded-full overflow-visible"
                          style={{ background: sliderBackgrounds[axis] }}
                          onMouseDown={(event) => handleSliderMouseDown(axis, event)}
                        >
                          <div
                            className="pointer-events-none absolute -top-0.5 z-20 h-4 w-4 rounded-full border border-white shadow-lg"
                            style={{
                              left: `calc(${sliderPercents[axis]}% - 8px)`,
                              backgroundColor: sliderHandleColors[axis],
                              boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)",
                              willChange: "transform",
                            }}
                          />
                        </div>
                      </div>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step={axis === "h" ? 0.1 : 0.01}
                        min={0}
                        max={axis === "h" ? 359.99 : 100}
                        value={sliderInputValues[axis]}
                        onChange={(event) => handleSliderInputChange(axis, event.target.value)}
                        onBlur={() => commitSliderInputValue(axis)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            commitSliderInputValue(axis)
                          } else if (event.key === "Escape") {
                            setSliderInputValues((current) => ({
                              ...current,
                              [axis]: formatChannelValue(axis, sliderValues[axis]),
                            }))
                          }
                        }}
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
                    onBlur={() => {
                      setIsEditingName(false)
                      setCustomName(tempCustomName)
                      const fullColor = tempCustomName ? `${tempCustomName}#${hexValue.replace("#", "")}` : hexValue
                      emitColorNow(fullColor)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleNameSave()
                      if (e.key === "Escape") handleNameCancel()
                    }}
                    className="flex-1 text-xs h-8 border border-input"
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
                    ref={(node) => {
                      if (node && tempHexValue === hexValue) {
                        requestAnimationFrame(() => node.select())
                      }
                    }}
                    value={tempHexValue}
                    onChange={(e) => handleHexInputChange(e.target.value)}
                    onBlur={handleHexSave}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleHexSave()
                      if (e.key === "Escape") {
                        setTempHexValue(hexValue)
                        setIsEditingHex(false)
                      }
                    }}
                    className="flex-1 font-mono text-xs h-8 border border-input"
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
              {colorMode === "hsluv" && (
                <div className="flex items-center justify-between rounded-md border border-input bg-background px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        isExtremeLightness
                          ? "bg-muted-foreground/60"
                          : isChromaSafe
                            ? "bg-emerald-500"
                            : "bg-amber-500",
                      )}
                    />
                    <span className="text-xs font-medium text-foreground">Inner Circle</span>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      isExtremeLightness
                        ? "text-muted-foreground"
                        : isChromaSafe
                          ? "text-emerald-700"
                          : "text-amber-700",
                    )}
                  >
                    {chromaSafetyText}
                  </span>
                </div>
              )}
              {colorMode === "hsluv" && (
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  HSLuv color space by{" "}
                  <a
                    href="https://github.com/boronine"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Alexei Boronine
                  </a>{" "}
                  and contributors. Source:{" "}
                  <a
                    href="https://www.hsluv.org/"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    hsluv.org
                  </a>{" "}
                  /{" "}
                  <a
                    href="https://github.com/hsluv/hsluv"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    github.com/hsluv/hsluv
                  </a>
                  .
                </p>
              )}
              </>
          </div>
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
  const [h, s, l] = hexToHsluv(hex)
  return clampHsluv({ h, s, l })
}

function channelsToHexByMode(channels: Hsluv, mode: ColorMode): string {
  const clamped = clampHsluv(channels)
  if (mode === "hsl") {
    return hslToHex(clamped.h, clamped.s, clamped.l).toUpperCase()
  }
  return hsluvToHex(clamped.h, clamped.s, clamped.l).toUpperCase()
}

const ratioToValue = (axis: PlaneAxis, ratio: number) => (axis === "h" ? ratio * 360 : ratio * 100)
const valueToRatio = (axis: PlaneAxis, value: number) => (axis === "h" ? value / 360 : value / 100)


