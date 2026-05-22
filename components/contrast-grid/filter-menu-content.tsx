"use client"

import React from "react"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { extractHexFromColor } from "@/lib/contrast-utils"
import type { NumberRange } from "@/lib/storage-utils"

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export type FilterMenuColorEntry = {
  id: string
  hex: string
  legacy: string
  label: string
  baseIndex: number
  groupKey: string
  groupLabel: string
  numericValue: number | null
}

export type FilterMenuColorGroup = {
  key: string
  label: string
  entries: FilterMenuColorEntry[]
}

type FilterMenuColorGroupsProps = {
  groups: FilterMenuColorGroup[]
  effectiveSet: Set<string> | null
  toggleSingle: (id: string) => void
  toggleGroup: (ids: string[]) => void
  collapsedSet: Set<string>
  onToggleCollapse: (key: string) => void
  numberFilter: NumberRange | null
  passesNumberFilter: (entry: FilterMenuColorEntry, filter: NumberRange | null) => boolean
}

/**
 * The colour-group list rendered inside row/column filter dropdowns.
 * Each group is collapsible and individually selectable; entries can be
 * marked "Filtered" when they fall outside the numeric range filter.
 */
export function FilterMenuColorGroups({
  groups,
  effectiveSet,
  toggleSingle,
  toggleGroup,
  collapsedSet,
  onToggleCollapse,
  numberFilter,
  passesNumberFilter,
}: FilterMenuColorGroupsProps) {
  if (groups.length === 0) {
    return <div className="px-2 py-1 text-xs text-muted-foreground">No colors available</div>
  }
  return (
    <div className="space-y-2 pr-1">
      {groups.map((group) => {
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
          <div key={group.key} className="rounded-md border border-border/40 bg-muted/5 px-2 py-1">
            <div
              role="button"
              tabIndex={0}
              className="flex w-full cursor-pointer items-center justify-between rounded-md px-1.5 py-1 text-xs font-semibold text-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
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
                <span className="text-base leading-none">{isCollapsed ? "+" : "−"}</span>
                <span className="truncate">{group.label}</span>
              </span>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
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
              >
                <span>{selectedCount}/{group.entries.length}</span>
                <span className="flex h-9 w-5 items-center justify-end rounded-full pr-0">
                  <span className={`h-3 w-5 rounded-full border transition-colors ${indicatorClass}`} aria-hidden="true" />
                </span>
              </button>
            </div>
            <div
              className={`overflow-hidden transition-[max-height,opacity] duration-150 ease-out ${
                isCollapsed ? "max-h-0 opacity-0 pointer-events-none" : "max-h-80 opacity-100"
              }`}
              aria-hidden={isCollapsed}
            >
              <div className="mt-1 space-y-1">
                {group.entries.map((entry) => {
                  const isSelected = effectiveSet ? effectiveSet.has(entry.id) : true
                  const passesRange = passesNumberFilter(entry, numberFilter)
                  const isFilteredByRange = !passesRange
                  const showFilteredTag = isFilteredByRange
                  const isMutedByFiltering = isFilteredByRange
                  const labelParts = entry.label.split("/")
                  const displayLabel = labelParts[labelParts.length - 1]?.trim() || entry.label
                  const hexColor = extractHexFromColor(entry.legacy)
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1 text-sm ${
                        isMutedByFiltering ? "text-muted-foreground" : "text-foreground"
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
                        {showFilteredTag && (
                          <span className="rounded-full border border-muted-foreground/40 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Filtered
                          </span>
                        )}
                      </span>
                      <span
                        className={`h-3 w-3 rounded-full border ${
                          isSelected
                            ? isMutedByFiltering
                              ? "bg-muted-foreground/60 border-muted-foreground/70"
                              : "bg-foreground border-foreground"
                            : "border-muted-foreground/40"
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

type FilterMenuNumberSectionProps = {
  label: string
  filter: NumberRange | null
  setFilter: React.Dispatch<React.SetStateAction<NumberRange | null>>
  inputValues: { min: string; max: string }
  setInputValues: React.Dispatch<React.SetStateAction<{ min: string; max: string }>>
  expanded: boolean
  onToggleExpanded: () => void
  numericBounds: NumberRange | null
  clampRangeToBounds: (range: NumberRange | null) => NumberRange | null
  numberFilterStep: number
  focusedNumberInput: HTMLInputElement | null
  setFocusedNumberInput: React.Dispatch<React.SetStateAction<HTMLInputElement | null>>
}

/**
 * The numeric range filter rendered above the colour-group list.
 * Shows min/max inputs synced to a dual-handle slider, with wheel-step
 * support when the input is focused.
 */
export function FilterMenuNumberSection({
  label,
  filter,
  setFilter,
  inputValues,
  setInputValues,
  expanded,
  onToggleExpanded,
  numericBounds,
  clampRangeToBounds,
  numberFilterStep,
  focusedNumberInput,
  setFocusedNumberInput,
}: FilterMenuNumberSectionProps) {
  const normalizedRange = clampRangeToBounds(filter) ?? (numericBounds ? { ...numericBounds } : null)
  const isRangeActive = Boolean(
    numericBounds &&
      normalizedRange &&
      (normalizedRange.min !== numericBounds.min || normalizedRange.max !== numericBounds.max),
  )
  if (!numericBounds || !normalizedRange) {
    return (
      <div className="rounded-md border border-dashed border-muted-foreground/40 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            onClick={() => onToggleExpanded()}
          >
            <span className="text-base leading-none">{expanded ? "−" : "+"}</span>
            <span>{label}</span>
          </button>
        </div>
        {expanded && (
          <div className="mt-2">
            Add numeric names (e.g., &ldquo;Red/100&rdquo;) to unlock range filtering.
          </div>
        )}
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

  const applyWheelStep = (field: "min" | "max", deltaY: number) => {
    const direction = deltaY > 0 ? 1 : -1
    const step = numberFilterStep
    const otherField = field === "min" ? "max" : "min"
    const fallback = field === "min" ? sliderValues[0] : sliderValues[1]
    const otherFallback = otherField === "min" ? sliderValues[0] : sliderValues[1]
    const currentRaw = inputValues[field].trim()
    const otherRaw = inputValues[otherField].trim()
    const currentValue = Number.isFinite(Number(currentRaw)) ? Number(currentRaw) : fallback
    const otherValue = Number.isFinite(Number(otherRaw)) ? Number(otherRaw) : otherFallback
    const nextValue = clamp(currentValue + direction * step, numericBounds.min, numericBounds.max)
    const boundedOther = clamp(otherValue, numericBounds.min, numericBounds.max)

    if (field === "min") {
      const nextMin = Math.min(nextValue, boundedOther)
      const nextMax = Math.max(boundedOther, nextMin)
      const nextRange = clampRangeToBounds({ min: nextMin, max: nextMax })
      if (nextRange) {
        setFilter(nextRange)
        setInputValues({ min: nextRange.min.toString(), max: nextRange.max.toString() })
      }
    } else {
      const nextMax = Math.max(nextValue, boundedOther)
      const nextMin = Math.min(boundedOther, nextMax)
      const nextRange = clampRangeToBounds({ min: nextMin, max: nextMax })
      if (nextRange) {
        setFilter(nextRange)
        setInputValues({ min: nextRange.min.toString(), max: nextRange.max.toString() })
      }
    }
  }

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div
        className={`flex items-center justify-between text-xs font-semibold uppercase tracking-wide ${
          isRangeActive ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        <button
          type="button"
          className="flex cursor-pointer items-center gap-2"
          onClick={() => onToggleExpanded()}
        >
          <span className="text-base leading-none">{expanded ? "−" : "+"}</span>
          <span>{label}</span>
        </button>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            isRangeActive
              ? "border-foreground/40 bg-foreground/5 text-foreground"
              : "border-muted-foreground/30 bg-muted/30 text-muted-foreground"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 cursor-pointer rounded-full ${
              isRangeActive ? "bg-foreground" : "bg-muted-foreground/60"
            }`}
            aria-hidden="true"
          />
          {isRangeActive ? "Active" : "Inactive"}
        </span>
      </div>
      {expanded && (
        <>
          <div className="mt-3 flex items-center gap-4 text-sm">
            <label className="text-xs font-medium text-muted-foreground">Min</label>
            <Input
              type="number"
              inputMode="numeric"
              step={numberFilterStep}
              value={inputValues.min}
              onChange={(event) => handleInputChange("min", event.currentTarget.value)}
              onFocus={(event) => setFocusedNumberInput(event.currentTarget)}
              onBlur={(event) => {
                commitInputValue("min")
                if (focusedNumberInput === event.currentTarget) {
                  setFocusedNumberInput(null)
                }
              }}
              onWheel={(event) => {
                if (document.activeElement !== event.currentTarget) {
                  return
                }
                event.preventDefault()
                applyWheelStep("min", event.deltaY)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  commitInputValue("min")
                }
              }}
              className="h-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <label className="text-xs font-medium text-muted-foreground">Max</label>
            <Input
              type="number"
              inputMode="numeric"
              step={numberFilterStep}
              value={inputValues.max}
              onChange={(event) => handleInputChange("max", event.currentTarget.value)}
              onFocus={(event) => setFocusedNumberInput(event.currentTarget)}
              onBlur={(event) => {
                commitInputValue("max")
                if (focusedNumberInput === event.currentTarget) {
                  setFocusedNumberInput(null)
                }
              }}
              onWheel={(event) => {
                if (document.activeElement !== event.currentTarget) {
                  return
                }
                event.preventDefault()
                applyWheelStep("max", event.deltaY)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  commitInputValue("max")
                }
              }}
              className="h-8 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div className="mt-3 px-1">
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
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{sliderValues[0]}</span>
            <span>{sliderValues[1]}</span>
          </div>
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              className="cursor-pointer text-xs font-semibold text-foreground underline-offset-2 hover:underline"
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
        </>
      )}
    </div>
  )
}
