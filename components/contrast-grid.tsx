"use client"

import React from "react"
import { useState, useRef, useEffect, useMemo, useCallback } from "react"
import { ChevronDown, Plus, Settings, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"

import {
  calculateContrast,
  getWCAGLevel,
  extractHexFromColor,
  extractCustomName,
  type ContrastThresholds,
} from "@/lib/contrast-utils"
import type { ColorSwatch } from "@/types/palette"
import type { EditingColor } from "@/app/page"
import { composeLabel, swatchToLegacy } from "@/lib/color-utils"
import { CARD_CONTROL_RADII } from "@/lib/design-tokens"

const CARD_SIZE = 132 // px
const GAP_SIZE = 16 // px (gap-4)
const ANIMATION_DURATION = 0.25 // seconds - faster animation
const CARD_WITH_GAP = CARD_SIZE + GAP_SIZE // 148px
const BORDER_GAP = 8 // px - gap for borders (-inset-2 = 8px)
const UNGROUPED_LABEL = "Ungrouped"
const DIGITS_ONLY_PATTERN = /^\d+$/
const NUMBER_FILTER_STORAGE_KEY = "contrast-grid-number-filters-v1"
const FILTER_STEP_VALUES = [1, 10, 100, 1000] as const
const FILTER_STEP_MAX_INDEX = FILTER_STEP_VALUES.length - 1

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const extractNumericValue = (swatch: ColorSwatch): number | null => {
  const candidateName = swatch.name?.trim()
  if (candidateName && DIGITS_ONLY_PATTERN.test(candidateName)) {
    return Number(candidateName)
  }
  const isUngrouped = !swatch.group?.trim()
  const hexDigits = swatch.hex.replace("#", "")
  if (hexDigits && DIGITS_ONLY_PATTERN.test(hexDigits)) {
    if (isUngrouped && hexDigits.length === 6) {
      return null
    }
    return Number(hexDigits)
  }
  return null
}

type ContrastRequirementOption = {
  id: "non-text" | "large-text" | "normal-text"
  label: string
  shortLabel: string
  description: string
  thresholds: ContrastThresholds
}

const CONTRAST_REQUIREMENT_OPTIONS: ContrastRequirementOption[] = [
  {
    id: "non-text",
    label: "Non-text contrast",
    shortLabel: "Non-text",
    description: "UI components or graphic objects that only need to meet a 3:1 requirement.",
    thresholds: { aa: 3 },
  },
  {
    id: "large-text",
    label: "Large text",
    shortLabel: "Large text",
    description: "Text ≥ 24px or ≥ 19px bold needs 3:1 for AA and 4.5:1 for AAA.",
    thresholds: { aa: 3, aaa: 4.5 },
  },
  {
    id: "normal-text",
    label: "Normal text",
    shortLabel: "Body text",
    description: "Standard body copy where AA is 4.5:1 and AAA is 7:1.",
    thresholds: { aa: 4.5, aaa: 7 },
  },
]

const CONTRAST_SLIDER_MAX = CONTRAST_REQUIREMENT_OPTIONS.length - 1

const formatThresholdLabel = (value: number) => (Number.isInteger(value) ? `${value.toFixed(0)}:1` : `${value.toFixed(1)}:1`)

type ColorEntry = {
  id: string
  legacy: string
  label: string
  baseIndex: number
  groupKey: string
  groupLabel: string
  numericValue: number | null
}

type GroupedColorEntry = {
  key: string
  label: string
  entries: ColorEntry[]
}

type NumberRange = {
  min: number
  max: number
}

type StoredNumberFilterState = {
  rows: NumberRange | null
  columns: NumberRange | null
}

const readNumberFilterStorage = (): Record<string, StoredNumberFilterState> => {
  if (typeof window === "undefined") {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(NUMBER_FILTER_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, StoredNumberFilterState>) : {}
  } catch {
    return {}
  }
}

const writeNumberFilterStorage = (value: Record<string, StoredNumberFilterState>) => {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(NUMBER_FILTER_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // ignore
  }
}

type ContrastGridProps = {
  paletteId: string
  colors: ColorSwatch[]
  onReorderColors: (fromIndex: number, toIndex: number) => void
  onSwapColors: (fromIndex: number, toIndex: number) => void
  onColorEdit?: (index: number) => void
  editingColor?: EditingColor
  onAddColor?: () => void
  onRemoveColor?: (index: number) => void
}

export function ContrastGrid({
  paletteId,
  colors,
  onReorderColors,
  onSwapColors,
  onColorEdit,
  editingColor,
  onAddColor,
  onRemoveColor,
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
  const [rowFilterIds, setRowFilterIds] = useState<Set<string> | null>(null)
  const [columnFilterIds, setColumnFilterIds] = useState<Set<string> | null>(null)
  const [rowNumberFilter, setRowNumberFilter] = useState<NumberRange | null>(null)
  const [columnNumberFilter, setColumnNumberFilter] = useState<NumberRange | null>(null)
  const [rowNumberInputs, setRowNumberInputs] = useState<{ min: string; max: string }>({ min: "", max: "" })
  const [columnNumberInputs, setColumnNumberInputs] = useState<{ min: string; max: string }>({ min: "", max: "" })
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(() => new Set())
  const [isRowFilterMenuOpen, setIsRowFilterMenuOpen] = useState(false)
  const [isColumnFilterMenuOpen, setIsColumnFilterMenuOpen] = useState(false)
  const [isFilterOptionsMenuOpen, setIsFilterOptionsMenuOpen] = useState(false)
  const [filterStepIndex, setFilterStepIndex] = useState(1)


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
  const rowFilterTriggerRef = useRef<HTMLButtonElement | null>(null)
  const columnFilterTriggerRef = useRef<HTMLButtonElement | null>(null)
  const filterOptionsTriggerRef = useRef<HTMLButtonElement | null>(null)
  const numberFilterStep = FILTER_STEP_VALUES[filterStepIndex] ?? FILTER_STEP_VALUES[0]

  const handleFilterStepSliderChange = useCallback((values: number[]) => {
    const rawValue = values[0]
    if (typeof rawValue !== "number") {
      return
    }
    const clamped = Math.min(FILTER_STEP_MAX_INDEX, Math.max(0, Math.round(rawValue)))
    setFilterStepIndex(clamped)
  }, [])

  const [fgOverlayStyle, setFgOverlayStyle] = useState<React.CSSProperties | null>(null)
  const [bgOverlayStyle, setBgOverlayStyle] = useState<React.CSSProperties | null>(null)

  const [fgSwapHighlightStyle, setFgSwapHighlightStyle] = useState<React.CSSProperties | null>(null)
  const [bgSwapHighlightStyle, setBgSwapHighlightStyle] = useState<React.CSSProperties | null>(null)

  const [requirementIndex, setRequirementIndex] = useState(CONTRAST_SLIDER_MAX)
  const activeRequirement = CONTRAST_REQUIREMENT_OPTIONS[requirementIndex]
  const hasAAARequirement = typeof activeRequirement.thresholds.aaa === "number"
  const [isRequirementMenuOpen, setIsRequirementMenuOpen] = useState(false)

const colorEntries = useMemo<ColorEntry[]>(
    () =>
      colors.map((swatch, index) => {
        const groupLabel = swatch.group?.trim() || UNGROUPED_LABEL
        const groupKey = swatch.group?.trim().toLowerCase() || "__ungrouped__"
        const numericValue = extractNumericValue(swatch)
        return {
          id: swatch.id,
          legacy: swatchToLegacy(swatch),
          label: composeLabel(swatch.name, swatch.group, swatch.hex) || swatch.hex,
          baseIndex: index,
          groupKey,
          groupLabel,
          numericValue,
        }
      }),
    [colors],
  )

  const allColorIds = useMemo(() => colorEntries.map((entry) => entry.id), [colorEntries])
  const allColorIdSet = useMemo(() => new Set(allColorIds), [allColorIds])

  const groupedColorEntries = useMemo<GroupedColorEntry[]>(() => {
    const groups = new Map<string, GroupedColorEntry>()
    colorEntries.forEach((entry) => {
      if (!groups.has(entry.groupKey)) {
        groups.set(entry.groupKey, {
          key: entry.groupKey,
          label: entry.groupLabel,
          entries: [],
        })
      }
      groups.get(entry.groupKey)!.entries.push(entry)
    })
    return Array.from(groups.values())
  }, [colorEntries])

  useEffect(() => {
    setCollapsedGroupKeys(new Set(groupedColorEntries.map((group) => group.key)))
  }, [groupedColorEntries])

  useEffect(() => {
    const stored = readNumberFilterStorage()[paletteId]
    setRowNumberFilter(stored?.rows ?? null)
    setColumnNumberFilter(stored?.columns ?? null)
  }, [paletteId])

  const effectiveRowFilterIds = useMemo(() => {
    if (!rowFilterIds) return null
    const filtered = [...rowFilterIds].filter((id) => allColorIdSet.has(id))
    if (filtered.length === allColorIds.length) {
      return null
    }
    return new Set(filtered)
  }, [allColorIds.length, allColorIdSet, rowFilterIds])

  const effectiveColumnFilterIds = useMemo(() => {
    if (!columnFilterIds) return null
    const filtered = [...columnFilterIds].filter((id) => allColorIdSet.has(id))
    if (filtered.length === allColorIds.length) {
      return null
    }
    return new Set(filtered)
  }, [allColorIds.length, allColorIdSet, columnFilterIds])

  const numericBounds = useMemo(() => {
    const values = colorEntries
      .map((entry) => entry.numericValue)
      .filter((value): value is number => typeof value === "number")
    if (values.length === 0) {
      return null
    }
    return {
      min: 0,
      max: Math.max(...values),
    }
  }, [colorEntries])

  const clampRangeToBounds = useCallback(
    (range: NumberRange | null): NumberRange | null => {
      if (!range || !numericBounds) {
        return numericBounds ? { ...numericBounds } : null
      }
      const min = clamp(range.min, numericBounds.min, numericBounds.max)
      const max = clamp(range.max, numericBounds.min, numericBounds.max)
      const normalizedMin = Math.min(min, max)
      const normalizedMax = Math.max(min, max)
      return { min: normalizedMin, max: normalizedMax }
    },
    [numericBounds],
  )

  useEffect(() => {
    if (!numericBounds) {
      setRowNumberFilter(null)
      setColumnNumberFilter(null)
      return
    }
    setRowNumberFilter((current) => clampRangeToBounds(current))
    setColumnNumberFilter((current) => clampRangeToBounds(current))
  }, [clampRangeToBounds, numericBounds])

  useEffect(() => {
    if (!rowNumberFilter) {
      setRowNumberInputs({ min: "", max: "" })
      return
    }
    setRowNumberInputs({
      min: rowNumberFilter.min.toString(),
      max: rowNumberFilter.max.toString(),
    })
  }, [rowNumberFilter])

  useEffect(() => {
    if (!columnNumberFilter) {
      setColumnNumberInputs({ min: "", max: "" })
      return
    }
    setColumnNumberInputs({
      min: columnNumberFilter.min.toString(),
      max: columnNumberFilter.max.toString(),
    })
  }, [columnNumberFilter])

  useEffect(() => {
    const existing = readNumberFilterStorage()
    existing[paletteId] = { rows: rowNumberFilter, columns: columnNumberFilter }
    writeNumberFilterStorage(existing)
  }, [paletteId, rowNumberFilter, columnNumberFilter])

  const passesNumberFilter = useCallback(
    (entry: ColorEntry, filter: NumberRange | null) => {
      if (!filter || !numericBounds) {
        return true
      }
      if (entry.numericValue == null) {
        return true
      }
      return entry.numericValue >= filter.min && entry.numericValue <= filter.max
    },
    [numericBounds],
  )

  const rowEntries = useMemo(() => {
    const subset = effectiveRowFilterIds ? colorEntries.filter((entry) => effectiveRowFilterIds.has(entry.id)) : colorEntries
    return subset.filter((entry) => passesNumberFilter(entry, rowNumberFilter))
  }, [colorEntries, effectiveRowFilterIds, passesNumberFilter, rowNumberFilter])
  const columnEntries = useMemo(() => {
    const subset = effectiveColumnFilterIds
      ? colorEntries.filter((entry) => effectiveColumnFilterIds.has(entry.id))
      : colorEntries
    return subset.filter((entry) => passesNumberFilter(entry, columnNumberFilter))
  }, [colorEntries, effectiveColumnFilterIds, passesNumberFilter, columnNumberFilter])

  const foregroundColors = columnEntries.map((entry) => entry.legacy)
  const backgroundColors = rowEntries.map((entry) => entry.legacy)
  const foregroundBaseIndexes = columnEntries.map((entry) => entry.baseIndex)
  const backgroundBaseIndexes = rowEntries.map((entry) => entry.baseIndex)

  const editingRowIndex =
    editingColor && typeof editingColor.index === "number"
      ? backgroundBaseIndexes.indexOf(editingColor.index)
      : -1
  const editingColumnIndex =
    editingColor && typeof editingColor.index === "number"
      ? foregroundBaseIndexes.indexOf(editingColor.index)
      : -1

  const totalColorCount = colorEntries.length

  const adjustFilterSet = useCallback(
    (current: Set<string> | null, ids: string[]): Set<string> | null => {
      if (allColorIds.length === 0) {
        return null
      }
      if (ids.length === 0) {
        return current
      }
      const base = current
        ? new Set(allColorIds.filter((id) => current.has(id)))
        : new Set(allColorIds)
      const shouldDeselect = ids.every((id) => base.has(id))
      const next = new Set(base)
      ids.forEach((id) => {
        if (!allColorIdSet.has(id)) {
          return
        }
        if (shouldDeselect) {
          next.delete(id)
        } else {
          next.add(id)
        }
      })
      if (next.size === allColorIds.length) {
        return null
      }
      return next
    },
    [allColorIdSet, allColorIds],
  )

  const describeFilter = (filter: Set<string> | null) => {
    if (totalColorCount === 0) return "No colors"
    if (!filter) return "All colors"
    if (filter.size === 0) return "None"
    return `${filter.size} selected`
  }

  const rowFilterSummary = describeFilter(effectiveRowFilterIds)
  const columnFilterSummary = describeFilter(effectiveColumnFilterIds)

  const toggleRowFilterValue = (id: string) => {
    setRowFilterIds((current) => adjustFilterSet(current, [id]))
  }

  const toggleColumnFilterValue = (id: string) => {
    setColumnFilterIds((current) => adjustFilterSet(current, [id]))
  }

  const toggleRowGroupValue = (ids: string[]) => {
    setRowFilterIds((current) => adjustFilterSet(current, ids))
  }

  const toggleColumnGroupValue = (ids: string[]) => {
    setColumnFilterIds((current) => adjustFilterSet(current, ids))
  }

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const collapseAllGroups = () => {
    setCollapsedGroupKeys(new Set(groupedColorEntries.map((group) => group.key)))
  }

  const expandAllGroups = () => {
    setCollapsedGroupKeys(new Set())
  }

  const selectAllRows = () => setRowFilterIds(null)
  const selectAllColumns = () => setColumnFilterIds(null)
  const clearAllRows = () => setRowFilterIds(new Set())
  const clearAllColumns = () => setColumnFilterIds(new Set())

const renderFilterGroups = (
  effectiveSet: Set<string> | null,
  toggleSingle: (id: string) => void,
  toggleGroup: (ids: string[]) => void,
  collapsedSet: Set<string>,
  onToggleCollapse: (key: string) => void,
) => {
  if (groupedColorEntries.length === 0) {
    return <div className="px-2 py-1 text-xs text-muted-foreground">No colors available</div>
  }
  return (
    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {groupedColorEntries.map((group) => {
        const groupIds = group.entries.map((entry) => entry.id)
        const selectedCount = effectiveSet
          ? groupIds.filter((id) => effectiveSet.has(id)).length
          : group.entries.length
        const isFullySelected = selectedCount === group.entries.length && group.entries.length > 0
        const isPartiallySelected = selectedCount > 0 && selectedCount < group.entries.length
        const indicatorClass = isFullySelected
          ? "bg-primary border-primary"
          : isPartiallySelected
            ? "bg-primary/60 border-primary/80"
            : "border-muted-foreground/40"
        const isCollapsed = collapsedSet.has(group.key)

        return (
          <div key={group.key} className="rounded-md border border-border/40 bg-muted/5 p-2">
            <div
              role="button"
              tabIndex={0}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onToggleCollapse(group.key)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onToggleCollapse(group.key)
                }
              }}
            >
              <span className="flex items-center gap-2 truncate">
                <span className="text-base leading-none">{isCollapsed ? "+" : "\u2212"}</span>
                <span className="truncate">{group.label}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {selectedCount}/{group.entries.length}
                <button
                  type="button"
                  className={`h-3.5 w-3.5 rounded-sm border transition-colors ${indicatorClass}`}
                  aria-label={isFullySelected ? "Deselect group" : "Select group"}
                  aria-pressed={isFullySelected ? true : isPartiallySelected ? "mixed" : false}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    toggleGroup(groupIds)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      toggleGroup(groupIds)
                    }
                  }}
                />
              </span>
            </div>
            {!isCollapsed && (
              <div className="mt-1 space-y-1">
                {group.entries.map((entry) => {
                  const isSelected = effectiveSet ? effectiveSet.has(entry.id) : true
                  const labelParts = entry.label.split("/")
                  const displayLabel = labelParts[labelParts.length - 1]?.trim() || entry.label
                  const hexColor = extractHexFromColor(entry.legacy)
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-sm ${
                        isSelected ? "text-foreground" : "text-muted-foreground"
                      } hover:bg-muted/30`}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        toggleSingle(entry.id)
                      }}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className="h-3 w-5 rounded-[3px] border border-border/60"
                          style={{ backgroundColor: hexColor }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{displayLabel}</span>
                      </span>
                      <span
                        className={`h-3 w-3 rounded-full border ${
                          isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
  useEffect(() => {
    return () => {
      if (trashLeaveTimeoutRef.current) {
        clearTimeout(trashLeaveTimeoutRef.current)
        trashLeaveTimeoutRef.current = null
      }
    }
  }, [])

const renderNumberFilterSection = (
  label: string,
  filter: NumberRange | null,
  setFilter: React.Dispatch<React.SetStateAction<NumberRange | null>>,
  inputValues: { min: string; max: string },
  setInputValues: React.Dispatch<React.SetStateAction<{ min: string; max: string }>>,
) => {
  const normalizedRange = clampRangeToBounds(filter) ?? (numericBounds ? { ...numericBounds } : null)
  if (!numericBounds || !normalizedRange) {
    return (
      <div className="rounded-md border border-dashed border-muted-foreground/40 px-3 py-2 text-xs text-muted-foreground">
        Add numeric names (e.g., &ldquo;Red/100&rdquo;) to unlock range filtering.
        </div>
      )
    }

    const sliderValues: [number, number] = [normalizedRange.min, normalizedRange.max]

    const handleInputChange = (field: "min" | "max", value: string) => {
      setInputValues((prev) => ({ ...prev, [field]: value }))
    }

    const commitInputValue = (field: "min" | "max") => {
      const rawValue = inputValues[field]
      const fallback = field === "min" ? sliderValues[0] : sliderValues[1]
      if (!rawValue.trim()) {
        setInputValues((prev) => ({
          ...prev,
          [field]: fallback.toString(),
        }))
        return
      }
      const parsed = Number(rawValue)
      if (Number.isNaN(parsed)) {
        setInputValues((prev) => ({
          ...prev,
          [field]: fallback.toString(),
        }))
        return
      }
      if (field === "min") {
        const bounded = clamp(parsed, numericBounds.min, numericBounds.max)
        const nextMin = Math.min(bounded, sliderValues[1])
        const nextRange = clampRangeToBounds({ min: nextMin, max: sliderValues[1] })
        if (nextRange) {
          setFilter(nextRange)
        }
      } else {
        const bounded = clamp(parsed, numericBounds.min, numericBounds.max)
        const nextMax = Math.max(bounded, sliderValues[0])
        const nextRange = clampRangeToBounds({ min: sliderValues[0], max: nextMax })
        if (nextRange) {
          setFilter(nextRange)
        }
      }
    }

    return (
      <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{label}</span>
          <button
            type="button"
            className="text-foreground underline-offset-2 hover:underline"
            onClick={() => {
              const defaults = clampRangeToBounds({ ...numericBounds })
              if (defaults) {
                setFilter(defaults)
              }
            }}
          >
            Reset
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-xs font-medium text-muted-foreground">Min</label>
          <Input
            type="number"
            inputMode="numeric"
            value={inputValues.min}
            onChange={(event) => handleInputChange("min", event.currentTarget.value)}
            onBlur={() => commitInputValue("min")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitInputValue("min")
              }
            }}
            className="h-8"
          />
          <label className="text-xs font-medium text-muted-foreground">Max</label>
          <Input
            type="number"
            inputMode="numeric"
            value={inputValues.max}
            onChange={(event) => handleInputChange("max", event.currentTarget.value)}
            onBlur={() => commitInputValue("max")}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitInputValue("max")
              }
            }}
            className="h-8"
          />
        </div>
        <div className="px-1">
          <Slider
            min={numericBounds.min}
            max={numericBounds.max}
            step={numberFilterStep}
            value={sliderValues}
            onValueChange={(values) => {
              if (values.length < 2) return
              const nextRange = clampRangeToBounds({ min: values[0], max: values[1] })
              if (nextRange) {
                setFilter(nextRange)
              }
            }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{sliderValues[0]}</span>
          <span>{sliderValues[1]}</span>
        </div>
      </div>
    )
  }

  useEffect(() => {
    if (hoveredFgIndex !== null && gridRef.current) {
      const header = fgHeaderRefs.current.get(hoveredFgIndex)
      if (header) {
        const headerRect = header.getBoundingClientRect()
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
    } else if (fgDragMode === "insert") {
      let targetIndex = dragOverFgIndex
      if (fgInsertPosition === "after") {
        targetIndex++
      }
      if (draggedFgIndex < targetIndex) {
        targetIndex--
      }
      const insertBeforeBase =
        targetIndex >= foregroundBaseIndexes.length ? colors.length : foregroundBaseIndexes[targetIndex]
      if (typeof insertBeforeBase !== "number") {
        handleFgDragEnd()
        return
      }
      let insertionIndex = insertBeforeBase
      if (insertionIndex > fromBaseIndex) {
        insertionIndex -= 1
      }
      setFgAnimationState({
        draggedIndex: draggedFgIndex,
        targetIndex,
      })
      onReorderColors(fromBaseIndex, insertionIndex)
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

    if (bgDragMode === "swap") {
      const fromBaseIndex = backgroundBaseIndexes[draggedBgIndex]
      const targetBaseIndex = backgroundBaseIndexes[dragOverBgIndex]
      if (typeof fromBaseIndex !== "number" || typeof targetBaseIndex !== "number") {
        handleBgDragEnd()
        return
      }
      onSwapColors(fromBaseIndex, targetBaseIndex)
    } else if (bgDragMode === "insert") {
      let targetIndex = dragOverBgIndex
      if (bgInsertPosition === "after") {
        targetIndex++
      }
      if (draggedBgIndex < targetIndex) {
        targetIndex--
      }
      const fromBaseIndex = backgroundBaseIndexes[draggedBgIndex]
      const insertBeforeBase =
        targetIndex >= backgroundBaseIndexes.length ? colors.length : backgroundBaseIndexes[targetIndex]
      if (typeof fromBaseIndex !== "number" || typeof insertBeforeBase !== "number") {
        handleBgDragEnd()
        return
      }
      let insertionIndex = insertBeforeBase
      if (insertionIndex > fromBaseIndex) {
        insertionIndex -= 1
      }
      setBgAnimationState({
        draggedIndex: draggedBgIndex,
        targetIndex,
      })
      onReorderColors(fromBaseIndex, insertionIndex)
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

    setIsDragOverTrash(false)
    setDraggedFgIndex(null)
    setDraggedBgIndex(null)
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
    <div className="bg-background overflow-visible rounded-md p-4">
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
        :global(.contrast-scroll-area) {
          scrollbar-width: thick;
          scrollbar-color: rgba(79, 79, 79, 0.7) rgba(0, 0, 0, 0.12);
        }
        :global(.contrast-scroll-area::-webkit-scrollbar) {
          width: 16px;
          height: 16px;
        }
        :global(.contrast-scroll-area::-webkit-scrollbar-track) {
          background-color: rgba(0, 0, 0, 0.12);
          border-radius: 999px;
        }
        :global(.contrast-scroll-area::-webkit-scrollbar-thumb) {
          background-color: rgba(79, 79, 79, 0.7);
          border-radius: 999px;
          border: 4px solid rgba(0, 0, 0, 0);
          background-clip: content-box;
        }
        :global(.contrast-scroll-area:hover::-webkit-scrollbar-thumb) {
          background-color: rgba(55, 55, 55, 0.85);
        }
      `}</style>

      <div className="mb-6 flex flex-wrap gap-4">
        <div className="space-y-2 min-w-[220px]">
          <DropdownMenu open={isRequirementMenuOpen} onOpenChange={setIsRequirementMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-expanded={isRequirementMenuOpen}
                className={`inline-flex max-w-full flex-col border border-border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isRequirementMenuOpen ? "border-primary/60 bg-primary/5 shadow-sm" : "bg-muted/20 hover:border-primary/40"
                }`}
                style={{
                  borderRadius: isRequirementMenuOpen ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col text-left">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Requirement focus</span>
                    <span className="text-base font-bold leading-tight text-foreground">{activeRequirement.label}</span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      isRequirementMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={8}
              className="w-[320px] space-y-4 border border-border bg-background/95 p-4 text-foreground shadow-lg backdrop-blur"
              style={{ borderRadius: CARD_CONTROL_RADII.elevated }}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requirement focus</p>
                <p className="text-base font-semibold text-foreground">{activeRequirement.label}</p>
                <p className="text-xs text-muted-foreground">{activeRequirement.description}</p>
                <p className="text-xs text-muted-foreground">
                  AA must reach {formatThresholdLabel(activeRequirement.thresholds.aa)}
                  {hasAAARequirement && (
                    <>
                      {" "}
                      and AAA {formatThresholdLabel(activeRequirement.thresholds.aaa!)}
                    </>
                  )}
                  .
                </p>
              </div>
              <div className="text-xs font-medium text-muted-foreground">
                AA ≥ {formatThresholdLabel(activeRequirement.thresholds.aa)}
                {hasAAARequirement && (
                  <>
                    {" "}
                    • AAA ≥ {formatThresholdLabel(activeRequirement.thresholds.aaa!)}
                  </>
                )}
              </div>
              <div>
                <input
                  type="range"
                  min={0}
                  max={CONTRAST_SLIDER_MAX}
                  step={1}
                  value={requirementIndex}
                  aria-label="Set contrast requirement focus"
                  aria-valuetext={`${activeRequirement.label} requirement`}
                  onChange={(event) => setRequirementIndex(Number(event.currentTarget.value))}
                className="w-full accent-foreground cursor-pointer transition-[transform,filter] duration-200 focus:brightness-110 active:brightness-125 active:scale-[1.01]"
              />
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-xs font-medium text-muted-foreground">
                {CONTRAST_REQUIREMENT_OPTIONS.map((option, index) => {
                  const isActive = index === requirementIndex
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setRequirementIndex(index)
                        setIsRequirementMenuOpen(false)
                      }}
                      className={`rounded-full px-3 py-1 transition-all duration-150 ${
                        isActive ? "bg-foreground text-background shadow-sm" : "bg-transparent"
                      }`}
                    >
                      {option.shortLabel}
                    </button>
                  )
                })}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex w-full flex-wrap items-start gap-2 justify-start md:w-auto md:ml-auto md:justify-end">
          <DropdownMenu
            open={isRowFilterMenuOpen}
            onOpenChange={(open) => {
              setIsRowFilterMenuOpen(open)
              if (!open && rowFilterTriggerRef.current) {
                rowFilterTriggerRef.current.blur()
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                ref={rowFilterTriggerRef}
                type="button"
                variant="outline"
                size="sm"
                disabled={colorEntries.length === 0}
                className={`flex items-center gap-2 border border-border px-3 py-1 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isRowFilterMenuOpen ? "border-primary/60 bg-primary/5 text-primary shadow-sm" : "bg-muted/20 text-foreground hover:border-primary/40"
                }`}
                style={{
                  borderRadius: isRowFilterMenuOpen ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                }}
              >
                Rows: {rowFilterSummary}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isRowFilterMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-[420px] space-y-3 max-h-[70vh] overflow-y-auto">
              {renderNumberFilterSection("Row Number Range", rowNumberFilter, setRowNumberFilter, rowNumberInputs, setRowNumberInputs)}
              <div className="flex items-center justify-end gap-2 pr-2 text-[11px] font-medium text-muted-foreground">
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={(event) => {
                    event.preventDefault()
                    collapseAllGroups()
                  }}
                >
                  Collapse all
                </button>
                <span className="text-muted-foreground/50">|</span>
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={(event) => {
                    event.preventDefault()
                    expandAllGroups()
                  }}
                >
                  Expand all
                </button>
              </div>
              <div className="h-px bg-border/40" />
              {renderFilterGroups(
                effectiveRowFilterIds,
                toggleRowFilterValue,
                toggleRowGroupValue,
                collapsedGroupKeys,
                toggleGroupCollapse,
              )}
              <div className="flex gap-2">
                <ConfirmActionButton variant="clear" description="This will clear every row from your selection." onConfirm={clearAllRows} />
                <ConfirmActionButton variant="select" description="This will add every row back into your selection." onConfirm={selectAllRows} />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu
            open={isColumnFilterMenuOpen}
            onOpenChange={(open) => {
              setIsColumnFilterMenuOpen(open)
              if (!open && columnFilterTriggerRef.current) {
                columnFilterTriggerRef.current.blur()
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                ref={columnFilterTriggerRef}
                type="button"
                variant="outline"
                size="sm"
                disabled={colorEntries.length === 0}
                className={`flex items-center gap-2 border border-border px-3 py-1 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isColumnFilterMenuOpen ? "border-primary/60 bg-primary/5 text-primary shadow-sm" : "bg-muted/20 text-foreground hover:border-primary/40"
                }`}
                style={{
                  borderRadius: isColumnFilterMenuOpen ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                }}
              >
                Columns: {columnFilterSummary}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    isColumnFilterMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-[420px] space-y-3 max-h-[70vh] overflow-y-auto">
              {renderNumberFilterSection(
                "Column Number Range",
                columnNumberFilter,
                setColumnNumberFilter,
                columnNumberInputs,
                setColumnNumberInputs,
              )}
              <div className="flex items-center justify-end gap-2 pr-2 text-[11px] font-medium text-muted-foreground">
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={(event) => {
                    event.preventDefault()
                    collapseAllGroups()
                  }}
                >
                  Collapse all
                </button>
                <span className="text-muted-foreground/50">|</span>
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={(event) => {
                    event.preventDefault()
                    expandAllGroups()
                  }}
                >
                  Expand all
                </button>
              </div>
              <div className="h-px bg-border/40" />
              {renderFilterGroups(
                effectiveColumnFilterIds,
                toggleColumnFilterValue,
                toggleColumnGroupValue,
                collapsedGroupKeys,
                toggleGroupCollapse,
              )}
              <div className="flex gap-2">
                <ConfirmActionButton
                  variant="clear"
                  description="This will clear every column from your selection."
                  onConfirm={clearAllColumns}
                />
                <ConfirmActionButton
                  variant="select"
                  description="This will add every column back into your selection."
                  onConfirm={selectAllColumns}
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu
            open={isFilterOptionsMenuOpen}
            onOpenChange={(open) => {
              setIsFilterOptionsMenuOpen(open)
              if (!open && filterOptionsTriggerRef.current) {
                filterOptionsTriggerRef.current.blur()
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                ref={filterOptionsTriggerRef}
                type="button"
                variant="outline"
                size="sm"
                aria-label="Filter options"
                className={`flex items-center gap-2 border border-border px-3 py-1 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  isFilterOptionsMenuOpen ? "border-primary/60 bg-primary/5 text-primary shadow-sm" : "bg-muted/20 text-foreground hover:border-primary/40"
                }`}
                style={{
                  borderRadius: isFilterOptionsMenuOpen ? CARD_CONTROL_RADII.elevated : CARD_CONTROL_RADII.pill,
                }}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="w-[320px] space-y-4 border border-border bg-background/95 p-4 text-foreground shadow-lg backdrop-blur"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Slider scale</p>
                <p className="text-sm font-semibold text-foreground">{numberFilterStep} units per step</p>
              </div>
              <div className="space-y-3">
                <Slider
                  min={0}
                  max={FILTER_STEP_MAX_INDEX}
                  step={1}
                  value={[filterStepIndex]}
                  onValueChange={handleFilterStepSliderChange}
                />
                <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                  {FILTER_STEP_VALUES.map((value) => (
                    <span key={value}>{value}</span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Adjust how much the row and column number sliders move whenever you drag or tap them.
              </p>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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

      <div className="contrast-scroll-area overflow-x-auto overflow-visible px-4 py-4">
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
              const isEditing = editingColumnIndex === i
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
                onClick={() => onAddColor?.()}
              >
                <Plus className="h-8 w-8" />
              </Button>
            </div>

            {backgroundColors.map((bgColor, bgIndex) => {
              const isBgDragging = draggedBgIndex === bgIndex
              const isEditing = editingRowIndex === bgIndex
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
                    const level = getWCAGLevel(ratio, activeRequirement.thresholds)

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
                          {hasAAARequirement && level.aaa && (
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
                onClick={() => onAddColor?.()}
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

type ConfirmActionButtonProps = {
  variant: "clear" | "select"
  description: string
  onConfirm: () => void
}

const ConfirmActionButton = ({ variant, description, onConfirm }: ConfirmActionButtonProps) => {
  const isClear = variant === "clear"
  const buttonText = isClear ? "Clear all" : "Select all"
  const triggerVariant = isClear ? "blackOutline" : "black"

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={triggerVariant} size="sm" className="flex-1">
          {buttonText}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Confirm ${buttonText.toLowerCase()}`}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel asChild>
            <Button variant="blackOutline" size="sm">
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant="black"
              size="sm"
              onClick={(event) => {
                event.preventDefault()
                onConfirm()
              }}
            >
              {buttonText}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
