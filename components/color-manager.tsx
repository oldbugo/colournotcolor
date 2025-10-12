"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Pencil, Trash2, Copy, FolderPlus, GripVertical, Lock } from "lucide-react"
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

type ColorWithName = {
  name: string
  hex: string
  originalIndex: number
}

type ColorManagerProps = {
  label: string
  colors: string[]
  onAddColor: (color: string) => void
  onRemoveColor: (index: number) => void
  onUpdateColor: (index: number, color: string) => void
  onReorderColors: (fromIndex: number, toIndex: number) => void
  onBatchUpdateColors: (colors: string[]) => void
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
    return baseName ? `${baseName}${hex}` : hex
  }

  return baseName ? `${newGroup}/${baseName}${hex}` : `${newGroup}/${hex.replace("#", "")}${hex}`
}

export function ColorManager({
  label,
  colors,
  onAddColor,
  onRemoveColor,
  onUpdateColor,
  onReorderColors,
  onBatchUpdateColors,
  onColorEdit,
  activeEditingIndex,
  lastInteractedColor = "#808080",
}: ColorManagerProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingName, setEditingName] = useState("")
  const [originalEditingName, setOriginalEditingName] = useState("")
  const [editingHexIndex, setEditingHexIndex] = useState<number | null>(null)
  const [editingHex, setEditingHex] = useState("")
  const [originalEditingHex, setOriginalEditingHex] = useState("")
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState("")
  const [originalGroupName, setOriginalGroupName] = useState("")
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
  const [indicatorPosition, setIndicatorPosition] = useState<{ left: number; top: number } | null>(null)
  const [justDropped, setJustDropped] = useState(false)
  const [droppedAtIndex, setDroppedAtIndex] = useState<number | null>(null)

  const nameInputRef = useRef<HTMLInputElement>(null)
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

          const indicatorHeight = 144
          const verticalOffset = (rect.height - indicatorHeight) / 2

          if (insertPosition === "before") {
            setIndicatorPosition({
              left: rect.left - containerRect.left - 8,
              top: rect.top - containerRect.top + verticalOffset,
            })
          } else {
            setIndicatorPosition({
              left: rect.right - containerRect.left + 8,
              top: rect.top - containerRect.top + verticalOffset,
            })
          }
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

    const parts = currentColor.split("#")
    const customName = parts.length > 1 ? parts[0] : ""

    setEditingIndex(index)
    setEditingName(customName)
    setOriginalEditingName(customName)
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
      const currentColor = colors[index]
      const parts = currentColor.split("#")
      const hex = parts.length > 1 ? parts[1] : parts[0].replace("#", "")
      const newColor = editingName.trim() ? `${editingName}#${hex}` : `#${hex}`
      onUpdateColor(index, newColor)
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

  const handleEditHex = (index: number, currentColor: string) => {
    const parts = currentColor.split("#")
    const hex = "#" + (parts.length > 1 ? parts[1] : parts[0].replace("#", ""))
    setEditingHexIndex(index)
    setEditingHex(hex)
    setOriginalEditingHex(hex)
  }

  const handleSaveHex = (index: number) => {
    if (editingHex !== originalEditingHex) {
      const currentColor = colors[index]
      const parts = currentColor.split("#")
      const customName = parts.length > 1 ? parts[0] : ""
      const newColor = customName ? `${customName}${editingHex}` : editingHex
      onUpdateColor(index, newColor)
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
    setOriginalGroupName(oldName)
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

      onBatchUpdateColors(updatedColors)
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
    setDraggedIndex(index)
    setIsAnyCardDragging(true)
    e.dataTransfer.effectAllowed = "move"

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
      const draggedHex = "#" + (draggedParts.length > 1 ? draggedParts[1] : draggedParts[0].replace("#", ""))

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

      onBatchUpdateColors(newColors)
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
      onBatchUpdateColors(newColors)
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

    onBatchUpdateColors(newColors)
    setDraggedGroup(null)
    setDragOverGroupName(null)
  }

  const handleGroupDragEnd = () => {
    setDraggedGroup(null)
    setDragOverGroupName(null)
  }

  const handleAddNewGroup = () => {
    let groupNumber = 1
    let newGroupName = "new group"

    while (groupedColors.has(newGroupName.charAt(0).toUpperCase() + newGroupName.slice(1))) {
      groupNumber++
      newGroupName = `new group ${groupNumber}`
    }

    const newColorName = lastInteractedColor.includes("/") ? lastInteractedColor : `Ungrouped/${lastInteractedColor}`
    onAddColor(newColorName)
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
      onUpdateColor(draggedIndex, newColor)
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

        return (
          <div
            key={groupName}
            className={`space-y-4 transition-all duration-200 ${isGroupDragging ? "opacity-50" : "opacity-100"} ${
              isNewlyCreated ? "animate-in fade-in-0 slide-in-from-top-4 duration-300" : ""
            } ${isRemoving ? "animate-out fade-out-0 slide-out-to-top-2 duration-200" : ""}`}
            onDragOver={(e) => handleGroupDragOver(e, groupName)}
            onDrop={(e) => handleGroupDrop(e, groupName)}
          >
            {isGroupDragOver && draggedGroup && <div className="h-1 bg-blue-500 rounded-full -mt-2 mb-2" />}

            <div className="flex items-center gap-2">
              <div
                draggable
                onDragStart={(e) => handleGroupDragStart(e, groupName)}
                onDragEnd={handleGroupDragEnd}
                className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded transition-colors flex items-center"
              >
                <GripVertical className="h-6 w-6 text-gray-300 stroke-[2.5]" />
              </div>

              {editingGroupName === groupName ? (
                <Input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onBlur={handleCancelGroupEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveGroupName(groupName)
                    if (e.key === "Escape") handleCancelGroupEdit()
                  }}
                  className={`${groupNameTextClass} h-auto py-1 px-2 border-2 border-input rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 w-auto`}
                  autoFocus
                />
              ) : (
                <>
                  <h3 className={`${groupNameTextClass} ${groupName === "Ungrouped" ? "text-gray-700" : ""}`}>
                    {groupName}
                  </h3>
                  {groupName === "Ungrouped" ? (
                    <Lock className="h-5 w-5 text-gray-700" />
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 cursor-pointer"
                      onClick={() => handleEditGroupName(groupName)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>

            <div
              className="flex flex-wrap relative mx-6 gap-0"
              onDragOver={(e) => handleDragOverGroup(e, groupName)}
              onDrop={handleDrop}
            >
              {indicatorPosition && dragMode === "insert" && dragOverGroup === groupName && (
                <div
                  className="absolute w-1 bg-blue-500 rounded-full pointer-events-none z-30"
                  style={{
                    left: `${indicatorPosition.left}px`,
                    top: `${indicatorPosition.top}px`,
                    height: "144px",
                  }}
                />
              )}

              {groupColors.map((colorItem, idx) => {
                const actualIndex = colorItem.originalIndex
                const isDragging = draggedIndex === actualIndex
                const isDropTarget = dragOverIndex === actualIndex
                const wasJustDropped = justDropped && droppedAtIndex === actualIndex
                const hasError = nameError === actualIndex

                return (
                  <div
                    key={`${colorItem.hex}-${actualIndex}`}
                    ref={(el) => {
                      if (el) {
                        cardRefs.current.set(actualIndex, el)
                      } else {
                        cardRefs.current.delete(actualIndex)
                      }
                    }}
                    className={`relative p-4 space-y-1 py-0 px-2 w-64 mx-2 my-2 ${
                      wasJustDropped ? "animate-in zoom-in-95 duration-500" : "transition-all duration-300 ease-in-out"
                    }`}
                    style={{
                      opacity: isDragging ? 0.5 : 1,
                      transform: isDragging ? "scale(0.95)" : "scale(1)",
                    }}
                    onDragOver={(e) => handleDragOver(e, actualIndex)}
                    onDragLeave={handleDragLeave}
                    data-color-card
                    onClick={(e) => handleCardClick(actualIndex, e)}
                  >
                    {idx > 0 && (
                      <div
                        className="absolute -left-4 top-0 w-4 h-full z-10"
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (draggedIndex !== null && draggedIndex !== actualIndex) {
                            setDragMode("insert")
                            setInsertPosition("before")
                            setDragOverIndex(actualIndex)
                            setDragOverGroup(groupName)
                          }
                        }}
                        onDragLeave={(e) => {
                          const relatedTarget = e.relatedTarget as HTMLElement
                          if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
                            setDragOverIndex(null)
                            setDragMode(null)
                            setInsertPosition(null)
                          }
                        }}
                      />
                    )}

                    {idx < groupColors.length - 1 && (
                      <div
                        className="absolute -right-4 top-0 w-4 h-full z-10"
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (draggedIndex !== null && draggedIndex !== actualIndex) {
                            setDragMode("insert")
                            setInsertPosition("after")
                            setDragOverIndex(actualIndex)
                            setDragOverGroup(groupName)
                          }
                        }}
                        onDragLeave={(e) => {
                          const relatedTarget = e.relatedTarget as HTMLElement
                          if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
                            setDragOverIndex(null)
                            setDragMode(null)
                            setInsertPosition(null)
                          }
                        }}
                      />
                    )}

                    {isDropTarget && dragMode === "swap" && (
                      <div className="absolute -inset-1 bg-blue-500/10 rounded-lg border-2 border-blue-500 border-dashed pointer-events-none z-20" />
                    )}

                    {hoveredHandleIndex === actualIndex && (
                      <div className="absolute -inset-1 bg-gray-400/20 rounded-lg pointer-events-none z-10" />
                    )}

                    {activeEditingIndex === actualIndex && (
                      <div className="absolute -inset-1 border-2 border-dashed border-gray-400 rounded-lg pointer-events-none z-20" />
                    )}

                    <div className="flex items-center gap-2 px-2">
                      {editingIndex === actualIndex ? (
                        <div className="relative flex-1">
                          <Input
                            ref={nameInputRef}
                            value={editingName}
                            onChange={(e) => handleNameChange(e.target.value, actualIndex)}
                            onBlur={handleCancelNameEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveName(actualIndex)
                              if (e.key === "Escape") handleCancelNameEdit()
                            }}
                            className={`h-auto py-1 px-2 text-sm border-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 ${hasError ? "border-red-500 focus-visible:ring-red-500" : "border-input"}`}
                            autoFocus
                            placeholder="Custom name"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {hasError && (
                            <div className="absolute left-0 -top-10 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-50">
                              Only one "/" is allowed in custom names
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <span
                            className="text-sm font-medium flex-1 truncate cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleClickName(actualIndex, colors[actualIndex])
                            }}
                          >
                            {colorItem.name}
                          </span>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0 cursor-pointer flex items-center justify-center"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditName(actualIndex, colors[actualIndex], "button")
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0 cursor-pointer flex items-center justify-center"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteIndex(actualIndex)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="space-y-0 overflow-hidden border-2 border-border rounded-md">
                      <div
                        className="w-full h-24 cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: colorItem.hex }}
                        onClick={() => onColorEdit?.(actualIndex)}
                      />
                      <div className="bg-white p-2 flex items-center justify-center gap-2 border-border border-t-2">
                        {editingHexIndex === actualIndex ? (
                          <Input
                            value={editingHex}
                            onChange={(e) => setEditingHex(e.target.value)}
                            onBlur={handleCancelHexEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveHex(actualIndex)
                              if (e.key === "Escape") handleCancelHexEdit()
                              e.stopPropagation()
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-8 text-center font-mono text-xs"
                            autoFocus
                          />
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditHex(actualIndex, colors[actualIndex])
                              }}
                              className="hover:text-blue-600 transition-colors cursor-pointer font-mono font-light text-xl tracking-wider"
                            >
                              {colorItem.hex}
                            </button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 flex-shrink-0 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopyHex(colorItem.hex, actualIndex)
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            {copiedIndex === actualIndex && (
                              <span className="text-xs text-green-600 font-medium">Copied!</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, actualIndex)}
                      onDragEnd={handleDragEnd}
                      onMouseEnter={() => setHoveredHandleIndex(actualIndex)}
                      onMouseLeave={() => setHoveredHandleIndex(null)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex flex-col items-center justify-center gap-1 cursor-grab active:cursor-grabbing h-9 mx-8 pb-2"
                    >
                      <div className="h-0.5 w-8 rounded-full bg-foreground/40" />
                      <div className="h-0.5 w-8 rounded-full bg-foreground/40" />
                    </div>
                  </div>
                )
              })}

              <div
                className="flex items-end relative pb-12 pl-4"
                onDragOver={(e) => {
                  e.preventDefault()
                  if (draggedIndex !== null && groupColors.length > 0) {
                    setDragMode("insert")
                    setInsertPosition("after")
                    setDragOverIndex(groupColors[groupColors.length - 1].originalIndex)
                    setDragOverGroup(groupName)
                  }
                }}
                onDragLeave={(e) => {
                  const relatedTarget = e.relatedTarget as HTMLElement
                  if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
                    setDragOverIndex(null)
                    setDragMode(null)
                    setInsertPosition(null)
                  }
                }}
              >
                <Button
                  variant="outline"
                  size="icon"
                  className="bg-transparent cursor-pointer h-36 border-2 rounded-md w-[236px]"
                  onClick={() => {
                    const newColorName =
                      groupName === "Ungrouped"
                        ? lastInteractedColor
                        : `${groupName.toLowerCase()}/new${lastInteractedColor}`
                    onAddColor(newColorName)
                  }}
                >
                  <Plus className="h-8 w-8 text-border" />
                </Button>
              </div>
            </div>
          </div>
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
