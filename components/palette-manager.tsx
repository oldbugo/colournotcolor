"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { ColorPalette } from "@/app/page"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronUp, Pipette } from "lucide-react"
import { useState, useRef, useEffect, useMemo } from "react"

type PaletteManagerProps = {
  palettes: ColorPalette[]
  activePaletteId: string
  onSelectPalette: (id: string) => void
  onAddPalette: () => void
  onReorderPalettes: (fromIndex: number, toIndex: number) => void
  editingColor: { type: "foreground" | "background"; index: number; color: string } | null
  onColorChange: (color: string) => void
}

export function PaletteManager({
  palettes,
  activePaletteId,
  onSelectPalette,
  onAddPalette,
  onReorderPalettes,
  editingColor,
  onColorChange,
}: PaletteManagerProps) {
  const [isPickerExpanded, setIsPickerExpanded] = useState(true)
  const [pickerHeight, setPickerHeight] = useState(400)
  const [isResizingPicker, setIsResizingPicker] = useState(false)
  const [supportsEyedropper, setSupportsEyedropper] = useState(false)
  const [liveUpdate, setLiveUpdate] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(100)
  const [lightness, setLightness] = useState(50)
  const [preservedHue, setPreservedHue] = useState(0)
  const [hexValue, setHexValue] = useState("")
  const [customName, setCustomName] = useState("")

  const [isEditingHex, setIsEditingHex] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [isEditingLightness, setIsEditingLightness] = useState(false)
  const [tempHexValue, setTempHexValue] = useState("")
  const [tempCustomName, setTempCustomName] = useState("")
  const [tempLightness, setTempLightness] = useState("")

  const gradientRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const lightnessRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [isDraggingGradient, setIsDraggingGradient] = useState(false)
  const [isDraggingHue, setIsDraggingHue] = useState(false)
  const [isDraggingLightness, setIsDraggingLightness] = useState(false)

  const pendingColorRef = useRef<string | null>(null)

  useEffect(() => {
    setSupportsEyedropper("EyeDropper" in window)
  }, [])

  useEffect(() => {
    if (editingColor && editingColor.color) {
      const parts = editingColor.color.split("#")
      const name = parts.length > 1 ? parts[0] : ""
      const hex = "#" + (parts.length > 1 ? parts[1] : parts[0].replace("#", ""))

      setCustomName(name)
      const hsl = hexToHSL(hex)
      setHue(hsl.h)
      setSaturation(hsl.s)
      setLightness(hsl.l)
      if (hsl.s > 0) {
        setPreservedHue(hsl.h)
      }
      setHexValue(hex.toUpperCase())
    }
  }, [editingColor])

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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingGradient) {
        updateGradientPosition(e)
      }
    }

    const handleMouseUp = () => {
      setIsDraggingGradient(false)
      if (!liveUpdate && pendingColorRef.current) {
        onColorChange(pendingColorRef.current)
        pendingColorRef.current = null
      }
    }

    if (isDraggingGradient) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDraggingGradient, hue, saturation, preservedHue, customName, onColorChange, liveUpdate])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingHue) {
        updateHuePosition(e)
      }
    }

    const handleMouseUp = () => {
      setIsDraggingHue(false)
      if (!liveUpdate && pendingColorRef.current) {
        onColorChange(pendingColorRef.current)
        pendingColorRef.current = null
      }
    }

    if (isDraggingHue) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDraggingHue, saturation, lightness, customName, onColorChange, liveUpdate])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLightness) {
        updateLightnessPosition(e)
      }
    }

    const handleMouseUp = () => {
      setIsDraggingLightness(false)
      if (!liveUpdate && pendingColorRef.current) {
        onColorChange(pendingColorRef.current)
        pendingColorRef.current = null
      }
    }

    if (isDraggingLightness) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDraggingLightness, hue, saturation, customName, onColorChange, liveUpdate])

  const handleGradientMouseDown = (e: React.MouseEvent) => {
    setIsDraggingGradient(true)
    updateGradientPosition(e)
  }

  const updateGradientPosition = (e: React.MouseEvent | MouseEvent) => {
    if (!gradientRef.current) return

    const rect = gradientRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height))

    const newSaturation = (x / rect.width) * 100
    const newLightness = 100 - (y / rect.height) * 100

    setSaturation(newSaturation)
    setLightness(newLightness)

    const effectiveHue = newSaturation > 0 && saturation === 0 ? preservedHue : hue
    if (newSaturation > 0) {
      setHue(effectiveHue)
    }

    const newColor = hslToHex(effectiveHue, newSaturation, newLightness)
    setHexValue(newColor.toUpperCase())
    const fullColor = customName ? `${customName}#${newColor.replace("#", "")}` : newColor
    if (liveUpdate) {
      onColorChange(fullColor)
    } else {
      pendingColorRef.current = fullColor
    }
  }

  const handleHueMouseDown = (e: React.MouseEvent) => {
    setIsDraggingHue(true)
    updateHuePosition(e)
  }

  const updateHuePosition = (e: React.MouseEvent | MouseEvent) => {
    if (!hueRef.current) return

    const rect = hueRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const newHue = (x / rect.width) * 360

    setHue(newHue)
    setPreservedHue(newHue)

    const newColor = hslToHex(newHue, saturation, lightness)
    setHexValue(newColor.toUpperCase())
    const fullColor = customName ? `${customName}#${newColor.replace("#", "")}` : newColor
    if (liveUpdate) {
      onColorChange(fullColor)
    } else {
      pendingColorRef.current = fullColor
    }
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
      const hsl = hexToHSL(hex)
      setHue(hsl.h)
      setSaturation(hsl.s)
      setLightness(hsl.l)
      if (hsl.s > 0) {
        setPreservedHue(hsl.h)
      }
      setHexValue(hex.toUpperCase())
      const fullColor = customName ? `${customName}#${hex.replace("#", "")}` : hex
      onColorChange(fullColor)
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
    onColorChange(fullColor)
    setIsEditingName(false)
  }

  const handleNameCancel = () => {
    setIsEditingName(false)
  }

  const handleLightnessMouseDown = (e: React.MouseEvent) => {
    setIsDraggingLightness(true)
    updateLightnessPosition(e)
  }

  const updateLightnessPosition = (e: React.MouseEvent | MouseEvent) => {
    if (!lightnessRef.current) return

    const rect = lightnessRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const newLightness = (x / rect.width) * 100

    setLightness(newLightness)

    const newColor = hslToHex(hue, saturation, newLightness)
    setHexValue(newColor.toUpperCase())
    const fullColor = customName ? `${customName}#${newColor.replace("#", "")}` : newColor
    if (liveUpdate) {
      onColorChange(fullColor)
    } else {
      pendingColorRef.current = fullColor
    }
  }

  const handleLightnessClick = () => {
    setIsEditingLightness(true)
    setTempLightness(Math.round(lightness).toString())
  }

  const handleLightnessInputChange = (value: string) => {
    setTempLightness(value)
  }

  const handleLightnessSave = () => {
    const numValue = Number.parseInt(tempLightness, 10)
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setLightness(numValue)
      const newColor = hslToHex(hue, saturation, numValue)
      setHexValue(newColor.toUpperCase())
      const fullColor = customName ? `${customName}#${newColor.replace("#", "")}` : newColor
      onColorChange(fullColor)
    }
    setIsEditingLightness(false)
  }

  const handleLightnessCancel = () => {
    setIsEditingLightness(false)
  }

  const handleEyedropper = async () => {
    try {
      const eyeDropper = new (window as any).EyeDropper()
      const result = await eyeDropper.open()
      const hex = result.sRGBHex.toUpperCase()
      const hsl = hexToHSL(hex)
      setHue(hsl.h)
      setSaturation(hsl.s)
      setLightness(hsl.l)
      if (hsl.s > 0) {
        setPreservedHue(hsl.h)
      }
      setHexValue(hex)
      const fullColor = customName ? `${customName}#${hex.replace("#", "")}` : hex
      onColorChange(fullColor)
    } catch (e) {
      // User cancelled
    }
  }

  const extractHex = (color: string): string => {
    const parts = color.split("#")
    return "#" + (parts.length > 1 ? parts[1] : parts[0].replace("#", ""))
  }

  const calculateMaxVisible = () => {
    if (!sidebarRef.current) return 2
    const availableWidth = sidebarRef.current.offsetWidth - 80
    const circleWidth = 28
    const overlap = 8
    const effectiveCircleWidth = circleWidth - overlap
    const maxCircles = Math.floor((availableWidth - circleWidth) / effectiveCircleWidth) + 1
    return Math.max(2, maxCircles - 1)
  }

  const renderColorRow = (colors: string[]) => {
    const maxVisible = calculateMaxVisible()
    const visibleColors = colors.slice(0, maxVisible)
    const remainingCount = colors.length - maxVisible

    return (
      <div className="flex items-center -space-x-2 py-1.5 px-2">
        {visibleColors.map((color, i) => (
          <div
            key={i}
            className="h-7 w-7 rounded-full flex-shrink-0"
            style={{
              backgroundColor: extractHex(color),
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

  const gradientX = (saturation / 100) * 100
  const gradientY = (1 - lightness / 100) * 100
  const displayHue = saturation === 0 ? preservedHue : hue
  const hueX = (displayHue / 360) * 100
  const lightnessX = (lightness / 100) * 100

  const gradientBackground = useMemo(
    () =>
      `linear-gradient(to bottom, transparent, black), linear-gradient(to right, white, hsl(${displayHue}, 100%, 50%))`,
    [displayHue],
  )

  const lightnessBackground = useMemo(
    () =>
      `linear-gradient(to right, hsl(${displayHue}, ${saturation}%, 0%), hsl(${displayHue}, ${saturation}%, 50%), hsl(${displayHue}, ${saturation}%, 100%))`,
    [displayHue, saturation],
  )

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

                <div className="flex flex-col gap-3 w-full">
                  {renderColorRow(palette.foregroundColors)}
                  {renderColorRow(palette.backgroundColors)}
                </div>
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
              "relative h-6 w-full cursor-row-resize flex items-center justify-center my-1 transition-colors",
              !isResizingPicker && "hover:bg-blue-500/10",
            )}
            onMouseDown={(e) => {
              e.preventDefault()
              setIsResizingPicker(true)
            }}
          >
            {/* Thin horizontal line spanning full width */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border" />

            {/* Double bar indicator in the middle */}
            <div
              className={cn(
                "relative flex flex-col gap-1 px-2 py-1 rounded transition-opacity",
                !isResizingPicker && "group-hover:opacity-100",
              )}
            >
              <div
                className={cn(
                  "w-8 h-0.5 rounded-full transition-colors",
                  isResizingPicker ? "bg-blue-500" : "bg-muted-foreground/50",
                )}
              />
              <div
                className={cn(
                  "w-8 h-0.5 rounded-full transition-colors",
                  isResizingPicker ? "bg-blue-500" : "bg-muted-foreground/50",
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
          className="overflow-hidden transition-all duration-200 ease-out px-0"
          style={{
            height: isPickerExpanded ? `${pickerHeight}px` : "0px",
          }}
        >
          {editingColor ? (
            <div className="space-y-3 pb-2">
              <div
                ref={gradientRef}
                className="relative w-full h-40 rounded-lg cursor-crosshair overflow-hidden"
                style={{
                  background: gradientBackground,
                }}
                onMouseDown={handleGradientMouseDown}
              >
                <div
                  className="absolute w-4 h-4 border-2 border-white rounded-full shadow-lg pointer-events-none"
                  style={{
                    left: `calc(${gradientX}% - 8px)`,
                    top: `calc(${gradientY}% - 8px)`,
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)",
                    willChange: "transform",
                  }}
                />
              </div>

              <div
                ref={hueRef}
                className="relative w-full h-3 rounded-full cursor-pointer"
                style={{
                  background:
                    "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                }}
                onMouseDown={handleHueMouseDown}
              >
                <div
                  className="absolute w-4 h-4 border-2 border-white rounded-full shadow-lg pointer-events-none -top-0.5"
                  style={{
                    left: `calc(${hueX}% - 8px)`,
                    backgroundColor: `hsl(${displayHue}, 100%, 50%)`,
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)",
                    willChange: "transform",
                  }}
                />
              </div>

              <div
                ref={lightnessRef}
                className="relative w-full h-3 rounded-full cursor-pointer"
                style={{
                  background: lightnessBackground,
                }}
                onMouseDown={handleLightnessMouseDown}
              >
                <div
                  className="absolute w-4 h-4 border-2 border-white rounded-full shadow-lg pointer-events-none -top-0.5"
                  style={{
                    left: `calc(${lightnessX}% - 8px)`,
                    backgroundColor: `hsl(${displayHue}, ${saturation}%, ${lightness}%)`,
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)",
                    willChange: "transform",
                  }}
                />
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

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium w-12">Lightness</span>
                {isEditingLightness ? (
                  <Input
                    value={tempLightness}
                    onChange={(e) => handleLightnessInputChange(e.target.value)}
                    onBlur={handleLightnessCancel}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLightnessSave()
                      if (e.key === "Escape") handleLightnessCancel()
                    }}
                    className="flex-1 font-mono text-xs h-8 border-2 border-input"
                    placeholder="0-100"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={handleLightnessClick}
                    className="flex-1 text-left font-mono text-xs h-8 px-3 rounded-md border border-input hover:text-blue-600 hover:border-blue-600 transition-colors cursor-pointer bg-background"
                  >
                    {Math.round(lightness)}%
                  </button>
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
