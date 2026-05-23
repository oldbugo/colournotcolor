import { beforeEach, describe, expect, it, vi } from "vitest"

import { createDefaultPanelWorkspaceState } from "./panel-workspace"
import { storage, type StoredContrastFilters } from "./storage-utils"

/**
 * The hook + page code goes through `window.localStorage`. In a Node test env
 * there's no window; install a minimal in-memory shim before each test.
 */
class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value))
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null
  }
}

beforeEach(() => {
  const memory = new MemoryStorage()
  vi.stubGlobal("localStorage", memory)
  vi.stubGlobal("window", { localStorage: memory })
})

describe("storage.savePalettes / loadPalettes", () => {
  it("round-trips palettes", () => {
    const palettes = [
      {
        id: "1",
        name: "First",
        colors: [
          { id: "a", hex: "#FFFFFF", name: "white", group: null },
          { id: "b", hex: "#000000", name: "black", group: "neutral" },
        ],
      },
    ]
    storage.savePalettes(palettes)
    const loaded = storage.loadPalettes()
    expect(loaded).toEqual(palettes)
  })

  it("returns null when nothing is stored", () => {
    expect(storage.loadPalettes()).toBeNull()
  })

  it("migrates v1 foregroundColors/backgroundColors into a flat colors[]", () => {
    localStorage.setItem(
      "color-checker-palettes",
      JSON.stringify([
        {
          id: "x",
          name: "Legacy",
          foregroundColors: ["#FFFFFF"],
          backgroundColors: ["red#FF0000"],
        },
      ]),
    )
    const loaded = storage.loadPalettes()
    expect(loaded).toHaveLength(1)
    expect(loaded![0].id).toBe("x")
    expect(loaded![0].colors).toHaveLength(2)
    expect(loaded![0].colors[0].hex).toBe("#FFFFFF")
    expect(loaded![0].colors[1]).toMatchObject({ hex: "#FF0000", name: "red" })
  })

  it("returns null when stored value is not an array", () => {
    localStorage.setItem("color-checker-palettes", '"not an array"')
    expect(storage.loadPalettes()).toBeNull()
  })

  it("returns null when stored value is malformed JSON", () => {
    localStorage.setItem("color-checker-palettes", "{not json")
    expect(storage.loadPalettes()).toBeNull()
  })
})

describe("storage.saveActivePaletteId / loadActivePaletteId", () => {
  it("round-trips the active id", () => {
    storage.saveActivePaletteId("abc")
    expect(storage.loadActivePaletteId()).toBe("abc")
  })

  it("returns null when nothing is stored", () => {
    expect(storage.loadActivePaletteId()).toBeNull()
  })
})

describe("storage.saveContrastStandard / loadContrastStandard", () => {
  it("round-trips a known value", () => {
    storage.saveContrastStandard("apca-bronze")
    expect(storage.loadContrastStandard()).toBe("apca-bronze")
  })

  it("migrates legacy 'apca' to 'apca-bronze'", () => {
    localStorage.setItem("color-checker-contrast-standard", "apca")
    expect(storage.loadContrastStandard()).toBe("apca-bronze")
  })

  it("migrates legacy 'apca-silver' to 'apca-bronze'", () => {
    localStorage.setItem("color-checker-contrast-standard", "apca-silver")
    expect(storage.loadContrastStandard()).toBe("apca-bronze")
  })

  it("migrates legacy 'both' to 'apca-bronze'", () => {
    localStorage.setItem("color-checker-contrast-standard", "both")
    expect(storage.loadContrastStandard()).toBe("apca-bronze")
  })

  it("returns null for unrecognised values", () => {
    localStorage.setItem("color-checker-contrast-standard", "nonsense")
    expect(storage.loadContrastStandard()).toBeNull()
  })
})

describe("storage.saveLayoutPreference / loadLayoutPreference", () => {
  it("round-trips per palette id", () => {
    storage.saveLayoutPreference("p1", true)
    storage.saveLayoutPreference("p2", false)
    expect(storage.loadLayoutPreference("p1")).toBe(true)
    expect(storage.loadLayoutPreference("p2")).toBe(false)
  })

  it("returns null for unknown palettes", () => {
    storage.saveLayoutPreference("p1", true)
    expect(storage.loadLayoutPreference("p999")).toBeNull()
  })
})

describe("storage.savePickerHeight / loadPickerHeight", () => {
  it("round-trips per palette id", () => {
    storage.savePickerHeight("p1", 420)
    expect(storage.loadPickerHeight("p1")).toBe(420)
  })

  it("returns null when no entry exists for the palette", () => {
    expect(storage.loadPickerHeight("p1")).toBeNull()
  })

  it("survives malformed json gracefully", () => {
    localStorage.setItem("palette-picker-heights-v1", "{not json")
    expect(storage.loadPickerHeight("p1")).toBeNull()
  })
})

describe("storage.saveContrastFilters / loadContrastFilters", () => {
  it("round-trips a full filter shape", () => {
    const filters: StoredContrastFilters = {
      rowRange: { min: 100, max: 700 },
      columnRange: null,
      rowIds: ["a", "b"],
      columnIds: null,
      filterStepIndex: 2,
    }
    storage.saveContrastFilters("p1", filters)
    expect(storage.loadContrastFilters("p1")).toEqual(filters)
  })

  it("normalises a missing entry into nulls", () => {
    expect(storage.loadContrastFilters("never-saved")).toEqual({
      rowRange: null,
      columnRange: null,
      rowIds: null,
      columnIds: null,
      filterStepIndex: null,
    })
  })

  it("preserves entries for OTHER palette ids", () => {
    storage.saveContrastFilters("p1", {
      rowRange: { min: 1, max: 9 },
      columnRange: null,
      rowIds: null,
      columnIds: null,
      filterStepIndex: 1,
    })
    storage.saveContrastFilters("p2", {
      rowRange: null,
      columnRange: { min: 0, max: 100 },
      rowIds: null,
      columnIds: null,
      filterStepIndex: 0,
    })
    expect(storage.loadContrastFilters("p1").rowRange).toEqual({ min: 1, max: 9 })
    expect(storage.loadContrastFilters("p2").columnRange).toEqual({ min: 0, max: 100 })
  })

  it("accepts legacy 'rows'/'columns' keys via the normaliser", () => {
    localStorage.setItem(
      "contrast-grid-number-filters-v1",
      JSON.stringify({
        legacyId: {
          rows: { min: 10, max: 50 },
          columns: { min: 20, max: 80 },
        },
      }),
    )
    const loaded = storage.loadContrastFilters("legacyId")
    expect(loaded.rowRange).toEqual({ min: 10, max: 50 })
    expect(loaded.columnRange).toEqual({ min: 20, max: 80 })
  })

  it("drops non-string rowIds entries", () => {
    localStorage.setItem(
      "contrast-grid-number-filters-v1",
      JSON.stringify({
        legacyId: {
          rowIds: ["good", 123, null, "also-good"],
          columnIds: null,
          rowRange: null,
          columnRange: null,
          filterStepIndex: 1,
        },
      }),
    )
    const loaded = storage.loadContrastFilters("legacyId")
    expect(loaded.rowIds).toEqual(["good", "also-good"])
  })
})

describe("storage.savePanelWorkspace / loadPanelWorkspace", () => {
  it("round-trips a panel workspace", () => {
    const state = createDefaultPanelWorkspaceState()
    storage.savePanelWorkspace(state)
    expect(storage.loadPanelWorkspace()).toEqual(state)
  })

  it("returns null for malformed panel workspace json", () => {
    localStorage.setItem("color-checker-panel-workspace-v1", "{not json")
    expect(storage.loadPanelWorkspace()).toBeNull()
  })
})

describe("storage.clearAll", () => {
  it("removes palettes, active id, layout prefs, contrast standard, picker heights, contrast filters, and panel workspace", () => {
    storage.savePalettes([
      { id: "1", name: "x", colors: [{ id: "a", hex: "#000", name: "", group: null }] },
    ])
    storage.saveActivePaletteId("1")
    storage.saveLayoutPreference("1", true)
    storage.saveContrastStandard("apca-bronze")
    storage.savePickerHeight("1", 300)
    storage.saveContrastFilters("1", {
      rowRange: null,
      columnRange: null,
      rowIds: null,
      columnIds: null,
      filterStepIndex: 1,
    })
    storage.savePanelWorkspace(createDefaultPanelWorkspaceState())

    storage.clearAll()

    expect(storage.loadPalettes()).toBeNull()
    expect(storage.loadActivePaletteId()).toBeNull()
    expect(storage.loadLayoutPreference("1")).toBeNull()
    expect(storage.loadContrastStandard()).toBeNull()
    expect(storage.loadPickerHeight("1")).toBeNull()
    expect(storage.loadContrastFilters("1")).toEqual({
      rowRange: null,
      columnRange: null,
      rowIds: null,
      columnIds: null,
      filterStepIndex: null,
    })
    expect(storage.loadPanelWorkspace()).toBeNull()
  })
})
