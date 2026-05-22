"use client"

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react"
import type React from "react"
import {
  computeDragMode,
  computeInsertTargetIndex,
} from "@/lib/index-dnd"
import {
  computeHorizontalIndicatorPosition,
  computeVerticalIndicatorPosition,
} from "@/lib/dnd-indicators"

type AnimationState = {
  draggedIndex: number
  targetIndex: number
} | null

type IndicatorPosition =
  | { left: number; top: number; height?: number; width?: number }
  | null

type SwapHighlight = React.CSSProperties | null

type Geometry = {
  cardWithGap: number
  gapSize: number
  animationDuration: number
  rowLabelWidth: number
}

type UseHeaderDndOptions = {
  foregroundBaseIndexes: number[]
  backgroundBaseIndexes: number[]
  foregroundColumnCount: number
  backgroundRowCount: number
  colorsLength: number
  gridRef: React.RefObject<HTMLDivElement | null>
  fgHeaderRefs: React.RefObject<Map<number, HTMLDivElement>>
  bgLabelRefs: React.RefObject<Map<number, HTMLDivElement>>
  geometry: Geometry
  onSwapColors: (fromIndex: number, toIndex: number) => void
  onReorderColors: (fromIndex: number, toIndex: number) => void
  onColorEdit?: (index: number) => void
  onRemoveColor?: (index: number) => void
}

/**
 * Owns all the foreground-column / background-row drag-and-drop state and
 * handlers for ContrastGrid headers (plus the matching cell-level dragover
 * handlers and the row/column animation helpers).
 *
 * The hook returns a flat bag of handlers + state values that the parent
 * wires straight into the JSX; nothing here is React Compiler memoised
 * because the parent's render-time memoisation already handles it.
 */
export function useHeaderDnd({
  foregroundBaseIndexes,
  backgroundBaseIndexes,
  foregroundColumnCount,
  backgroundRowCount,
  colorsLength,
  gridRef,
  fgHeaderRefs,
  bgLabelRefs,
  geometry,
  onSwapColors,
  onReorderColors,
  onColorEdit,
  onRemoveColor,
}: UseHeaderDndOptions) {
  const { cardWithGap, gapSize, animationDuration, rowLabelWidth } = geometry

  const [draggedFgIndex, setDraggedFgIndex] = useState<number | null>(null)
  const [draggedBgIndex, setDraggedBgIndex] = useState<number | null>(null)
  const [dragOverFgIndex, setDragOverFgIndex] = useState<number | null>(null)
  const [dragOverBgIndex, setDragOverBgIndex] = useState<number | null>(null)
  const [fgDragMode, setFgDragMode] = useState<"swap" | "insert" | null>(null)
  const [bgDragMode, setBgDragMode] = useState<"swap" | "insert" | null>(null)
  const [fgInsertPosition, setFgInsertPosition] = useState<"before" | "after" | null>(null)
  const [bgInsertPosition, setBgInsertPosition] = useState<"before" | "after" | null>(null)
  const [fgAnimationState, setFgAnimationState] = useState<AnimationState>(null)
  const [bgAnimationState, setBgAnimationState] = useState<AnimationState>(null)
  const [fgIndicatorPosition, setFgIndicatorPosition] = useState<IndicatorPosition>(null)
  const [bgIndicatorPosition, setBgIndicatorPosition] = useState<IndicatorPosition>(null)
  const [fgSwapHighlightStyle, setFgSwapHighlightStyle] = useState<SwapHighlight>(null)
  const [bgSwapHighlightStyle, setBgSwapHighlightStyle] = useState<SwapHighlight>(null)

  // Foreground swap highlight overlay
  useEffect(() => {
    if (dragOverFgIndex !== null && fgDragMode === "swap" && gridRef.current) {
      const header = fgHeaderRefs.current?.get(dragOverFgIndex)
      if (header) {
        const headerRect = header.getBoundingClientRect()
        const highlightHeight = (backgroundRowCount + 1) * cardWithGap - gapSize + 44 // +1 for the add button row

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
  }, [dragOverFgIndex, fgDragMode, backgroundRowCount, cardWithGap, gapSize, gridRef, fgHeaderRefs])

  // Background swap highlight overlay
  useEffect(() => {
    if (dragOverBgIndex !== null && bgDragMode === "swap" && gridRef.current) {
      const label = bgLabelRefs.current?.get(dragOverBgIndex)
      if (label) {
        const labelRect = label.getBoundingClientRect()
        const gridRect = gridRef.current.getBoundingClientRect()

        const highlightWidth = rowLabelWidth + foregroundColumnCount * cardWithGap

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
  }, [dragOverBgIndex, bgDragMode, foregroundColumnCount, rowLabelWidth, cardWithGap, gridRef, bgLabelRefs])

  // Foreground insert indicator
  useEffect(() => {
    if (dragOverFgIndex !== null && fgDragMode === "insert" && fgInsertPosition) {
      const header = fgHeaderRefs.current?.get(dragOverFgIndex)
      if (header && gridRef.current) {
        const rect = header.getBoundingClientRect()
        const containerRect = gridRef.current.getBoundingClientRect()

        const indicator = computeVerticalIndicatorPosition({
          containerRect,
          targetRect: rect,
          position: fgInsertPosition,
          gap: gapSize,
          offset: gapSize / 2 + 1,
          span: "container",
        })

        setFgIndicatorPosition(indicator)
      }
    } else {
      setFgIndicatorPosition(null)
    }
  }, [dragOverFgIndex, fgDragMode, fgInsertPosition, gapSize, gridRef, fgHeaderRefs])

  // Background insert indicator
  useEffect(() => {
    if (dragOverBgIndex !== null && bgDragMode === "insert" && bgInsertPosition) {
      const label = bgLabelRefs.current?.get(dragOverBgIndex)
      if (label && gridRef.current) {
        const rect = label.getBoundingClientRect()
        const containerRect = gridRef.current.getBoundingClientRect()

        const indicator = computeHorizontalIndicatorPosition({
          containerRect,
          targetRect: rect,
          position: bgInsertPosition,
          gap: gapSize,
          offset: gapSize / 2,
          span: "container",
        })

        setBgIndicatorPosition({
          left: indicator.left,
          top: indicator.top - 2,
          width: indicator.width,
        })
      }
    } else {
      setBgIndicatorPosition(null)
    }
  }, [dragOverBgIndex, bgDragMode, bgInsertPosition, gapSize, gridRef, bgLabelRefs])

  // Clear FG animation after the duration elapses
  useEffect(() => {
    if (fgAnimationState) {
      const timer = setTimeout(() => {
        setFgAnimationState(null)
      }, animationDuration * 1000)
      return () => clearTimeout(timer)
    }
  }, [fgAnimationState, animationDuration])

  // Clear BG animation after the duration elapses
  useEffect(() => {
    if (bgAnimationState) {
      const timer = setTimeout(() => {
        setBgAnimationState(null)
      }, animationDuration * 1000)
      return () => clearTimeout(timer)
    }
  }, [bgAnimationState, animationDuration])

  const handleFgDragStart = (e: React.DragEvent, index: number) => {
    setDraggedFgIndex(index)
    e.dataTransfer.effectAllowed = "move"
  }

  const applyFgDragIntent = (index: number, pointerRatio: number) => {
    const intent = computeDragMode(pointerRatio)
    setFgDragMode(intent.mode)
    setFgInsertPosition(intent.insertPosition)
    setDragOverFgIndex(index)
  }

  const applyBgDragIntent = (index: number, pointerRatio: number) => {
    const intent = computeDragMode(pointerRatio)
    setBgDragMode(intent.mode)
    setBgInsertPosition(intent.insertPosition)
    setDragOverBgIndex(index)
  }

  const handleFgDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedFgIndex !== null && draggedFgIndex !== index && draggedBgIndex === null) {
      const rect = e.currentTarget.getBoundingClientRect()
      const pointerRatio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5
      applyFgDragIntent(index, pointerRatio)
    }
  }

  const handleFgDragEnd = () => {
    setDraggedFgIndex(null)
    setDragOverFgIndex(null)
    setFgDragMode(null)
    setFgInsertPosition(null)
  }

  const handleFgDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedFgIndex === null || dragOverFgIndex === null) {
      return
    }

    const fromBaseIndex = foregroundBaseIndexes[draggedFgIndex]
    if (typeof fromBaseIndex !== "number") {
      handleFgDragEnd()
      return
    }

    if (fgDragMode === "swap") {
      const targetBaseIndex = foregroundBaseIndexes[dragOverFgIndex]
      if (typeof targetBaseIndex !== "number") {
        handleFgDragEnd()
        return
      }
      onSwapColors(fromBaseIndex, targetBaseIndex)
    } else if (fgDragMode === "insert" && fgInsertPosition) {
      const targetIndex = computeInsertTargetIndex({
        draggedIndex: draggedFgIndex,
        dragOverIndex: dragOverFgIndex,
        insertPosition: fgInsertPosition,
        length: foregroundColumnCount,
      })

      if (targetIndex === null) {
        handleFgDragEnd()
        return
      }

      const insertBeforeBase =
        targetIndex >= foregroundBaseIndexes.length ? colorsLength : foregroundBaseIndexes[targetIndex]
      if (typeof insertBeforeBase !== "number") {
        handleFgDragEnd()
        return
      }
      const isMovingLeft = targetIndex <= draggedFgIndex

      setFgAnimationState({
        draggedIndex: draggedFgIndex,
        targetIndex: isMovingLeft ? targetIndex : targetIndex - 1,
      })
      onReorderColors(fromBaseIndex, insertBeforeBase)
    }
    handleFgDragEnd()
  }

  const handleBgDragStart = (e: React.DragEvent, index: number) => {
    setDraggedBgIndex(index)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleBgDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedBgIndex !== null && draggedBgIndex !== index && draggedFgIndex === null) {
      const rect = e.currentTarget.getBoundingClientRect()
      const pointerRatio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5
      applyBgDragIntent(index, pointerRatio)
    }
  }

  const handleBgGapDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    // Keep the current drag state when over gaps
  }

  const handleBgDragEnd = () => {
    setDraggedBgIndex(null)
    setDragOverBgIndex(null)
    setBgDragMode(null)
    setBgInsertPosition(null)
  }

  const handleBgDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedBgIndex === null || dragOverBgIndex === null) {
      return
    }

    if (bgDragMode === "swap") {
      const fromBaseIndex = backgroundBaseIndexes[draggedBgIndex]
      const targetBaseIndex = backgroundBaseIndexes[dragOverBgIndex]
      if (typeof fromBaseIndex !== "number" || typeof targetBaseIndex !== "number") {
        handleBgDragEnd()
        return
      }
      onSwapColors(fromBaseIndex, targetBaseIndex)
    } else if (bgDragMode === "insert" && bgInsertPosition) {
      const targetIndex = computeInsertTargetIndex({
        draggedIndex: draggedBgIndex,
        dragOverIndex: dragOverBgIndex,
        insertPosition: bgInsertPosition,
        length: backgroundRowCount,
      })

      if (targetIndex === null) {
        handleBgDragEnd()
        return
      }

      const insertBeforeBase =
        targetIndex >= backgroundBaseIndexes.length ? colorsLength : backgroundBaseIndexes[targetIndex]
      const fromBaseIndex = backgroundBaseIndexes[draggedBgIndex]
      if (typeof fromBaseIndex !== "number" || typeof insertBeforeBase !== "number") {
        handleBgDragEnd()
        return
      }
      const isMovingUp = targetIndex <= draggedBgIndex

      setBgAnimationState({
        draggedIndex: draggedBgIndex,
        targetIndex: isMovingUp ? targetIndex : targetIndex - 1,
      })
      onReorderColors(fromBaseIndex, insertBeforeBase)
    }
    handleBgDragEnd()
  }

  const handleDropOnTrash = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    let baseIndex: number | null = null
    if (draggedFgIndex !== null) {
      baseIndex = foregroundBaseIndexes[draggedFgIndex] ?? null
    } else if (draggedBgIndex !== null) {
      baseIndex = backgroundBaseIndexes[draggedBgIndex] ?? null
    }

    if (typeof baseIndex === "number") {
      onColorEdit?.(-1)
      onRemoveColor?.(baseIndex)
    }

    if (draggedFgIndex !== null) {
      handleFgDragEnd()
    } else if (draggedBgIndex !== null) {
      handleBgDragEnd()
    }
  }

  const handleFgHeaderClick = (index: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("[data-drag-handle]")) {
      return
    }
    const baseIndex = foregroundBaseIndexes[index]
    if (typeof baseIndex !== "number") {
      return
    }
    onColorEdit?.(baseIndex)
  }

  const handleBgHeaderClick = (index: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("[data-drag-handle]")) {
      return
    }
    const baseIndex = backgroundBaseIndexes[index]
    if (typeof baseIndex !== "number") {
      return
    }
    onColorEdit?.(baseIndex)
  }

  const handleCellFgDragOver = (e: React.DragEvent, fgIndex: number) => {
    e.preventDefault()
    if (draggedFgIndex !== null && draggedFgIndex !== fgIndex && draggedBgIndex === null) {
      const rect = e.currentTarget.getBoundingClientRect()
      const pointerRatio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0.5
      applyFgDragIntent(fgIndex, pointerRatio)
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
    const pointerRatio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5
    applyBgDragIntent(bgIndex, pointerRatio)
  }

  const handleGridDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const getFgAnimationStyle = (currentIndex: number): React.CSSProperties => {
    if (!fgAnimationState) return {}

    const { draggedIndex, targetIndex } = fgAnimationState

    // The dragged item at its new position should zoom out
    if (currentIndex === targetIndex) {
      return {
        animation: `zoomOut ${animationDuration}s ease-out`,
      }
    }

    // The dragged item at its original position should slide away
    if (currentIndex === draggedIndex) {
      if (draggedIndex < targetIndex) {
        return {
          animation: `slideLeft ${animationDuration}s ease-out`,
        }
      } else {
        return {
          animation: `slideRight ${animationDuration}s ease-out`,
        }
      }
    }

    // Items that were displaced should slide
    if (draggedIndex < targetIndex) {
      if (currentIndex > draggedIndex && currentIndex <= targetIndex) {
        return {
          animation: `slideLeft ${animationDuration}s ease-out`,
        }
      }
    } else {
      if (currentIndex >= targetIndex && currentIndex < draggedIndex) {
        return {
          animation: `slideRight ${animationDuration}s ease-out`,
        }
      }
    }

    return {}
  }

  const getBgAnimationStyle = (currentIndex: number): React.CSSProperties => {
    if (!bgAnimationState) return {}

    const { draggedIndex, targetIndex } = bgAnimationState

    if (currentIndex === targetIndex) {
      return {
        animation: `zoomOut ${animationDuration}s ease-out`,
      }
    }

    if (currentIndex === draggedIndex) {
      if (draggedIndex < targetIndex) {
        return {
          animation: `slideUp ${animationDuration}s ease-out`,
        }
      } else {
        return {
          animation: `slideDown ${animationDuration}s ease-out`,
        }
      }
    }

    if (draggedIndex < targetIndex) {
      if (currentIndex > draggedIndex && currentIndex <= targetIndex) {
        return {
          animation: `slideUp ${animationDuration}s ease-out`,
        }
      }
    } else {
      if (currentIndex >= targetIndex && currentIndex < draggedIndex) {
        return {
          animation: `slideDown ${animationDuration}s ease-out`,
        }
      }
    }

    return {}
  }

  const getCellAnimationStyle = (fgIndex: number, bgIndex: number): React.CSSProperties => {
    const fgStyle = getFgAnimationStyle(fgIndex)
    const bgStyle = getBgAnimationStyle(bgIndex)

    if (Object.keys(fgStyle).length > 0) return fgStyle
    if (Object.keys(bgStyle).length > 0) return bgStyle

    return {}
  }

  const isAnyHeaderDragging = draggedFgIndex !== null || draggedBgIndex !== null

  return {
    // State
    draggedFgIndex,
    draggedBgIndex,
    dragOverFgIndex,
    dragOverBgIndex,
    fgDragMode,
    bgDragMode,
    fgInsertPosition,
    bgInsertPosition,
    fgAnimationState,
    bgAnimationState,
    fgIndicatorPosition,
    bgIndicatorPosition,
    fgSwapHighlightStyle,
    bgSwapHighlightStyle,
    isAnyHeaderDragging,
    // Handlers
    handleFgDragStart,
    handleFgDragOver,
    handleFgDrop,
    handleFgDragEnd,
    handleBgDragStart,
    handleBgDragOver,
    handleBgGapDragOver,
    handleBgDrop,
    handleBgDragEnd,
    handleDropOnTrash,
    handleFgHeaderClick,
    handleBgHeaderClick,
    handleCellFgDragOver,
    handleCellBgDragOver,
    handleGridDragOver,
    // Animation helpers
    getFgAnimationStyle,
    getBgAnimationStyle,
    getCellAnimationStyle,
  }
}
