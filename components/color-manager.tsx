"use client"

import type React from "react"
import { useMemo, useState, useRef, useEffect, useLayoutEffect, useId, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Plus, FolderPlus, Trash2, ChevronDown } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  CARD_CONTROL_RADII,
  CARD_MIN_COLUMN_WIDTH,
  CARD_SIZE_TOKENS,
} from "@/lib/design-tokens"
import type { ColorSwatch } from "@/types/palette"
import { ColorCard } from "@/components/color-manager/color-card"
import { GroupHeader } from "@/components/color-manager/group-header"
import { GroupSection } from "@/components/color-manager/group-section"
import type { ColorWithName, DragIndicatorPosition } from "@/components/color-manager/types"
import {
  composeLabel,
  createSwatch,
  normalizeHex,
  parseLegacyColor,
  splitLabel,
  swatchFromLegacy,
  swatchToLegacy,
  updateSwatch,
} from "@/lib/color-utils"
import { cn } from "@/lib/utils"

type ColorManagerProps = {
  label: string
  colors: ColorSwatch[]
  onAddColor: (swatch: ColorSwatch) => void
  onRemoveColor: (index: number) => void
  onUpdateColor: (index: number, swatch: ColorSwatch) => void
  onBatchUpdateColors: (swatches: ColorSwatch[]) => void
  onColorEdit?: (index: number) => void
  activeEditingIndex?: number | null
  lastInteractedColor?: string
}

function groupColorsByCategory(colors: string[]): Map<string, ColorWithName[]> {
  const groups = new Map<string, ColorWithName[]>()
  const groupCasing = new Map<string, string>()

  colors.forEach((color, originalIndex) => {
    const parts = color.split("#")
    const customName = parts.length > 1 ? parts[0] : ""
    const hex = "#" + (parts.length > 1 ? parts[1] : parts[0].replace("#", ""))

    let category = "Ungrouped"
    let categoryKey = "ungrouped"

    if (customName && customName.includes("/")) {
      const categoryPart = customName.split("/")[0]
      category = categoryPart
      categoryKey = categoryPart.toLowerCase()

      if (!groupCasing.has(categoryKey)) {
        groupCasing.set(categoryKey, category)
      } else {
        category = groupCasing.get(categoryKey)!
      }
    }

    if (!groups.has(category)) {
      groups.set(category, [])
    }
    groups.get(category)!.push({ name: customName || hex, hex, originalIndex })
  })

  return groups
}

function updateColorGroup(color: string, newGroup: string): string {
  const parts = color.split("#")
  const customName = parts.length > 1 ? parts[0] : ""
  const hex = "#" + (parts.length > 1 ? parts[1] : parts[0].replace("#", ""))

  let baseName = customName
  if (customName.includes("/")) {
    baseName = customName.split("/").slice(1).join("/")
  }

  if (newGroup === "ungrouped") {
    return hex
  }

  return baseName ? `${newGroup}/${baseName}${hex}` : `${newGroup}/${hex.replace("#", "")}${hex}`
}

export function ColorManager({
  label,
  colors: swatches,
  onAddColor,
  onRemoveColor,
  onUpdateColor,
  onBatchUpdateColors,
  onColorEdit,
  activeEditingIndex,
  lastInteractedColor = "#808080",
}: ColorManagerProps) {
  const colors = useMemo(() => swatches.map((swatch) => swatchToLegacy(swatch)), [swatches])
  const getSwatchAt = (index: number): ColorSwatch | undefined => swatches[index]
  const toSwatch = (value: string, index?: number) =>
    swatchFromLegacy(value, typeof index === "number" ? getSwatchAt(index)?.id : undefined)
  const toSwatchArray = (values: string[]) => values.map((value, index) => toSwatch(value, index))

  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingName, setEditingName] = useState("")
  const [originalEditingName, setOriginalEditingName] = useState("")
  const [editingHexIndex, setEditingHexIndex] = useState<number | null>(null)
  const [editingHex, setEditingHex] = useState("")
  const [originalEditingHex, setOriginalEditingHex] = useState("")
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState("")
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [nameError, setNameError] = useState<number | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dragMode, setDragMode] = useState<"swap" | "insert" | null>(null)
  const [insertPosition, setInsertPosition] = useState<"before" | "after" | null>(null)
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null)
  const [hoveredHandleIndex, setHoveredHandleIndex] = useState<number | null>(null)
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null)
  const [dragOverGroupName, setDragOverGroupName] = useState<string | null>(null)
  const [isDragOverNewGroup, setIsDragOverNewGroup] = useState(false)
  const [isDragOverTrash, setIsDragOverTrash] = useState(false)
  const [isBetweenZonesActive, setIsBetweenZonesActive] = useState(false)
  const [isAnyCardDragging, setIsAnyCardDragging] = useState(false)
  const deleteZoneTooltipId = useId()

  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const dragImageRef = useRef<HTMLDivElement | null>(null)
  const newGroupZoneRef = useRef<HTMLDivElement | null>(null)
  const deleteZoneRef = useRef<HTMLDivElement | null>(null)
  const dropZonesContainerRef = useRef<HTMLDivElement | null>(null)
  const dropZonesLayoutRef = useRef<HTMLDivElement | null>(null)
  const swatchesRef = useRef(swatches)
  const [indicatorPosition, setIndicatorPosition] = useState<DragIndicatorPosition | null>(null)
  const [justDropped, setJustDropped] = useState(false)
  const [droppedAtIndex, setDroppedAtIndex] = useState<number | null>(null)
  const [poppingCardIds, setPoppingCardIds] = useState<string[]>([])
  const defaultSizeIndex = useMemo(() => {
    const index = CARD_SIZE_TOKENS.findIndex((token) => token.id === "md")
    return index === -1 ? 0 : index
  }, [])
  const [cardSizeIndex, setCardSizeIndex] = useState(defaultSizeIndex)
  const selectedCardSize =
    CARD_SIZE_TOKENS[Math.min(cardSizeIndex, CARD_SIZE_TOKENS.length - 1)] ??
    CARD_SIZE_TOKENS[CARD_SIZE_TOKENS.length - 1]
  const [dropZoneWidth, setDropZoneWidth] = useState(() => selectedCardSize.width)
  const [dropZonesStacked, setDropZonesStacked] = useState(false)
  const [pendingNewGroupSwatchId, setPendingNewGroupSwatchId] = useState<string | null>(null)
  const minCardWidth = CARD_MIN_COLUMN_WIDTH
  const [isCardSizeMenuOpen, setIsCardSizeMenuOpen] = useState(false)
  const isAnyCardDraggingRef = useRef(isAnyCardDragging)

  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const managerRef = useRef<HTMLDivElement | null>(null)
  const scrollAnchorParentRef = useRef<HTMLElement | null>(null)
  const previousTopRef = useRef<number | null>(null)
  const [editMode, setEditMode] = useState<"button" | "doubleClick" | null>(null)

  const [newlyCreatedGroups, setNewlyCreatedGroups] = useState<Set<string>>(new Set())
  const [removingGroups, setRemovingGroups] = useState<Set<string>>(new Set())
  const prevGroupsRef = useRef<Set<string>>(new Set())

  const groupedColors = groupColorsByCategory(colors)
  const groupCount = groupedColors.size

  useEffect(() => {
    const currentGroups = new Set(groupedColors.keys())
    const prevGroups = prevGroupsRef.current

    const newGroups = new Set<string>()
    currentGroups.forEach((group) => {
      if (!prevGroups.has(group)) {
        newGroups.add(group)
      }
    })

    const removedGroups = new Set<string>()
    prevGroups.forEach((group) => {
      if (!currentGroups.has(group)) {
        removedGroups.add(group)
      }
    })

    if (newGroups.size > 0) {
      setNewlyCreatedGroups(newGroups)
      setTimeout(() => {
        setNewlyCreatedGroups(new Set())
      }, 300)
    }

    if (removedGroups.size > 0) {
      setRemovingGroups(removedGroups)
      setTimeout(() => {
        setRemovingGroups(new Set())
      }, 200)
    }

    prevGroupsRef.current = currentGroups
  }, [groupedColors])

  useEffect(() => {
    if (dragOverIndex !== null && dragMode === "insert" && insertPosition) {
      const card = cardRefs.current.get(dragOverIndex)
      if (card) {
        const rect = card.getBoundingClientRect()
        const container = card.parentElement
        if (container) {
          const containerRect = container.getBoundingClientRect()
          const computedStyles = window.getComputedStyle(container)
          const gapValueRaw = computedStyles.columnGap || computedStyles.gap || "0"
          const gapValue = Number.parseFloat(gapValueRaw) || 0
          const horizontalOffset = gapValue > 0 ? gapValue / 2 : 6
          const indicatorHeight = Math.max(rect.height - 24, rect.height * 0.7, 64)
          const centerY = rect.top - containerRect.top + rect.height / 2
          const left =
            insertPosition === "before"
              ? rect.left - containerRect.left - horizontalOffset
              : rect.right - containerRect.left + horizontalOffset

          setIndicatorPosition({
            left,
            top: centerY,
            height: indicatorHeight,
          })
        }
      }
    } else {
      setIndicatorPosition(null)
    }
  }, [dragOverIndex, dragMode, insertPosition])

  useEffect(() => {
    swatchesRef.current = swatches
  }, [swatches])

  useEffect(() => {
    setPoppingCardIds((ids) => ids.filter((id) => swatches.some((swatch) => swatch.id === id)))
  }, [swatches])

  useEffect(() => {
    if (!pendingNewGroupSwatchId) return
    const index = swatches.findIndex((swatch) => swatch.id === pendingNewGroupSwatchId)
    if (index === -1) return

    onColorEdit?.(index)
    setDroppedAtIndex(index)
    setJustDropped(true)
    setPendingNewGroupSwatchId(null)
  }, [pendingNewGroupSwatchId, swatches, onColorEdit])

  useLayoutEffect(() => {
    const root = managerRef.current
    if (!root) return

    const findScrollParent = (node: HTMLElement | null): HTMLElement | null => {
      let current: HTMLElement | null = node?.parentElement ?? null
      while (current) {
        const style = window.getComputedStyle(current)
        const overflowY = style.overflowY || style.overflow
        if (overflowY === "auto" || overflowY === "scroll") {
          return current
        }
        current = current.parentElement
      }
      return document.scrollingElement as HTMLElement | null
    }

    if (!scrollAnchorParentRef.current) {
      scrollAnchorParentRef.current = findScrollParent(root)
    }

    const scrollParent = scrollAnchorParentRef.current
    const prevTop = previousTopRef.current
    const currentTop = root.getBoundingClientRect().top

    if (prevTop !== null && scrollParent) {
      const delta = currentTop - prevTop
      if (Math.abs(delta) > 1) {
        scrollParent.scrollTop -= delta
      }
    }

    previousTopRef.current = currentTop
  }, [cardSizeIndex, groupCount])

  useEffect(() => {
    if (justDropped) {
      const timer = setTimeout(() => {
        setJustDropped(false)
        setDroppedAtIndex(null)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [justDropped])

  useEffect(() => {
    if (editingIndex !== null && nameInputRef.current && editMode) {
      const input = nameInputRef.current
      const value = input.value

      if (editMode === "doubleClick") {
        setTimeout(() => {
          input.setSelectionRange(value.length, value.length)
        }, 0)
      } else if (editMode === "button") {
        const slashIndex = value.indexOf("/")
        if (slashIndex !== -1) {
          setTimeout(() => {
            input.setSelectionRange(slashIndex + 1, value.length)
          }, 0)
        } else {
          setTimeout(() => {
            input.setSelectionRange(0, value.length)
          }, 0)
        }
      }
    }
  }, [editingIndex, editMode])

  const handleEditName = (index: number, currentColor: string, mode: "button" | "doubleClick" = "button") => {
    onColorEdit?.(-1)

    const swatch = getSwatchAt(index)
    const label = swatch ? composeLabel(swatch.name, swatch.group, swatch.hex) : ""
    setEditingIndex(index)
    setEditingName(label)
    setOriginalEditingName(label)
    setEditMode(mode)
    setNameError(null)
  }

  const handleClickName = (index: number, currentColor: string) => {
    handleEditName(index, currentColor, "button")
  }

  const handleNameChange = (value: string, index: number) => {
    setEditingName(value)
    const slashCount = (value.match(/\//g) || []).length
    if (slashCount > 1) {
      setNameError(index)
    } else {
      setNameError(null)
    }
  }

  const handleSaveName = (index: number) => {
    if (nameError === index) {
      return
    }
    if (editingName !== originalEditingName) {
      const currentSwatch = getSwatchAt(index)
      const hex = currentSwatch?.hex ?? "#000000"
      const label = editingName.trim()
      const { name, group } = splitLabel(label)
      const updated = updateSwatch(currentSwatch ?? createSwatch({ hex }), {
        name,
        group,
      })
      onUpdateColor(index, updated)
    }
    setEditingIndex(null)
    setNameError(null)
    setEditMode(null)
  }

  const handleCancelNameEdit = () => {
    setEditingIndex(null)
    setNameError(null)
    setEditMode(null)
  }

  const handleEditHex = (index: number) => {
    const currentSwatch = getSwatchAt(index)
    const hex = currentSwatch?.hex ?? "#000000"
    setEditingHexIndex(index)
    setEditingHex(hex)
    setOriginalEditingHex(hex)
  }

  const handleSaveHex = (index: number) => {
    if (editingHex !== originalEditingHex) {
      const currentSwatch = getSwatchAt(index)
      const normalized = normalizeHex(editingHex)
      const updated = updateSwatch(currentSwatch ?? createSwatch({ hex: normalized }), { hex: normalized })
      onUpdateColor(index, updated)
    }
    setEditingHexIndex(null)
  }

  const handleCancelHexEdit = () => {
    setEditingHexIndex(null)
  }

  const handleEditGroupName = (oldName: string) => {
    onColorEdit?.(-1)

    setEditingGroupName(oldName)
    setNewGroupName(oldName)
  }

  const handleSaveGroupName = (oldName: string) => {
    if (newGroupName.trim() && newGroupName !== oldName) {
      const oldNameLower = oldName.toLowerCase()

      const updatedColors = colors.map((color) => {
        const parts = color.split("#")
        const customName = parts.length > 1 ? parts[0] : ""

        if (customName.toLowerCase().startsWith(oldNameLower + "/")) {
          const nameParts = customName.split("/")
          nameParts[0] = newGroupName
          const hex = parts.length > 1 ? parts[1] : parts[0].replace("#", "")
          return `${nameParts.join("/")}#${hex}`
        }
        return color
      })

      onBatchUpdateColors(toSwatchArray(updatedColors))
    }
    setEditingGroupName(null)
  }

  const handleCancelGroupEdit = () => {
    setEditingGroupName(null)
  }

  const handleCopyHex = (hex: string, index: number) => {
    const hexWithoutHash = hex.replace("#", "")
    navigator.clipboard.writeText(hexWithoutHash)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current)
      dragImageRef.current = null
    }
    setDraggedIndex(index)
    setIsAnyCardDragging(true)
    e.dataTransfer.effectAllowed = "move"

    const card = cardRefs.current.get(index)
    if (card && typeof window !== "undefined") {
      const rect = card.getBoundingClientRect()
      const clone = card.cloneNode(true) as HTMLDivElement
      clone.style.position = "absolute"
      clone.style.top = "-9999px"
      clone.style.left = "-9999px"
      clone.style.width = `${rect.width}px`
      clone.style.height = `${rect.height}px`
      clone.style.pointerEvents = "none"
      clone.style.boxShadow = window.getComputedStyle(card).boxShadow
      document.body.appendChild(clone)
      dragImageRef.current = clone
      const offsetX = e.clientX - rect.left
      const offsetY = e.clientY - rect.top
      e.dataTransfer.setDragImage(clone, offsetX, offsetY)
    }

    onColorEdit?.(-1)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      const rect = e.currentTarget.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const cardWidth = rect.width

      const leftThreshold = cardWidth * 0.25
      const rightThreshold = cardWidth * 0.75

      if (mouseX < leftThreshold) {
        setDragMode("insert")
        setInsertPosition("before")
        setDragOverIndex(index)
      } else if (mouseX > rightThreshold) {
        setDragMode("insert")
        setInsertPosition("after")
        setDragOverIndex(index)
      } else {
        setDragMode("swap")
        setInsertPosition(null)
        setDragOverIndex(index)
      }
    }
  }

  const handleDragOverGroup = (e: React.DragEvent, groupName: string) => {
    e.preventDefault()
    setDragOverGroup(groupName)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (draggedIndex !== null && dragOverIndex !== null && dragMode === "swap") {
      const draggedColor = colors[draggedIndex]
      const targetColor = colors[dragOverIndex]

      const draggedParts = draggedColor.split("#")
      const draggedCustomName = draggedParts.length > 1 ? draggedParts[0] : ""
      const targetParts = targetColor.split("#")
      const targetCustomName = targetParts.length > 1 ? targetParts[0] : ""

      const draggedGroup = draggedCustomName.includes("/") ? draggedCustomName.split("/")[0] : "ungrouped"
      const targetGroup = targetCustomName.includes("/") ? targetCustomName.split("/")[0] : "ungrouped"

      let updatedDraggedColor = draggedColor
      let updatedTargetColor = targetColor

      if (draggedGroup !== targetGroup) {
        updatedDraggedColor = updateColorGroup(draggedColor, targetGroup)
      }

      const targetGroupForDragged = draggedGroup
      if (draggedGroup !== targetGroup) {
        updatedTargetColor = updateColorGroup(targetColor, targetGroupForDragged)
      }

      const newColors = [...colors]
      newColors[draggedIndex] = updatedTargetColor
      newColors[dragOverIndex] = updatedDraggedColor

      onBatchUpdateColors(toSwatchArray(newColors))
      setDroppedAtIndex(dragOverIndex)
      setJustDropped(true)
    } else if (draggedIndex !== null && dragOverIndex !== null && dragMode === "insert") {
      const newColors = [...colors]
      const draggedColor = colors[draggedIndex]
      const targetColor = colors[dragOverIndex]

      const draggedParts = draggedColor.split("#")
      const draggedCustomName = draggedParts.length > 1 ? draggedParts[0] : ""

      const targetParts = targetColor.split("#")
      const targetCustomName = targetParts.length > 1 ? targetParts[0] : ""

      const draggedGroup = draggedCustomName.includes("/") ? draggedCustomName.split("/")[0] : "ungrouped"
      const targetGroup = targetCustomName.includes("/") ? targetCustomName.split("/")[0] : "ungrouped"

      let colorToInsert = draggedColor
      if (draggedGroup !== targetGroup) {
        colorToInsert = updateColorGroup(draggedColor, targetGroup)
      }

      newColors.splice(draggedIndex, 1)

      let targetIndex = dragOverIndex
      if (draggedIndex < dragOverIndex) {
        targetIndex--
      }
      if (insertPosition === "after") {
        targetIndex++
      }

      newColors.splice(targetIndex, 0, colorToInsert)
      onBatchUpdateColors(toSwatchArray(newColors))
      setDroppedAtIndex(targetIndex)
      setJustDropped(true)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
    setDragMode(null)
    setInsertPosition(null)
    setDragOverGroup(null)
    setIsAnyCardDragging(false)
    setIsDragOverNewGroup(false)
    setIsDragOverTrash(false)
    setIsBetweenZonesActive(false)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
    setDragMode(null)
    setInsertPosition(null)
    setDragOverGroup(null)
    setIsAnyCardDragging(false)
    setIsDragOverNewGroup(false)
    setIsDragOverTrash(false)
    setIsBetweenZonesActive(false)
    if (newGroupLeaveTimeoutRef.current) {
      clearTimeout(newGroupLeaveTimeoutRef.current)
      newGroupLeaveTimeoutRef.current = null
    }
    if (trashLeaveTimeoutRef.current) {
      clearTimeout(trashLeaveTimeoutRef.current)
      trashLeaveTimeoutRef.current = null
    }
    if (betweenZoneLeaveTimeoutRef.current) {
      clearTimeout(betweenZoneLeaveTimeoutRef.current)
      betweenZoneLeaveTimeoutRef.current = null
    }
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current)
      dragImageRef.current = null
    }
  }

  const handleGroupDragStart = (e: React.DragEvent, groupName: string) => {
    onColorEdit?.(-1)

    setDraggedGroup(groupName)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleGroupDragOver = (e: React.DragEvent, groupName: string) => {
    e.preventDefault()
    if (draggedGroup && draggedGroup !== groupName) {
      setDragOverGroupName(groupName)
    }
  }

  const handleGroupDrop = (e: React.DragEvent, targetGroupName: string) => {
    e.preventDefault()
    e.stopPropagation()

    if (!draggedGroup || draggedGroup === targetGroupName) {
      setDraggedGroup(null)
      setDragOverGroupName(null)
      return
    }

    const draggedColors = groupedColors.get(draggedGroup) || []
    const targetColors = groupedColors.get(targetGroupName) || []

    if (draggedColors.length === 0) {
      setDraggedGroup(null)
      setDragOverGroupName(null)
      return
    }

    const draggedFirstIndex = draggedColors[0].originalIndex
    const targetFirstIndex = targetColors[0].originalIndex

    const newColors = [...colors]

    const draggedGroupColors = draggedColors.map((c) => colors[c.originalIndex])

    draggedColors
      .sort((a, b) => b.originalIndex - a.originalIndex)
      .forEach((c) => {
        newColors.splice(c.originalIndex, 1)
      })

    let newTargetIndex = targetFirstIndex
    if (draggedFirstIndex < targetFirstIndex) {
      newTargetIndex -= draggedColors.length
    }

    newColors.splice(newTargetIndex, 0, ...draggedGroupColors)

    onBatchUpdateColors(toSwatchArray(newColors))
    setDraggedGroup(null)
    setDragOverGroupName(null)
  }

  const handleGroupDragEnd = () => {
    setDraggedGroup(null)
    setDragOverGroupName(null)
  }

  const handleInsertZoneHover = (targetIndex: number, targetGroup: string, position: "before" | "after") => {
    if (draggedIndex === null) {
      setDragMode(null)
      setInsertPosition(null)
      setDragOverIndex(null)
      setDragOverGroup(null)
      return
    }

    if (draggedIndex === targetIndex) {
      return
    }

    const isAdjacent =
      (draggedIndex === targetIndex - 1 && position === "before") ||
      (draggedIndex === targetIndex + 1 && position === "after")

    if (isAdjacent) {
      return
    }

    if (dragMode === "insert" && insertPosition === position && dragOverIndex === targetIndex) {
      return
    }

    setDragMode("insert")
    setInsertPosition(position)
    setDragOverIndex(targetIndex)
    setDragOverGroup(targetGroup)
  }

  const handleInsertZoneLeave = () => {
    setDragOverIndex(null)
    setDragMode(null)
    setInsertPosition(null)
  }

  const getNextGroupName = useCallback(() => {
    const existingGroupsLower = new Set(Array.from(groupedColors.keys(), (group) => group.toLowerCase()))
    const baseName = "newGroup"
    let candidate = baseName
    let counter = 1

    while (existingGroupsLower.has(candidate.toLowerCase())) {
      counter += 1
      candidate = `${baseName}${counter}`
    }

    return candidate
  }, [groupedColors])

  const handleAddNewGroup = () => {
    const groupName = getNextGroupName()
    const parsedDefault = parseLegacyColor(lastInteractedColor ?? "#808080")
    const { name: parsedName } = splitLabel(parsedDefault.label)
    const defaultHex = parsedDefault.hex
    const defaultName = parsedName || defaultHex.replace("#", "")
    const newSwatch = createSwatch({ hex: defaultHex, name: defaultName, group: groupName })

    setPendingNewGroupSwatchId(newSwatch.id)
    onAddColor(newSwatch)
  }

  const scheduleCardRemoval = (index: number) => {
    const swatch = getSwatchAt(index)
    if (!swatch) {
      onColorEdit?.(-1)
      onRemoveColor(index)
      return
    }

    const removalSwatchId = swatch.id
    const existingTimeout = removalTimeoutsRef.current.get(removalSwatchId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    setPoppingCardIds((current) =>
      current.includes(removalSwatchId) ? current : [...current, removalSwatchId],
    )

    const timeout = setTimeout(() => {
      const currentIndex = swatchesRef.current.findIndex((item) => item.id === removalSwatchId)
      if (currentIndex !== -1) {
        onColorEdit?.(-1)
        onRemoveColor(currentIndex)
      }
      setPoppingCardIds((current) => current.filter((id) => id !== removalSwatchId))
      removalTimeoutsRef.current.delete(removalSwatchId)
    }, CARD_REMOVE_ANIMATION_MS)

    removalTimeoutsRef.current.set(removalSwatchId, timeout)
  }

  const handleDropOnNewGroup = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (draggedIndex !== null) {
      const draggedColor = colors[draggedIndex]
      const parts = draggedColor.split("#")
      const hex = "#" + (parts.length > 1 ? parts[1] : parts[0].replace("#", ""))

      const groupName = getNextGroupName()
      const newColor = `${groupName}/${hex.replace("#", "")}${hex}`
      onUpdateColor(draggedIndex, toSwatch(newColor, draggedIndex))
    }

    if (betweenZoneLeaveTimeoutRef.current) {
      clearTimeout(betweenZoneLeaveTimeoutRef.current)
      betweenZoneLeaveTimeoutRef.current = null
    }
    setIsDragOverNewGroup(false)
    setIsDragOverTrash(false)
    setDraggedIndex(null)
    setIsAnyCardDragging(false)
    setIsBetweenZonesActive(false)
  }

  const handleDropOnTrash = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (draggedIndex !== null) {
      scheduleCardRemoval(draggedIndex)
    }

    if (betweenZoneLeaveTimeoutRef.current) {
      clearTimeout(betweenZoneLeaveTimeoutRef.current)
      betweenZoneLeaveTimeoutRef.current = null
    }
    setIsDragOverTrash(false)
    setIsDragOverNewGroup(false)
    setDraggedIndex(null)
    setIsAnyCardDragging(false)
    setIsBetweenZonesActive(false)
  }

  const groupNameTextClass = "text-3xl font-medium"

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleCardClick = (index: number, e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.tagName === "INPUT" ||
      target.tagName === "BUTTON"
    ) {
      return
    }

    onColorEdit?.(index)
  }

  const newGroupLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const trashLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const betweenZoneLeaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const removalTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  useEffect(() => {
    return () => {
      if (newGroupLeaveTimeoutRef.current) {
        clearTimeout(newGroupLeaveTimeoutRef.current)
      }
      if (trashLeaveTimeoutRef.current) {
        clearTimeout(trashLeaveTimeoutRef.current)
      }
      if (betweenZoneLeaveTimeoutRef.current) {
        clearTimeout(betweenZoneLeaveTimeoutRef.current)
      }
      removalTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout))
      removalTimeoutsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    isAnyCardDraggingRef.current = isAnyCardDragging
  }, [isAnyCardDragging])

  const dropZoneDimensionStyle = useMemo(() => {
    if (!dropZoneWidth) return undefined
    const roundedWidth = Math.max(0, Math.round(dropZoneWidth))
    return { width: `${roundedWidth}px`, maxWidth: `${roundedWidth}px` }
  }, [dropZoneWidth])

  const updateDropZoneWidth = useCallback((nextWidth: number | null | undefined) => {
    if (!nextWidth || Number.isNaN(nextWidth)) return
    if (isAnyCardDraggingRef.current) return
    const rounded = Math.max(0, Math.round(nextWidth))
    setDropZoneWidth((previous) => (previous === rounded ? previous : rounded))
  }, [])

  const measureDropZoneWidth = useCallback(() => {
    if (isAnyCardDraggingRef.current) return dropZoneWidth
    let measured = selectedCardSize.width
    const iterator = cardRefs.current.values().next()
    if (!iterator.done) {
      const cardElement = iterator.value
      if (cardElement) {
        const rect = cardElement.getBoundingClientRect()
        if (rect.width > 0) {
          measured = rect.width
        }
      }
    }
    updateDropZoneWidth(measured)
    return measured
  }, [dropZoneWidth, selectedCardSize.width, updateDropZoneWidth])

  useLayoutEffect(() => {
    measureDropZoneWidth()
  }, [measureDropZoneWidth, swatches.length, cardSizeIndex])

  useEffect(() => {
    const iterator = cardRefs.current.values().next()
    const firstCard = iterator.value as HTMLElement | undefined
    if (!firstCard) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        if (width) {
          updateDropZoneWidth(width)
        }
      }
    })

    observer.observe(firstCard)
    return () => observer.disconnect()
  }, [cardSizeIndex, swatches.length, updateDropZoneWidth])

  const recomputeDropZoneLayout = useCallback(() => {
    const container = dropZonesLayoutRef.current ?? dropZonesContainerRef.current
    if (!container) return
    if (isAnyCardDraggingRef.current) return

    const containerWidth = container.clientWidth
    const styles = window.getComputedStyle(container)
    const gapValueRaw = styles.columnGap || styles.gap || "0"
    const gap = Number.parseFloat(gapValueRaw) || 0
    const targetWidth = dropZoneWidth || selectedCardSize.width
    if (!targetWidth) return
    const requiredWidth = targetWidth * 2 + gap + 4
    const shouldStack = containerWidth < requiredWidth
    setDropZonesStacked((previous) => (previous === shouldStack ? previous : shouldStack))
  }, [dropZoneWidth, selectedCardSize.width])

  useLayoutEffect(() => {
    recomputeDropZoneLayout()
  }, [recomputeDropZoneLayout])

  useLayoutEffect(() => {
    const container = dropZonesLayoutRef.current ?? dropZonesContainerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      if (isAnyCardDraggingRef.current) return
      recomputeDropZoneLayout()
    })
    observer.observe(container)
    window.addEventListener("resize", recomputeDropZoneLayout)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", recomputeDropZoneLayout)
    }
  }, [recomputeDropZoneLayout])

  useEffect(() => {
    if (!isAnyCardDragging) {
      recomputeDropZoneLayout()
    }
  }, [isAnyCardDragging, recomputeDropZoneLayout])

  const dropZoneBaseClass =
    "group relative flex shrink-0 flex-col rounded-lg border-2 border-transparent bg-transparent duration-200 ease-in-out transition-[border-color,background-color,box-shadow,opacity]"
  const DROP_ZONE_EXIT_DELAY = 240
  const CARD_REMOVE_ANIMATION_MS = 220
  const newGroupDropZoneActive = isBetweenZonesActive || isDragOverNewGroup
  const deleteDropZoneActive = isBetweenZonesActive || isDragOverTrash
  const isDropZoneExpanded = newGroupDropZoneActive || deleteDropZoneActive

  return (
    <div
      ref={managerRef}
      className="space-y-8 border-border p-6 relative border-2 rounded-md bg-background mx-0"
      style={{ overflowAnchor: "none" }}
    >
      <div className="pb-4 border-b-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-2xl font-semibold leading-tight">{label}</h2>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 md:self-end">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Card Size</span>
            <DropdownMenu open={isCardSizeMenuOpen} onOpenChange={setIsCardSizeMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "flex cursor-pointer items-center gap-2 border-border px-3 py-1 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-primary/40",
                    isCardSizeMenuOpen ? "border-primary/60 bg-primary/5 text-primary" : "",
                  )}
                  style={{
                    borderRadius: isCardSizeMenuOpen
                      ? CARD_CONTROL_RADII.elevated
                      : CARD_CONTROL_RADII.pill,
                  }}
                >
                  <span>{selectedCardSize.label}</span>
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="border border-border bg-background/95 p-2 shadow-lg backdrop-blur"
                style={{ borderRadius: CARD_CONTROL_RADII.elevated }}
              >
                <div className="flex items-center gap-1">
                  {CARD_SIZE_TOKENS.map((option, index) => {
                    const isActive = index === cardSizeIndex
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setCardSizeIndex(index)
                          setIsCardSizeMenuOpen(false)
                        }}
                        className={cn(
                          "relative flex h-8 min-w-[2.5rem] cursor-pointer items-center justify-center px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isActive ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/85" : "bg-muted text-foreground hover:bg-muted/70",
                        )}
                        style={{
                          borderRadius: isActive
                            ? CARD_CONTROL_RADII.elevated
                            : CARD_CONTROL_RADII.pill,
                        }}
                      >
                        <span>{option.label}</span>
                      </button>
                    )
                  })}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {Array.from(groupedColors.entries()).map(([groupName, groupColors]) => {
        const isGroupDragging = draggedGroup === groupName
        const isGroupDragOver = dragOverGroupName === groupName
        const isNewlyCreated = newlyCreatedGroups.has(groupName)
        const isRemoving = removingGroups.has(groupName)
        const showIndicator = dragMode === "insert" && dragOverGroup === groupName && indicatorPosition !== null

        const header = (
          <GroupHeader
            groupName={groupName}
            groupNameTextClass={groupNameTextClass}
            isEditing={editingGroupName === groupName}
            editingValue={editingGroupName === groupName ? newGroupName : groupName}
            isUngrouped={groupName === "Ungrouped"}
            onChangeEditingValue={(value) => {
              if (editingGroupName === groupName) {
                setNewGroupName(value)
              }
            }}
            onSaveEditingValue={() => handleSaveGroupName(groupName)}
            onCancelEditing={handleCancelGroupEdit}
            onStartEditing={() => handleEditGroupName(groupName)}
            onDragStart={(event) => handleGroupDragStart(event, groupName)}
            onDragEnd={handleGroupDragEnd}
          />
        )

        const addButton = (
          <div
            className="relative w-full"
            onDragOver={(event) => {
              event.preventDefault()
              if (draggedIndex !== null && groupColors.length > 0) {
                const lastIndex = groupColors[groupColors.length - 1].originalIndex
                handleInsertZoneHover(lastIndex, groupName, "after")
              }
            }}
            onDragLeave={(event) => {
              const relatedTarget = event.relatedTarget as HTMLElement | null
              if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
                handleInsertZoneLeave()
              }
            }}
          >
            <button
              type="button"
              aria-label="Add color card"
              className="group relative flex w-full cursor-pointer flex-col items-stretch gap-1.5 overflow-visible rounded-xl border border-transparent bg-white p-2.5 pb-3 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-500 focus-visible:ring-offset-background"
              onClick={() => {
                const newColorName =
                  groupName === "Ungrouped"
                    ? lastInteractedColor
                    : groupName.toLowerCase() + "/new" + lastInteractedColor
                onAddColor(swatchFromLegacy(newColorName))
              }}
            >
              <div className="flex w-full items-center justify-between px-0.5 text-[11px] font-semibold text-transparent" aria-hidden="true">
                <span className="font-mono text-[11px] uppercase tracking-tight opacity-0 select-none">
                  Add Color
                </span>
                <div className="flex items-center gap-1">
                  <span className="inline-flex h-6 w-6 rounded-md border border-transparent" />
                  <span className="inline-flex h-6 w-6 rounded-md border border-transparent" />
                </div>
              </div>

              <div className="w-full overflow-hidden rounded-lg border border-dashed border-slate-300 bg-white shadow-sm transition group-hover:border-slate-400 group-hover:bg-slate-50">
                <div className="flex h-24 w-full items-center justify-center border-b border-dashed border-slate-300 bg-gradient-to-b from-white to-slate-50 transition group-hover:from-slate-50 group-hover:to-white">
                  <Plus className="h-8 w-8 text-slate-400 transition group-hover:text-slate-600" />
                </div>
                <div className="flex items-center justify-between px-2.5 pb-1.5 pt-2.5">
                  <span className="inline-flex h-7 w-7 shrink-0 rounded-md border border-transparent" aria-hidden="true" />
                  <span className="font-mono text-sm uppercase tracking-wide text-slate-500 transition group-hover:text-slate-700">
                    Add Color
                  </span>
                  <span className="inline-flex h-7 w-7 shrink-0 rounded-md border border-transparent" aria-hidden="true" />
                </div>
              </div>
            </button>
          </div>
        )

        return (
          <GroupSection
            key={groupName}
            isGroupDragging={isGroupDragging}
            isGroupDragOver={isGroupDragOver && !!draggedGroup}
            isNewlyCreated={isNewlyCreated}
            isRemoving={isRemoving}
            indicatorPosition={indicatorPosition}
            showIndicator={showIndicator}
            targetCardWidth={selectedCardSize.width}
            minCardWidth={minCardWidth}
            onGroupReorderDragOver={(event) => handleGroupDragOver(event, groupName)}
            onGroupReorderDrop={(event) => handleGroupDrop(event, groupName)}
            onCardDragOver={(event) => handleDragOverGroup(event, groupName)}
            onCardDrop={handleDrop}
            header={header}
            addButton={addButton}
          >
            {groupColors.map((colorItem, idx) => {
              const actualIndex = colorItem.originalIndex
              const swatch = getSwatchAt(actualIndex)
              const isDraggingCard = draggedIndex === actualIndex
              const isDropTarget = dragOverIndex === actualIndex

              return (
                <ColorCard
                  key={swatch?.id ?? colorItem.hex + "-" + actualIndex}
                  color={colorItem}
                  nameInputRef={nameInputRef}
                  registerCardRef={(element) => {
                    if (element) {
                      cardRefs.current.set(actualIndex, element)
                    } else {
                      cardRefs.current.delete(actualIndex)
                    }
                  }}
                  showBeforeInsertZone={idx > 0}
                  showAfterInsertZone={idx < groupColors.length - 1}
                  state={{
                    isDragging: isDraggingCard,
                    isDropTarget,
                    showSwapTarget: dragMode === "swap",
                    highlightHandle: hoveredHandleIndex === actualIndex,
                    highlightActiveEditing: activeEditingIndex === actualIndex,
                    showCopySuccess: copiedIndex === actualIndex,
                    showJustDropped: justDropped && droppedAtIndex === actualIndex,
                    showDeleting: swatch ? poppingCardIds.includes(swatch.id) : false,
                    insertPosition:
                      dragMode === "insert" && dragOverIndex === actualIndex ? insertPosition : null,
                    isEditingName: editingIndex === actualIndex,
                    editingName,
                    hasNameError: nameError === actualIndex,
                    isEditingHex: editingHexIndex === actualIndex,
                    editingHex,
                  }}
                  onNameChange={(value) => handleNameChange(value, actualIndex)}
                  onNameSave={() => handleSaveName(actualIndex)}
                  onNameCancel={handleCancelNameEdit}
                  onNameEdit={(mode = "button") => handleEditName(actualIndex, colors[actualIndex], mode)}
                  onNameClick={() => handleClickName(actualIndex, colors[actualIndex])}
                  onDelete={() => setDeleteIndex(actualIndex)}
                  onHexChange={setEditingHex}
                  onHexSave={() => handleSaveHex(actualIndex)}
                  onHexCancel={handleCancelHexEdit}
                  onHexEdit={() => handleEditHex(actualIndex)}
                  onCopyHex={() => handleCopyHex(colorItem.hex, actualIndex)}
                  onDragStart={(event) => handleDragStart(event, actualIndex)}
                  onDragEnd={() => handleDragEnd()}
                  onDragOver={(event) => handleDragOver(event, actualIndex)}
                  onDragLeave={() => handleDragLeave()}
                  onInsertZoneHover={(position) => handleInsertZoneHover(actualIndex, groupName, position)}
                  onInsertZoneLeave={() => handleInsertZoneLeave()}
                  onCardClick={(event) => handleCardClick(actualIndex, event)}
                  onHandleHover={(hovering) => setHoveredHandleIndex(hovering ? actualIndex : null)}
                  onSwatchClick={() => onColorEdit?.(actualIndex)}
                />
              )
            })}
          </GroupSection>
        )
      })}

      <div
        ref={dropZonesContainerRef}
        className={cn(
          "relative flex w-full justify-start transition-all duration-300 ease-in-out",
          isDropZoneExpanded ? "py-6" : "pt-3 pb-5",
        )}
        onDragOver={(event) => {
          if (!isAnyCardDragging) return
          event.preventDefault()
          setIsBetweenZonesActive(true)
          setIsDragOverNewGroup(false)
          setIsDragOverTrash(false)
        }}
        onDragLeave={(event) => {
          const related = event.relatedTarget as Node | null
          if (
            related &&
            (dropZonesContainerRef.current?.contains(related) ?? false)
          ) {
            return
          }
          if (betweenZoneLeaveTimeoutRef.current) {
            clearTimeout(betweenZoneLeaveTimeoutRef.current)
          }
          betweenZoneLeaveTimeoutRef.current = setTimeout(() => {
            setIsBetweenZonesActive(false)
            setIsDragOverNewGroup(false)
            setIsDragOverTrash(false)
            betweenZoneLeaveTimeoutRef.current = null
          }, DROP_ZONE_EXIT_DELAY)
        }}
        onDrop={(event) => {
          event.preventDefault()
          if (betweenZoneLeaveTimeoutRef.current) {
            clearTimeout(betweenZoneLeaveTimeoutRef.current)
            betweenZoneLeaveTimeoutRef.current = null
          }
          setIsDragOverNewGroup(false)
          setIsDragOverTrash(false)
          setIsBetweenZonesActive(false)
        }}
      >
        <div
          ref={dropZonesLayoutRef}
          className={cn(
            "flex w-full transition-all duration-300 ease-in-out",
            dropZonesStacked ? "flex-col items-center gap-6" : "flex-row items-start justify-between gap-6",
          )}
        >
          <div
            ref={newGroupZoneRef}
            className={cn(
              dropZoneBaseClass,
              newGroupDropZoneActive
                ? isDragOverNewGroup
                  ? "h-44 border-dashed border-blue-500 bg-blue-100/80 opacity-100 shadow-sm"
                  : "h-44 border-dashed border-blue-300 bg-blue-50/60 opacity-100"
                : "bg-transparent opacity-100 hover:border-blue-200 hover:bg-blue-50/40",
            )}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (isAnyCardDragging) {
                if (newGroupLeaveTimeoutRef.current) {
                  clearTimeout(newGroupLeaveTimeoutRef.current)
                  newGroupLeaveTimeoutRef.current = null
                }
                setIsDragOverNewGroup(true)
                setIsDragOverTrash(false)
                setIsBetweenZonesActive(true)
                setDragOverIndex(null)
                setDragMode(null)
                setInsertPosition(null)
              }
            }}
            onDragLeave={(event) => {
              if (newGroupLeaveTimeoutRef.current) {
                clearTimeout(newGroupLeaveTimeoutRef.current)
              }
              const related = event.relatedTarget as Node | null
              const stillWithinTray = !!related && (dropZonesContainerRef.current?.contains(related) ?? false)
              newGroupLeaveTimeoutRef.current = setTimeout(() => {
                setIsDragOverNewGroup(false)
                if (stillWithinTray && (isAnyCardDragging || isBetweenZonesActive)) {
                  setIsBetweenZonesActive(true)
                } else {
                  setIsBetweenZonesActive(false)
                  setIsDragOverTrash(false)
                }
                newGroupLeaveTimeoutRef.current = null
              }, DROP_ZONE_EXIT_DELAY)
            }}
            onDrop={handleDropOnNewGroup}
            style={dropZoneDimensionStyle}
          >
            {newGroupDropZoneActive ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 transition-all duration-300 ease-in-out">
                <FolderPlus className="h-8 w-8 text-blue-600 transition-all duration-300 ease-in-out" />
                <span className="text-sm font-medium text-blue-600 transition-colors duration-300 ease-in-out">
                  Drop to Create New Group
                </span>
              </div>
            ) : (
              <Button
                variant="cardAction"
                size="card"
                type="button"
                className="w-full gap-3 uppercase tracking-wide text-sm font-semibold text-foreground/90 transition-colors duration-200 group-hover:border-blue-200 group-hover:bg-blue-50/60 group-hover:text-blue-600 cursor-pointer"
                onClick={handleAddNewGroup}
              >
                <FolderPlus className="h-6 w-6 transition-all duration-300 ease-in-out border-0" />
                New Group
              </Button>
            )}
          </div>
          <div
            ref={deleteZoneRef}
            className={cn(
              dropZoneBaseClass,
              deleteDropZoneActive
                ? isDragOverTrash
                  ? "h-44 border-dashed border-rose-500 bg-rose-100/80 opacity-100 shadow-sm"
                  : "h-44 border-dashed border-rose-300 bg-rose-50/60 opacity-100"
                : "border-transparent bg-transparent opacity-100",
            )}
            onDragOver={(e) => {
              if (!isAnyCardDragging) return
              e.preventDefault()
              e.stopPropagation()
              if (trashLeaveTimeoutRef.current) {
                clearTimeout(trashLeaveTimeoutRef.current)
                trashLeaveTimeoutRef.current = null
              }
              setIsDragOverTrash(true)
              setIsDragOverNewGroup(false)
              setIsBetweenZonesActive(true)
            }}
            onDragLeave={(event) => {
              if (trashLeaveTimeoutRef.current) {
                clearTimeout(trashLeaveTimeoutRef.current)
              }
              const related = event.relatedTarget as Node | null
              const stillWithinTray = !!related && (dropZonesContainerRef.current?.contains(related) ?? false)
              trashLeaveTimeoutRef.current = setTimeout(() => {
                setIsDragOverTrash(false)
                if (stillWithinTray && (isAnyCardDragging || isBetweenZonesActive)) {
                  setIsBetweenZonesActive(true)
                } else {
                  setIsBetweenZonesActive(false)
                  setIsDragOverNewGroup(false)
                }
                trashLeaveTimeoutRef.current = null
              }, DROP_ZONE_EXIT_DELAY)
            }}
            onDrop={(event) => {
              if (!isAnyCardDragging) return
              handleDropOnTrash(event)
            }}
            style={dropZoneDimensionStyle}
          >
            {deleteDropZoneActive ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 transition-all duration-300 ease-in-out">
                <Trash2 className="h-8 w-8 text-rose-600 transition-all duration-300 ease-in-out" />
                <span className="text-sm font-medium text-rose-600 transition-colors duration-300 ease-in-out">
                  Drop to Delete
                </span>
              </div>
            ) : (
              <div className="relative w-full group/delete">
                <Button
                  variant="cardAction"
                  size="card"
                  type="button"
                  aria-disabled="true"
                  tabIndex={-1}
                  aria-describedby={deleteZoneTooltipId}
                  onClick={(event) => event.preventDefault()}
                  className="relative w-full justify-center gap-3 uppercase tracking-wide text-sm font-semibold border-dropzone-disabled-border bg-dropzone-disabled text-dropzone-disabled-foreground hover:border-dropzone-disabled-border hover:bg-dropzone-disabled hover:text-dropzone-disabled-foreground focus-visible:border-dropzone-disabled-border focus-visible:ring-[0px] focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0 focus-visible:outline-none focus-visible:shadow-none cursor-default"
                >
                  <span className="flex items-center gap-3 text-center">
                    <Trash2 className="h-6 w-6 text-dropzone-disabled-foreground/80" />
                    Delete
                  </span>
                </Button>
                <div
                  id={deleteZoneTooltipId}
                  role="tooltip"
                  className="pointer-events-none invisible absolute left-1/2 bottom-full w-full -translate-x-1/2 -translate-y-3 rounded-md border border-dropzone-disabled-border bg-background px-3 py-2 text-xs font-medium leading-4 text-foreground opacity-0 shadow-sm transition-opacity duration-150 group-hover/delete:visible group-hover/delete:opacity-100 group-focus-within/delete:visible group-focus-within/delete:opacity-100"
                  style={dropZoneDimensionStyle}
                >
                  Drag a card here to delete it
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => !open && setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete color?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this color? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteIndex !== null) {
                  scheduleCardRemoval(deleteIndex)
                }
                setDeleteIndex(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}









