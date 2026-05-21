"use client"

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, type Dispatch, type SetStateAction } from "react"

import { storage, type NumberRange, type StoredContrastFilters } from "@/lib/storage-utils"

export const FILTER_STEP_VALUES = [1, 10, 100, 1000] as const
export const FILTER_STEP_MAX_INDEX = FILTER_STEP_VALUES.length - 1

type NumberInputs = { min: string; max: string }

const serializeFilterIds = (ids: Set<string> | null): string[] | null => {
  if (ids === null) {
    return null
  }
  return Array.from(ids)
}

type UseContrastFiltersOptions = {
  /** Storage key prefix; the underlying lib/storage-utils helper keys filters by paletteId. */
  paletteId: string
}

export type UseContrastFiltersResult = {
  rowFilterIds: Set<string> | null
  setRowFilterIds: Dispatch<SetStateAction<Set<string> | null>>
  columnFilterIds: Set<string> | null
  setColumnFilterIds: Dispatch<SetStateAction<Set<string> | null>>
  rowNumberFilter: NumberRange | null
  setRowNumberFilter: Dispatch<SetStateAction<NumberRange | null>>
  columnNumberFilter: NumberRange | null
  setColumnNumberFilter: Dispatch<SetStateAction<NumberRange | null>>
  rowNumberInputs: NumberInputs
  setRowNumberInputs: Dispatch<SetStateAction<NumberInputs>>
  columnNumberInputs: NumberInputs
  setColumnNumberInputs: Dispatch<SetStateAction<NumberInputs>>
  filterStepIndex: number
  setFilterStepIndex: Dispatch<SetStateAction<number>>
  /**
   * False until the load-from-storage effect has run for the current paletteId.
   * The save effect should bail until this flips true to avoid overwriting
   * stored filters with the empty defaults from a fresh render.
   */
  filtersInitialized: boolean
}

/**
 * Owns the row/column filter state for the contrast matrix plus its
 * localStorage round-trip. When the active palette changes, filters are
 * re-hydrated from storage; subsequent state changes are flushed back.
 *
 * Note: the row/column "filterIds" sets are stored as plain string arrays
 * in localStorage (the hook handles the Set ↔ Array conversion).
 */
export function useContrastFilters({ paletteId }: UseContrastFiltersOptions): UseContrastFiltersResult {
  const [rowFilterIds, setRowFilterIds] = useState<Set<string> | null>(null)
  const [columnFilterIds, setColumnFilterIds] = useState<Set<string> | null>(null)
  const [rowNumberFilter, setRowNumberFilter] = useState<NumberRange | null>(null)
  const [columnNumberFilter, setColumnNumberFilter] = useState<NumberRange | null>(null)
  const [rowNumberInputs, setRowNumberInputs] = useState<NumberInputs>({ min: "", max: "" })
  const [columnNumberInputs, setColumnNumberInputs] = useState<NumberInputs>({ min: "", max: "" })
  const [filterStepIndex, setFilterStepIndex] = useState(1)
  const [filtersInitialized, setFiltersInitialized] = useState(false)

  // Load from storage whenever the active palette changes.
  useEffect(() => {
    setFiltersInitialized(false)
    const stored = storage.loadContrastFilters(paletteId)
    setRowNumberFilter(stored.rowRange ?? null)
    setColumnNumberFilter(stored.columnRange ?? null)
    setRowFilterIds(stored.rowIds === null ? null : new Set<string>(stored.rowIds))
    setColumnFilterIds(stored.columnIds === null ? null : new Set<string>(stored.columnIds))
    if (
      typeof stored.filterStepIndex === "number" &&
      stored.filterStepIndex >= 0 &&
      stored.filterStepIndex <= FILTER_STEP_MAX_INDEX
    ) {
      setFilterStepIndex(stored.filterStepIndex)
    } else {
      setFilterStepIndex(1)
    }
    setFiltersInitialized(true)
  }, [paletteId])

  // Mirror the row number filter into the text inputs.
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

  // Mirror the column number filter into the text inputs.
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

  // Persist on every change once we've finished the initial load.
  useEffect(() => {
    if (!filtersInitialized) {
      return
    }
    const filters: StoredContrastFilters = {
      rowRange: rowNumberFilter,
      columnRange: columnNumberFilter,
      rowIds: serializeFilterIds(rowFilterIds),
      columnIds: serializeFilterIds(columnFilterIds),
      filterStepIndex,
    }
    storage.saveContrastFilters(paletteId, filters)
  }, [
    filtersInitialized,
    paletteId,
    rowNumberFilter,
    columnNumberFilter,
    rowFilterIds,
    columnFilterIds,
    filterStepIndex,
  ])

  return {
    rowFilterIds,
    setRowFilterIds,
    columnFilterIds,
    setColumnFilterIds,
    rowNumberFilter,
    setRowNumberFilter,
    columnNumberFilter,
    setColumnNumberFilter,
    rowNumberInputs,
    setRowNumberInputs,
    columnNumberInputs,
    setColumnNumberInputs,
    filterStepIndex,
    setFilterStepIndex,
    filtersInitialized,
  }
}
