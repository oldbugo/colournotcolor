"use client"

import type React from "react"
import { useMemo, useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Plus, FolderPlus, Trash2 } from "lucide-react"
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
import type { ColorSwatch } from "@/types/palette"
import { ColorCard } from "@/components/color-manager/color-card"
import { GroupHeader } from "@/components/color-manager/group-header"
import { GroupSection } from "@/components/color-manager/group-section"
import type { ColorWithName, DragIndicatorPosition } from "@/components/color-manager/types"
import {
  composeLabel,
  createSwatch,
  normalizeHex,
  splitLabel,
  swatchFromLegacy,
  swatchToLegacy,
  updateSwatch,
} from "@/lib/color-utils"

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
  const [isAnyCardDragging, setIsAnyCardDragging] = useState(false)

  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const dragImageRef = useRef<HTMLDivElement | null>(null)
  const [indicatorPosition, setIndicatorPosition] = useState<DragIndicatorPosition | null>(null)
  const [justDropped, setJustDropped] = useState(false)
  const [droppedAtIndex, setDroppedAtIndex] = useState<number | null>(null)

  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const [editMode, setEditMode] = useState<"button" | "doubleClick" | null>(null)

  const [newlyCreatedGroups, setNewlyCreatedGroups] = useState<Set<string>>(new Set())
  const [removingGroups, setRemovingGroups] = useState<Set<string>>(new Set())
  const prevGroupsRef = useRef<Set<string>>(new Set())

  const groupedColors = groupColorsByCategory(colors)

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
    if (newGroupLeaveTimeoutRef.current) {
      clearTimeout(newGroupLeaveTimeoutRef.current)
      newGroupLeaveTimeoutRef.current = null
    }
    if (trashLeaveTimeoutRef.current) {
      clearTimeout(trashLeaveTimeoutRef.current)
      trashLeaveTimeoutRef.current = null
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

  const handleAddNewGroup = () => {
    let groupNumber = 1
    let newGroupName = "new group"

    while (groupedColors.has(newGroupName.charAt(0).toUpperCase() + newGroupName.slice(1))) {
      groupNumber++
      newGroupName = `new group ${groupNumber}`
    }

    const label = lastInteractedColor.includes("/") ? lastInteractedColor : `Ungrouped/${lastInteractedColor}`
    onAddColor(swatchFromLegacy(label))
  }

  const handleDropOnNewGroup = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (draggedIndex !== null) {
      const draggedColor = colors[draggedIndex]
      const parts = draggedColor.split("#")
      const hex = "#" + (parts.length > 1 ? parts[1] : parts[0].replace("#", ""))

      let groupNumber = 1
      let newGroupName = "new group"
      while (groupedColors.has(newGroupName.charAt(0).toUpperCase() + newGroupName.slice(1))) {
        groupNumber++
        newGroupName = `new group ${groupNumber}`
      }

      const newColor = `${newGroupName}/${hex.replace("#", "")}${hex}`
      onUpdateColor(draggedIndex, toSwatch(newColor, draggedIndex))
    }

    setIsDragOverNewGroup(false)
    setDraggedIndex(null)
    setIsAnyCardDragging(false)
  }

  const handleDropOnTrash = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (draggedIndex !== null) {
      onColorEdit?.(-1)
      onRemoveColor(draggedIndex)
    }

    setIsDragOverTrash(false)
    setDraggedIndex(null)
    setIsAnyCardDragging(false)
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

  useEffect(() => {
    return () => {
      if (newGroupLeaveTimeoutRef.current) {
        clearTimeout(newGroupLeaveTimeoutRef.current)
      }
      if (trashLeaveTimeoutRef.current) {
        clearTimeout(trashLeaveTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="space-y-8 border-border p-6 relative border-2 rounded-md bg-background mx-0">
      <div className="pb-2 border-b-2">
        <h2 className="font-semibold text-2xl">{label}</h2>
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
            className="relative flex w-full items-end pb-8"
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
            <Button
              variant="outline"
              size="icon"
              className="h-[8.75rem] w-full cursor-pointer rounded-lg border border-dashed border-slate-300 bg-transparent"
              onClick={() => {
                const newColorName =
                  groupName === "Ungrouped"
                    ? lastInteractedColor
                    : groupName.toLowerCase() + "/new" + lastInteractedColor
                onAddColor(swatchFromLegacy(newColorName))
              }}
            >
              <Plus className="h-8 w-8 text-border" />
            </Button>
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
            onGroupReorderDragOver={(event) => handleGroupDragOver(event, groupName)}
            onGroupReorderDrop={(event) => handleGroupDrop(event, groupName)}
            onCardDragOver={(event) => handleDragOverGroup(event, groupName)}
            onCardDrop={handleDrop}
            header={header}
            addButton={addButton}
          >
            {groupColors.map((colorItem, idx) => {
              const actualIndex = colorItem.originalIndex
              const isDraggingCard = draggedIndex === actualIndex
              const isDropTarget = dragOverIndex === actualIndex

              return (
                <ColorCard
                  key={colorItem.hex + "-" + actualIndex}
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
        className={`flex justify-start relative transition-all duration-300 ease-in-out pl-10 ${
          isDragOverNewGroup ? "pt-8 pb-8" : "pt-4"
        }`}
        onDragOver={(e) => {
          e.preventDefault()
          if (isAnyCardDragging) {
            if (newGroupLeaveTimeoutRef.current) {
              clearTimeout(newGroupLeaveTimeoutRef.current)
              newGroupLeaveTimeoutRef.current = null
            }
            setIsDragOverNewGroup(true)
            setDragOverIndex(null)
            setDragMode(null)
            setInsertPosition(null)
          }
        }}
        onDragLeave={() => {
          if (newGroupLeaveTimeoutRef.current) {
            clearTimeout(newGroupLeaveTimeoutRef.current)
          }
          newGroupLeaveTimeoutRef.current = setTimeout(() => {
            setIsDragOverNewGroup(false)
            newGroupLeaveTimeoutRef.current = null
          }, 200)
        }}
        onDrop={handleDropOnNewGroup}
      >
        <div
          className={`transition-all duration-300 ease-in-out ${
            isDragOverNewGroup
              ? "w-72 h-44 border-2 border-dashed border-blue-500 bg-blue-50/50 rounded-lg opacity-100"
              : "w-auto h-auto opacity-100"
          }`}
        >
          {isDragOverNewGroup ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 transition-all duration-300 ease-in-out">
              <FolderPlus className="h-8 w-8 text-blue-600 transition-all duration-300 ease-in-out" />
              <span className="text-sm font-medium text-blue-600 transition-colors duration-300 ease-in-out">
                Drop to Create New Group
              </span>
            </div>
          ) : (
            <Button
              variant="outline"
              size="lg"
              className="gap-3 cursor-pointer bg-transparent transition-all duration-300 ease-in-out rounded-md font-semibold border text-sm"
              onClick={handleAddNewGroup}
            >
              <FolderPlus className="h-6 w-6 transition-all duration-300 ease-in-out border-0" />
              New Group
            </Button>
          )}
        </div>
      </div>

      {isAnyCardDragging && (
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
                  onColorEdit?.(-1)
                  onRemoveColor(deleteIndex)
                }
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
