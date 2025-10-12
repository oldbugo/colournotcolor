"use client"

import React from "react"
import { useState, useRef, useEffect } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

import { calculateContrast, getWCAGLevel, extractHexFromColor, extractCustomName } from "@/lib/contrast-utils"

const CARD_SIZE = 132 // px
const GAP_SIZE = 16 // px (gap-4)
const ANIMATION_DURATION = 0.25 // seconds - faster animation
const CARD_WITH_GAP = CARD_SIZE + GAP_SIZE // 148px
const BORDER_GAP = 8 // px - gap for borders (-inset-2 = 8px)

type ContrastGridProps = {
  foregroundColors: string[]
  backgroundColors: string[]
  onReorderForeground: (fromIndex: number, toIndex: number) => void
  onReorderBackground: (fromIndex: number, toIndex: number) => void
  onSwapForeground: (fromIndex: number, toIndex: number) => void
  onSwapBackground: (fromIndex: number, toIndex: number) => void
  onClearColorPicker?: () => void
  onColorEdit?: (type: "foreground" | "background", index: number) => void
  editingColor?: { type: "foreground" | "background"; index: number; color: string } | null
  onAddForeground?: () => void
  onAddBackground?: () => void
  onRemoveForeground?: (index: number) => void
  onRemoveBackground?: (index: number) => void
}

export function ContrastGrid({
  foregroundColors,
  backgroundColors,
  onReorderForeground,
  onReorderBackground,
  onSwapForeground,
  onSwapBackground,
  onClearColorPicker,
  onColorEdit,
  editingColor,
  onAddForeground,
  onAddBackground,
  onRemoveForeground,
  onRemoveBackground,
}: ContrastGridProps) {
  const [hoveredFgIndex, setHoveredFgIndex] = useState<number | null>(null)
  const [hoveredBgIndex, setHoveredBgIndex] = useState<number | null>(null)
  const [draggedFgIndex, setDraggedFgIndex] = useState<number | null>(null)
  const [draggedBgIndex, setDraggedBgIndex] = useState<number | null>(null)
  const [dragOverFgIndex, setDragOverFgIndex] = useState<number | null>(null)
  const [dragOverBgIndex, setDragOverBgIndex] = useState<number | null>(null)
  const [fgDragMode, setFgDragMode] = useState<"swap" | "insert" | null>(null)
  const [bgDragMode, setBgDragMode] = useState<"swap" | "insert" | null>(null)
  const [fgInsertPosition, setFgInsertPosition] = useState<"before" | "after" | null>(null)
  const [bgInsertPosition, setBgInsertPosition] = useState<"before" | "after" | null>(null)

  const [isDragOverTrash, setIsDragOverTrash] = useState(false)
  const trashLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [fgAnimationState, setFgAnimationState] = useState<{
    draggedIndex: number
    targetIndex: number
  } | null>(null)
  const [bgAnimationState, setBgAnimationState] = useState<{
    draggedIndex: number
    targetIndex: number
  } | null>(null)

  const gridRef = useRef<HTMLDivElement>(null)
  const fgHeaderRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const bgLabelRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const [fgIndicatorPosition, setFgIndicatorPosition] = useState<{ left: number; top: number; height?: number } | null>(
    null,
  )
  const [bgIndicatorPosition, setBgIndicatorPosition] = useState<{ left: number; top: number; width?: number } | null>(
    null,
  )

  const [fgOverlayStyle, setFgOverlayStyle] = useState<React.CSSProperties | null>(null)
  const [bgOverlayStyle, setBgOverlayStyle] = useState<React.CSSProperties | null>(null)

  const [fgSwapHighlightStyle, setFgSwapHighlightStyle] = useState<React.CSSProperties | null>(null)
  const [bgSwapHighlightStyle, setBgSwapHighlightStyle] = useState<React.CSSProperties | null>(null)

  useEffect(() => {
    return () => {
      if (trashLeaveTimeoutRef.current) {
        clearTimeout(trashLeaveTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (hoveredFgIndex !== null && gridRef.current) {
      const header = fgHeaderRefs.current.get(hoveredFgIndex)
      if (header) {
        const headerRect = header.getBoundingClientRect()
        const gridRect = gridRef.current.getBoundingClientRect()

        const overlayHeight = (backgroundColors.length + 1) * CARD_WITH_GAP - GAP_SIZE + 44 // +1 for the add button row

        setFgOverlayStyle({
          left: headerRect.left - 8, // -inset-2 = 8px
          top: headerRect.top - 8,
          width: headerRect.width + 16, // 8px on each side
          height: overlayHeight,
          backgroundColor: "rgba(128, 128, 128, 0.15)",
          borderRadius: "0.5rem", // rounded-lg
        })
      }
    } else {
      setFgOverlayStyle(null)
    }
  }, [hoveredFgIndex, backgroundColors.length])

  useEffect(() => {
    if (hoveredBgIndex !== null && gridRef.current) {
      const label = bgLabelRefs.current.get(hoveredBgIndex)
      if (label) {
        const labelRect = label.getBoundingClientRect()
        const gridRect = gridRef.current.getBoundingClientRect()

        const overlayWidth = 164 + foregroundColors.length * CARD_WITH_GAP + 16 // 164px label + colors + 16px border padding

        setBgOverlayStyle({
          left: gridRect.left - 8, // -inset-2 = 8px
          top: labelRect.top - 8,
          width: overlayWidth,
          height: labelRect.height + 16,
          backgroundColor: "rgba(128, 128, 128, 0.15)",
          borderRadius: "0.5rem", // rounded-lg
        })
      }
    } else {
      setBgOverlayStyle(null)
    }
  }, [hoveredBgIndex, foregroundColors.length])

  useEffect(() => {
    if (dragOverFgIndex !== null && fgDragMode === "swap" && gridRef.current) {
      const header = fgHeaderRefs.current.get(dragOverFgIndex)
      if (header) {
        const headerRect = header.getBoundingClientRect()
        const gridRect = gridRef.current.getBoundingClientRect()

        const highlightHeight = (backgroundColors.length + 1) * CARD_WITH_GAP - GAP_SIZE + 44 // +1 for the add button row

        setFgSwapHighlightStyle({
          left: headerRect.left - 8,
          top: headerRect.top - 8,
          width: headerRect.width + 16,
          height: highlightHeight,
        })
      }
    } else {
      setFgSwapHighlightStyle(null)
    }
  }, [dragOverFgIndex, fgDragMode, backgroundColors.length])

  useEffect(() => {
    if (dragOverBgIndex !== null && bgDragMode === "swap" && gridRef.current) {
      const label = bgLabelRefs.current.get(dragOverBgIndex)
      if (label) {
        const labelRect = label.getBoundingClientRect()
        const gridRect = gridRef.current.getBoundingClientRect()

        const highlightWidth = 164 + foregroundColors.length * CARD_WITH_GAP

        setBgSwapHighlightStyle({
          left: gridRect.left - 8,
          top: labelRect.top - 8,
          width: highlightWidth,
          height: labelRect.height + 16,
        })
      }
    } else {
      setBgSwapHighlightStyle(null)
    }
  }, [dragOverBgIndex, bgDragMode, foregroundColors.length])

  useEffect(() => {
    if (dragOverFgIndex !== null && fgDragMode === "insert" && fgInsertPosition) {
      const header = fgHeaderRefs.current.get(dragOverFgIndex)
      if (header && gridRef.current) {
        const rect = header.getBoundingClientRect()
        const containerRect = gridRef.current.getBoundingClientRect()

        const indicatorHeight = (backgroundColors.length + 1) * CARD_WITH_GAP - GAP_SIZE + 26 // +1 for the add button row

        if (fgInsertPosition === "before") {
          setFgIndicatorPosition({
            left: rect.left - containerRect.left - GAP_SIZE / 2 - 1, // -1px offset
            top: 0,
            height: indicatorHeight,
          })
        } else {
          setFgIndicatorPosition({
            left: rect.right - containerRect.left + GAP_SIZE / 2 - 1, // -1px offset
            top: 0,
            height: indicatorHeight,
          })
        }
      }
    } else {
      setFgIndicatorPosition(null)
    }
  }, [dragOverFgIndex, fgDragMode, fgInsertPosition, backgroundColors.length])

  useEffect(() => {
    if (dragOverBgIndex !== null && bgDragMode === "insert" && bgInsertPosition) {
      const label = bgLabelRefs.current.get(dragOverBgIndex)
      if (label && gridRef.current) {
        const rect = label.getBoundingClientRect()
        const containerRect = gridRef.current.getBoundingClientRect()

        const indicatorWidth = 164 + foregroundColors.length * CARD_WITH_GAP

        if (bgInsertPosition === "before") {
          setBgIndicatorPosition({
            left: 0,
            top: rect.top - containerRect.top - GAP_SIZE / 2 - 2, // -2px offset (1px higher)
            width: indicatorWidth,
          })
        } else {
          setBgIndicatorPosition({
            left: 0,
            top: rect.bottom - containerRect.top + GAP_SIZE / 2 - 2, // -2px offset (1px higher)
            width: indicatorWidth,
          })
        }
      }
    } else {
      setBgIndicatorPosition(null)
    }
  }, [dragOverBgIndex, bgDragMode, bgInsertPosition, foregroundColors.length])

  useEffect(() => {
    if (fgAnimationState) {
      const timer = setTimeout(() => {
        setFgAnimationState(null)
      }, ANIMATION_DURATION * 1000)
      return () => clearTimeout(timer)
    }
  }, [fgAnimationState])

  useEffect(() => {
    if (bgAnimationState) {
      const timer = setTimeout(() => {
        setBgAnimationState(null)
      }, ANIMATION_DURATION * 1000)
      return () => clearTimeout(timer)
    }
  }, [bgAnimationState])

  const handleFgDragStart = (e: React.DragEvent, index: number) => {
    setDraggedFgIndex(index)
    e.dataTransfer.effectAllowed = "move"
    onClearColorPicker?.()
  }

  const handleFgDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedFgIndex !== null && draggedFgIndex !== index && draggedBgIndex === null) {
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const width = rect.width

      const leftThreshold = width * 0.2
      const rightThreshold = width * 0.8

      if (mouseX < leftThreshold) {
        setFgDragMode("insert")
        setFgInsertPosition("before")
        setDragOverFgIndex(index)
      } else if (mouseX > rightThreshold) {
        setFgDragMode("insert")
        setFgInsertPosition("after")
        setDragOverFgIndex(index)
      } else {
        setFgDragMode("swap")
        setFgInsertPosition(null)
        setDragOverFgIndex(index)
      }
    }
  }

  const handleFgGapDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    // Keep the current drag state when over gaps
  }

  const handleFgDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedFgIndex === null || dragOverFgIndex === null) {
      return
    }

    console.log("[v0] FG Drop:", { draggedFgIndex, dragOverFgIndex, fgDragMode })

    if (fgDragMode === "swap") {
      onSwapForeground(draggedFgIndex, dragOverFgIndex)
    } else if (fgDragMode === "insert") {
      let targetIndex = dragOverFgIndex
      if (fgInsertPosition === "after") {
        targetIndex++
      }
      if (draggedFgIndex < targetIndex) {
        targetIndex--
      }
      setFgAnimationState({
        draggedIndex: draggedFgIndex,
        targetIndex: targetIndex,
      })
      onReorderForeground(draggedFgIndex, targetIndex)
    }
    handleFgDragEnd()
  }

  const handleFgDragEnd = () => {
    setDraggedFgIndex(null)
    setDragOverFgIndex(null)
    setFgDragMode(null)
    setFgInsertPosition(null)
    setIsDragOverTrash(false)
    if (trashLeaveTimeoutRef.current) {
      clearTimeout(trashLeaveTimeoutRef.current)
      trashLeaveTimeoutRef.current = null
    }
  }

  const handleBgDragStart = (e: React.DragEvent, index: number) => {
    setDraggedBgIndex(index)
    e.dataTransfer.effectAllowed = "move"
    onClearColorPicker?.()
  }

  const handleBgDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedBgIndex !== null && draggedBgIndex !== index && draggedFgIndex === null) {
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseY = e.clientY - rect.top
      const height = rect.height

      const topThreshold = height * 0.2
      const bottomThreshold = height * 0.8

      if (mouseY < topThreshold) {
        setBgDragMode("insert")
        setBgInsertPosition("before")
        setDragOverBgIndex(index)
      } else if (mouseY > bottomThreshold) {
        setBgDragMode("insert")
        setBgInsertPosition("after")
        setDragOverBgIndex(index)
      } else {
        setBgDragMode("swap")
        setBgInsertPosition(null)
        setDragOverBgIndex(index)
      }
    }
  }

  const handleBgGapDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    // Keep the current drag state when over gaps
  }

  const handleBgDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedBgIndex === null || dragOverBgIndex === null) {
      return
    }

    console.log("[v0] BG Drop:", { draggedBgIndex, dragOverBgIndex, bgDragMode })

    if (bgDragMode === "swap") {
      onSwapBackground(draggedBgIndex, dragOverBgIndex)
    } else if (bgDragMode === "insert") {
      let targetIndex = dragOverBgIndex
      if (bgInsertPosition === "after") {
        targetIndex++
      }
      if (draggedBgIndex < targetIndex) {
        targetIndex--
      }
      setBgAnimationState({
        draggedIndex: draggedBgIndex,
        targetIndex: targetIndex,
      })
      onReorderBackground(draggedBgIndex, targetIndex)
    }
    handleBgDragEnd()
  }

  const handleBgDragEnd = () => {
    setDraggedBgIndex(null)
    setDragOverBgIndex(null)
    setBgDragMode(null)
    setBgInsertPosition(null)
    setIsDragOverTrash(false)
    if (trashLeaveTimeoutRef.current) {
      clearTimeout(trashLeaveTimeoutRef.current)
      trashLeaveTimeoutRef.current = null
    }
  }

  const handleDropOnTrash = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (draggedFgIndex !== null) {
      onColorEdit?.("foreground", -1)
      onRemoveForeground?.(draggedFgIndex)
    } else if (draggedBgIndex !== null) {
      onColorEdit?.("background", -1)
      onRemoveBackground?.(draggedBgIndex)
    }

    setIsDragOverTrash(false)
    setDraggedFgIndex(null)
    setDraggedBgIndex(null)
  }

  const handleFgHeaderClick = (index: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("[data-drag-handle]")) {
      return
    }
    onColorEdit?.("foreground", index)
  }

  const handleBgHeaderClick = (index: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("[data-drag-handle]")) {
      return
    }
    onColorEdit?.("background", index)
  }

  const getFgAnimationStyle = (currentIndex: number) => {
    if (!fgAnimationState) return {}

    const { draggedIndex, targetIndex } = fgAnimationState

    // The dragged item at its new position should zoom out
    if (currentIndex === targetIndex) {
      return {
        animation: `zoomOut ${ANIMATION_DURATION}s ease-out`,
      }
    }

    // The dragged item at its original position should slide away
    if (currentIndex === draggedIndex) {
      if (draggedIndex < targetIndex) {
        return {
          animation: `slideLeft ${ANIMATION_DURATION}s ease-out`,
        }
      } else {
        return {
          animation: `slideRight ${ANIMATION_DURATION}s ease-out`,
        }
      }
    }

    // Items that were displaced should slide
    if (draggedIndex < targetIndex) {
      // Dragged from left to right, items between should slide left
      if (currentIndex > draggedIndex && currentIndex <= targetIndex) {
        return {
          animation: `slideLeft ${ANIMATION_DURATION}s ease-out`,
        }
      }
    } else {
      // Dragged from right to left, items between should slide right
      if (currentIndex >= targetIndex && currentIndex < draggedIndex) {
        return {
          animation: `slideRight ${ANIMATION_DURATION}s ease-out`,
        }
      }
    }

    return {}
  }

  const getBgAnimationStyle = (currentIndex: number) => {
    if (!bgAnimationState) return {}

    const { draggedIndex, targetIndex } = bgAnimationState

    // The dragged item at its new position should zoom out
    if (currentIndex === targetIndex) {
      return {
        animation: `zoomOut ${ANIMATION_DURATION}s ease-out`,
      }
    }

    // The dragged item at its original position should slide away
    if (currentIndex === draggedIndex) {
      if (draggedIndex < targetIndex) {
        return {
          animation: `slideUp ${ANIMATION_DURATION}s ease-out`,
        }
      } else {
        return {
          animation: `slideDown ${ANIMATION_DURATION}s ease-out`,
        }
      }
    }

    // Items that were displaced should slide
    if (draggedIndex < targetIndex) {
      // Dragged from top to bottom, items between should slide up
      if (currentIndex > draggedIndex && currentIndex <= targetIndex) {
        return {
          animation: `slideUp ${ANIMATION_DURATION}s ease-out`,
        }
      }
    } else {
      // Dragged from bottom to top, items between should slide down
      if (currentIndex >= targetIndex && currentIndex < draggedIndex) {
        return {
          animation: `slideDown ${ANIMATION_DURATION}s ease-out`,
        }
      }
    }

    return {}
  }

  const getCellAnimationStyle = (fgIndex: number, bgIndex: number) => {
    const fgStyle = getFgAnimationStyle(fgIndex)
    const bgStyle = getBgAnimationStyle(bgIndex)

    // If either the column or row is animating, apply that animation to the cell
    if (Object.keys(fgStyle).length > 0) return fgStyle
    if (Object.keys(bgStyle).length > 0) return bgStyle

    return {}
  }

  const handleCellFgDragOver = (e: React.DragEvent, fgIndex: number) => {
    e.preventDefault()
    if (draggedFgIndex !== null && draggedFgIndex !== fgIndex && draggedBgIndex === null) {
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const width = rect.width

      const leftThreshold = width * 0.2
      const rightThreshold = width * 0.8

      if (mouseX < leftThreshold) {
        setFgDragMode("insert")
        setFgInsertPosition("before")
        setDragOverFgIndex(fgIndex)
      } else if (mouseX > rightThreshold) {
        setFgDragMode("insert")
        setFgInsertPosition("after")
        setDragOverFgIndex(fgIndex)
      } else {
        setFgDragMode("swap")
        setFgInsertPosition(null)
        setDragOverFgIndex(fgIndex)
      }
    }
  }

  const handleCellBgDragOver = (e: React.DragEvent, bgIndex: number) => {
    e.preventDefault()
    e.stopPropagation() // Stop propagation to prevent conflicts

    if (draggedBgIndex === null || draggedBgIndex === bgIndex || draggedFgIndex !== null || !gridRef.current) {
      return
    }

    // This ensures consistent threshold logic across headers, cells, and gaps
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseY = e.clientY - rect.top
    const height = rect.height

    const topThreshold = height * 0.2
    const bottomThreshold = height * 0.8

    if (mouseY < topThreshold) {
      setBgDragMode("insert")
      setBgInsertPosition("before")
      setDragOverBgIndex(bgIndex)
    } else if (mouseY > bottomThreshold) {
      setBgDragMode("insert")
      setBgInsertPosition("after")
      setDragOverBgIndex(bgIndex)
    } else {
      setBgDragMode("swap")
      setBgInsertPosition(null)
      setDragOverBgIndex(bgIndex)
    }
  }

  const handleGridDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const isAnyHeaderDragging = draggedFgIndex !== null || draggedBgIndex !== null

  return (
    <div className="border-2 border-border p-6 bg-background overflow-visible rounded-md px-6 py-6 mx-2">
      <style jsx>{`
        @keyframes zoomOut {
          from {
            transform: scale(1.15);
            opacity: 0.8;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes slideLeft {
          from {
            transform: translateX(${CARD_WITH_GAP}px);
          }
          to {
            transform: translateX(0);
          }
        }
        @keyframes slideRight {
          from {
            transform: translateX(-${CARD_WITH_GAP}px);
          }
          to {
            transform: translateX(0);
          }
        }
        @keyframes slideUp {
          from {
            transform: translateY(${CARD_WITH_GAP}px);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes slideDown {
          from {
            transform: translateY(-${CARD_WITH_GAP}px);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="pb-2 mb-6 border-b-2">
        <h2 className="text-xl font-semibold">Contrast Matrix</h2>
      </div>

      {fgOverlayStyle && <div className="pointer-events-none fixed z-10 rounded-lg" style={fgOverlayStyle} />}

      {bgOverlayStyle && <div className="pointer-events-none fixed z-10 rounded-lg" style={bgOverlayStyle} />}

      {fgSwapHighlightStyle && (
        <div
          className="pointer-events-none fixed z-40 rounded-lg bg-blue-500/10 border-2 border-blue-500 border-dashed"
          style={fgSwapHighlightStyle}
        />
      )}

      {bgSwapHighlightStyle && (
        <div
          className="pointer-events-none fixed z-40 rounded-lg bg-blue-500/10 border-2 border-blue-500 border-dashed"
          style={bgSwapHighlightStyle}
        />
      )}

      <div className="overflow-x-auto overflow-visible px-4 py-4">
        <div className="relative inline-block overflow-visible">
          <div
            ref={gridRef}
            className="inline-grid relative gap-4 overflow-visible"
            style={{ gridTemplateColumns: `164px repeat(${foregroundColors.length}, ${CARD_SIZE}px) ${CARD_SIZE}px` }}
            onDragOver={handleGridDragOver}
            onDrop={(e) => {
              handleFgDrop(e)
              handleBgDrop(e)
            }}
          >
            {fgIndicatorPosition && fgDragMode === "insert" && (
              <div
                className="absolute w-1 bg-blue-500 rounded-full pointer-events-none z-30"
                style={{
                  left: `${fgIndicatorPosition.left}px`,
                  top: `${fgIndicatorPosition.top}px`,
                  height: fgIndicatorPosition.height ? `${fgIndicatorPosition.height}px` : "100%",
                }}
              />
            )}

            {bgIndicatorPosition && bgDragMode === "insert" && (
              <div
                className="absolute h-1 bg-blue-500 rounded-full pointer-events-none z-30"
                style={{
                  left: `${bgIndicatorPosition.left}px`,
                  top: `${bgIndicatorPosition.top}px`,
                  width: bgIndicatorPosition.width ? `${bgIndicatorPosition.width}px` : "100%",
                }}
              />
            )}

            <div onDragOver={handleBgGapDragOver} onDrop={handleBgDrop} />

            {foregroundColors.map((color, i) => {
              const isDragging = draggedFgIndex === i
              const isEditing = editingColor?.type === "foreground" && editingColor.index === i
              const customName = extractCustomName(color)
              const hexColor = extractHexFromColor(color)
              const displayText = customName || hexColor

              return (
                <div
                  key={i}
                  ref={(el) => {
                    if (el) {
                      fgHeaderRefs.current.set(i, el)
                    } else {
                      fgHeaderRefs.current.delete(i)
                    }
                  }}
                  className="relative flex items-center flex-col transition-all duration-200 overflow-visible"
                  style={{
                    opacity: isDragging ? 0.5 : 1,
                    transform: isDragging ? "scale(0.95)" : "scale(1)",
                    ...getFgAnimationStyle(i),
                  }}
                  onDragOver={(e) => handleFgDragOver(e, i)}
                  onDrop={handleFgDrop}
                  data-color-card
                >
                  {isEditing && (
                    <div
                      className="absolute border-2 border-dashed border-gray-400 rounded-lg pointer-events-none z-20"
                      style={{ inset: `-${BORDER_GAP}px` }}
                    />
                  )}

                  <div
                    draggable
                    onDragStart={(e) => handleFgDragStart(e, i)}
                    onDragEnd={handleFgDragEnd}
                    onMouseEnter={() => setHoveredFgIndex(i)}
                    onMouseLeave={() => setHoveredFgIndex(null)}
                    className="mb-1 flex cursor-grab active:cursor-grabbing flex-col gap-1 rounded p-2 hover:bg-foreground/5"
                    data-drag-handle
                  >
                    <div className="h-0.5 w-8 rounded-full bg-foreground/40" />
                    <div className="h-0.5 w-8 rounded-full bg-foreground/40" />
                  </div>

                  <div
                    className="flex flex-col items-center justify-end border-2 transition-all cursor-pointer hover:opacity-90 border-border rounded-sm pb-0"
                    style={{
                      height: `${CARD_SIZE}px`,
                      width: `${CARD_SIZE}px`,
                      backgroundColor: hexColor,
                    }}
                    onClick={(e) => handleFgHeaderClick(i, e)}
                  >
                    <div className="w-full py-2 px-2">
                      <div className="rounded bg-white font-mono text-black truncate text-center px-2 my-0 text-sm rounded-sm border py-1 font-light leading-7">
                        {displayText}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="relative flex items-center flex-col">
              <div className="mb-1 flex cursor-grab active:cursor-grabbing flex-col gap-1 rounded p-2 opacity-0 pointer-events-none">
                <div className="h-0.5 w-8 rounded-full bg-foreground/40" />
                <div className="h-0.5 w-8 rounded-full bg-foreground/40" />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="bg-transparent cursor-pointer border-2 border-border hover:bg-foreground/5 rounded-sm"
                style={{
                  height: `${CARD_SIZE}px`,
                  width: `${CARD_SIZE}px`,
                }}
                onClick={onAddForeground}
              >
                <Plus className="h-8 w-8" />
              </Button>
            </div>

            {backgroundColors.map((bgColor, bgIndex) => {
              const isBgDragging = draggedBgIndex === bgIndex
              const isEditing = editingColor?.type === "background" && editingColor.index === bgIndex
              const bgCustomName = extractCustomName(bgColor)
              const bgHexColor = extractHexFromColor(bgColor)
              const bgDisplayText = bgCustomName || bgHexColor

              return (
                <React.Fragment key={bgIndex}>
                  {/* Background label */}
                  <div
                    ref={(el) => {
                      if (el) {
                        bgLabelRefs.current.set(bgIndex, el)
                      } else {
                        bgLabelRefs.current.delete(bgIndex)
                      }
                    }}
                    className="relative flex items-center transition-all duration-200 pr-0 mr-0 gap-2 overflow-visible"
                    style={{
                      opacity: isBgDragging ? 0.5 : 1,
                      transform: isBgDragging ? "scale(0.95)" : "scale(1)",
                      ...getBgAnimationStyle(bgIndex),
                    }}
                    onDragOver={(e) => handleBgDragOver(e, bgIndex)}
                    onDrop={handleBgDrop}
                    data-color-card
                  >
                    {isEditing && (
                      <div
                        className="absolute border-2 border-dashed border-gray-400 rounded-lg pointer-events-none z-20"
                        style={{ inset: `-${BORDER_GAP}px` }}
                      />
                    )}

                    <div
                      draggable
                      onDragStart={(e) => handleBgDragStart(e, bgIndex)}
                      onDragEnd={handleBgDragEnd}
                      onMouseEnter={() => setHoveredBgIndex(bgIndex)}
                      onMouseLeave={() => setHoveredBgIndex(null)}
                      className="flex cursor-grab active:cursor-grabbing gap-1 rounded p-2 hover:bg-foreground/5"
                      data-drag-handle
                    >
                      <div className="h-8 w-0.5 rounded-full bg-foreground/40" />
                      <div className="h-8 w-0.5 rounded-full bg-foreground/40" />
                    </div>

                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="flex flex-col items-center justify-end border-2 border-border transition-all cursor-pointer hover:opacity-90 rounded-sm pb-0"
                        style={{
                          height: `${CARD_SIZE}px`,
                          width: `${CARD_SIZE}px`,
                          backgroundColor: bgHexColor,
                        }}
                        onClick={(e) => handleBgHeaderClick(bgIndex, e)}
                      >
                        <div className="w-full px-2 py-2">
                          <div className="rounded bg-white font-mono text-black px-2 truncate text-center border rounded-sm py-1 text-sm font-light">
                            {bgDisplayText}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contrast cells for this background row */}
                  {foregroundColors.map((fgColor, fgIndex) => {
                    const isFgDragging = draggedFgIndex === fgIndex
                    const fgHexColor = extractHexFromColor(fgColor)
                    const ratio = calculateContrast(fgHexColor, bgHexColor) // Use bgHexColor instead of bgColor for consistency
                    const level = getWCAGLevel(ratio)

                    return (
                      <div
                        key={`${bgIndex}-${fgIndex}`}
                        className="relative flex flex-col items-center justify-center border-2 border-border transition-all duration-200 rounded-sm"
                        style={{
                          height: `${CARD_SIZE}px`,
                          width: `${CARD_SIZE}px`,
                          backgroundColor: bgHexColor, // Use bgHexColor instead of bgColor to fix custom name display bug
                          opacity: isFgDragging || isBgDragging ? 0.5 : 1,
                          ...getCellAnimationStyle(fgIndex, bgIndex),
                        }}
                        onDragOver={(e) => {
                          if (draggedFgIndex !== null) {
                            handleCellFgDragOver(e, fgIndex)
                          } else if (draggedBgIndex !== null) {
                            handleCellBgDragOver(e, bgIndex)
                          }
                        }}
                        onDrop={(e) => {
                          if (draggedFgIndex !== null) {
                            handleFgDrop(e)
                          } else if (draggedBgIndex !== null) {
                            handleBgDrop(e)
                          }
                        }}
                      >
                        <div className="relative z-10 text-2xl font-bold" style={{ color: fgHexColor }}>
                          {ratio.toFixed(2)}
                        </div>
                        <div className="relative z-10 mt-2 flex gap-1">
                          {level.aa && (
                            <span className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white">AA</span>
                          )}
                          {level.aaa && (
                            <span className="rounded bg-green-700 px-2 py-0.5 text-xs font-medium text-white">AAA</span>
                          )}
                          {!level.aa && (
                            <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white">FAIL</span>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  <div
                    style={{
                      height: `${CARD_SIZE}px`,
                      width: `${CARD_SIZE}px`,
                    }}
                  />
                </React.Fragment>
              )
            })}

            <div className="relative flex items-center pr-0 mr-0 gap-2">
              <div className="flex gap-1 p-2 opacity-0 pointer-events-none">
                <div className="h-8 w-0.5 rounded-full bg-foreground/40" />
                <div className="h-8 w-0.5 rounded-full bg-foreground/40" />
              </div>
              <Button
                variant="outline"
                size="icon"
                className="rounded-lg bg-transparent cursor-pointer border-2 border-border hover:bg-foreground/5"
                style={{
                  height: `${CARD_SIZE}px`,
                  width: `${CARD_SIZE}px`,
                }}
                onClick={onAddBackground}
              >
                <Plus className="h-8 w-8" />
              </Button>
            </div>

            {foregroundColors.map((_, fgIndex) => (
              <div
                key={`placeholder-${fgIndex}`}
                style={{
                  height: `${CARD_SIZE}px`,
                  width: `${CARD_SIZE}px`,
                }}
              />
            ))}

            <div
              style={{
                height: `${CARD_SIZE}px`,
                width: `${CARD_SIZE}px`,
              }}
            />
          </div>
        </div>
      </div>

      {isAnyHeaderDragging && (
        <div
          className="fixed bottom-8 right-8 z-50"
          onDragOver={(e) => {
            e.preventDefault()
            if (trashLeaveTimeoutRef.current) {
              clearTimeout(trashLeaveTimeoutRef.current)
              trashLeaveTimeoutRef.current = null
            }
            setIsDragOverTrash(true)
          }}
          onDragLeave={() => {
            if (trashLeaveTimeoutRef.current) {
              clearTimeout(trashLeaveTimeoutRef.current)
            }
            trashLeaveTimeoutRef.current = setTimeout(() => {
              setIsDragOverTrash(false)
              trashLeaveTimeoutRef.current = null
            }, 200)
          }}
          onDrop={handleDropOnTrash}
        >
          <div
            className={`flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed transition-all duration-200 ${
              isDragOverTrash ? "bg-red-100 border-red-500 scale-110 shadow-lg" : "bg-gray-100 border-gray-400"
            }`}
          >
            <Trash2
              className={`transition-all duration-200 ${isDragOverTrash ? "h-10 w-10 text-red-600" : "h-8 w-8 text-gray-600"}`}
            />
            <span
              className={`text-sm font-medium transition-colors duration-200 ${isDragOverTrash ? "text-red-600" : "text-gray-600"}`}
            >
              {isDragOverTrash ? "Drop to Delete" : "Delete"}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
