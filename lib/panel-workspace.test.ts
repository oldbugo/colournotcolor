import { describe, expect, it } from "vitest"

import {
  collapsePanelInWorkspace,
  containsPanel,
  createDefaultPanelWorkspaceState,
  createSplitResizeSession,
  getPanelLayoutMinSize,
  getPanelIds,
  getSplitRatioAtPath,
  movePanelInWorkspace,
  movePanelToAdjacentPairSide,
  movePanelToSplitGap,
  movePanelToLayoutPathSide,
  movePanelToWorkspaceEdge,
  normalizePanelWorkspaceState,
  resizeSplitLayoutFromSession,
  resizeSplitSession,
  restorePanelInWorkspace,
  swapPanelsInWorkspace,
  updateSplitRatio,
  type PanelLayoutNode,
  type PanelWorkspaceState,
} from "./panel-workspace"

describe("panel workspace layout helpers", () => {
  it("creates a default mixed horizontal and vertical workspace", () => {
    const state = createDefaultPanelWorkspaceState()

    expect(getPanelIds(state.layout)).toEqual(["panel1", "panel2", "panel3"])
    expect(state.layout?.type).toBe("split")
    if (state.layout?.type === "split") {
      expect(state.layout.direction).toBe("row")
      expect(state.layout.second.type).toBe("split")
      if (state.layout.second.type === "split") {
        expect(state.layout.second.direction).toBe("column")
      }
    }
  })

  it("collapses a visible panel into the dock", () => {
    const state = collapsePanelInWorkspace(createDefaultPanelWorkspaceState(), "panel2")

    expect(containsPanel(state.layout, "panel2")).toBe(false)
    expect(state.collapsed).toEqual(["panel2"])
    expect(getPanelIds(state.layout)).toEqual(["panel1", "panel3"])
  })

  it("restores a collapsed panel without duplicating it", () => {
    const collapsed = collapsePanelInWorkspace(createDefaultPanelWorkspaceState(), "panel2")
    const restored = restorePanelInWorkspace(collapsed, "panel2")
    const restoredAgain = restorePanelInWorkspace(restored, "panel2")

    expect(restored.collapsed).toEqual([])
    expect(getPanelIds(restored.layout).sort()).toEqual(["panel1", "panel2", "panel3"])
    expect(getPanelIds(restoredAgain.layout).filter((id) => id === "panel2")).toHaveLength(1)
  })

  it("moves a docked panel back into the layout near a target panel", () => {
    const collapsed = collapsePanelInWorkspace(createDefaultPanelWorkspaceState(), "panel1")
    const moved = movePanelInWorkspace(collapsed, "panel1", "panel3", "top")

    expect(moved.collapsed).toEqual([])
    expect(getPanelIds(moved.layout).sort()).toEqual(["panel1", "panel2", "panel3"])
    expect(containsPanel(moved.layout, "panel1")).toBe(true)
  })

  it("moves a visible panel without losing the other panels", () => {
    const moved = movePanelInWorkspace(createDefaultPanelWorkspaceState(), "panel3", "panel1", "left")

    expect(getPanelIds(moved.layout).sort()).toEqual(["panel1", "panel2", "panel3"])
    expect(moved.collapsed).toEqual([])
  })

  it("moves a visible panel above a singular target panel", () => {
    const moved = movePanelInWorkspace(createDefaultPanelWorkspaceState(), "panel3", "panel1", "top")

    expect(getPanelIds(moved.layout)).toEqual(["panel3", "panel1", "panel2"])
    expect(moved.collapsed).toEqual([])
    expect(moved.layout?.type).toBe("split")
    if (moved.layout?.type === "split" && moved.layout.first.type === "split") {
      expect(moved.layout.first.direction).toBe("column")
      expect(moved.layout.first.first).toEqual({ type: "panel", id: "panel3" })
      expect(moved.layout.first.second).toEqual({ type: "panel", id: "panel1" })
    }
  })

  it("moves a visible panel below a singular target panel", () => {
    const moved = movePanelInWorkspace(createDefaultPanelWorkspaceState(), "panel1", "panel2", "bottom")

    expect(getPanelIds(moved.layout)).toEqual(["panel2", "panel1", "panel3"])
    expect(moved.collapsed).toEqual([])
    expect(moved.layout?.type).toBe("split")
    if (moved.layout?.type === "split" && moved.layout.first.type === "split") {
      expect(moved.layout.first.direction).toBe("column")
      expect(moved.layout.first.first).toEqual({ type: "panel", id: "panel2" })
      expect(moved.layout.first.second).toEqual({ type: "panel", id: "panel1" })
    }
  })

  it("moves a panel out of a perpendicular stack when dropped on the adjacent split gap", () => {
    const moved = movePanelToSplitGap(createDefaultPanelWorkspaceState(), "panel2", "panel1", "panel2", "row")

    expect(getPanelIds(moved.layout)).toEqual(["panel1", "panel2", "panel3"])
    expect(moved.collapsed).toEqual([])
    expect(moved.layout?.type).toBe("split")
    if (moved.layout?.type === "split") {
      expect(moved.layout.direction).toBe("row")
      expect(moved.layout.first.type).toBe("split")
      expect(moved.layout.second).toEqual({ type: "panel", id: "panel3" })
      if (moved.layout.first.type === "split") {
        expect(moved.layout.first.direction).toBe("row")
        expect(moved.layout.first.first).toEqual({ type: "panel", id: "panel1" })
        expect(moved.layout.first.second).toEqual({ type: "panel", id: "panel2" })
      }
    }
  })

  it("moves a panel perpendicular to a pair around a split gap", () => {
    const moved = movePanelToAdjacentPairSide(createDefaultPanelWorkspaceState(), "panel3", "panel1", "panel2", "top")

    expect(getPanelIds(moved.layout)).toEqual(["panel3", "panel1", "panel2"])
    expect(moved.collapsed).toEqual([])
    expect(moved.layout?.type).toBe("split")
    if (moved.layout?.type === "split") {
      expect(moved.layout.direction).toBe("column")
      expect(moved.layout.first).toEqual({ type: "panel", id: "panel3" })
      expect(moved.layout.second.type).toBe("split")
      if (moved.layout.second.type === "split") {
        expect(moved.layout.second.direction).toBe("row")
        expect(moved.layout.second.first).toEqual({ type: "panel", id: "panel1" })
        expect(moved.layout.second.second).toEqual({ type: "panel", id: "panel2" })
      }
    }
  })

  it("moves a visible panel to the left workspace edge", () => {
    const moved = movePanelToWorkspaceEdge(createDefaultPanelWorkspaceState(), "panel2", "left")

    expect(getPanelIds(moved.layout)).toEqual(["panel2", "panel1", "panel3"])
    expect(moved.collapsed).toEqual([])
    expect(moved.layout?.type).toBe("split")
    if (moved.layout?.type === "split") {
      expect(moved.layout.direction).toBe("row")
      expect(moved.layout.first).toEqual({ type: "panel", id: "panel2" })
    }
  })

  it("moves a visible panel to the right workspace edge", () => {
    const moved = movePanelToWorkspaceEdge(createDefaultPanelWorkspaceState(), "panel1", "right")

    expect(getPanelIds(moved.layout)).toEqual(["panel2", "panel3", "panel1"])
    expect(moved.collapsed).toEqual([])
    expect(moved.layout?.type).toBe("split")
    if (moved.layout?.type === "split") {
      expect(moved.layout.direction).toBe("row")
      expect(moved.layout.second).toEqual({ type: "panel", id: "panel1" })
    }
  })

  it("moves a visible panel to the top workspace edge", () => {
    const moved = movePanelToWorkspaceEdge(createDefaultPanelWorkspaceState(), "panel3", "top")

    expect(getPanelIds(moved.layout)).toEqual(["panel3", "panel1", "panel2"])
    expect(moved.collapsed).toEqual([])
    expect(moved.layout?.type).toBe("split")
    if (moved.layout?.type === "split") {
      expect(moved.layout.direction).toBe("column")
      expect(moved.layout.first).toEqual({ type: "panel", id: "panel3" })
    }
  })

  it("moves a visible panel to the bottom workspace edge", () => {
    const moved = movePanelToWorkspaceEdge(createDefaultPanelWorkspaceState(), "panel1", "bottom")

    expect(getPanelIds(moved.layout)).toEqual(["panel2", "panel3", "panel1"])
    expect(moved.collapsed).toEqual([])
    expect(moved.layout?.type).toBe("split")
    if (moved.layout?.type === "split") {
      expect(moved.layout.direction).toBe("column")
      expect(moved.layout.second).toEqual({ type: "panel", id: "panel1" })
    }
  })

  it("moves a docked panel to a workspace edge", () => {
    const collapsed = collapsePanelInWorkspace(createDefaultPanelWorkspaceState(), "panel3")
    const moved = movePanelToWorkspaceEdge(collapsed, "panel3", "right")

    expect(getPanelIds(moved.layout)).toEqual(["panel1", "panel2", "panel3"])
    expect(moved.collapsed).toEqual([])
  })

  it("moves a panel beside a vertical split group instead of into the split", () => {
    const moved = movePanelToLayoutPathSide(createDefaultPanelWorkspaceState(), "panel3", ["second"], "left")

    expect(getPanelIds(moved.layout)).toEqual(["panel1", "panel3", "panel2"])
    expect(moved.collapsed).toEqual([])
    expect(moved.layout?.type).toBe("split")
    if (moved.layout?.type === "split" && moved.layout.second.type === "split") {
      expect(moved.layout.second.direction).toBe("row")
      expect(moved.layout.second.first).toEqual({ type: "panel", id: "panel3" })
      expect(moved.layout.second.second).toEqual({ type: "panel", id: "panel2" })
    }
  })

  it("moves a docked panel beside a split group", () => {
    const collapsed = collapsePanelInWorkspace(createDefaultPanelWorkspaceState(), "panel1")
    const moved = movePanelToLayoutPathSide(collapsed, "panel1", [], "left")

    expect(getPanelIds(moved.layout)).toEqual(["panel1", "panel2", "panel3"])
    expect(moved.collapsed).toEqual([])
    expect(moved.layout?.type).toBe("split")
    if (moved.layout?.type === "split") {
      expect(moved.layout.direction).toBe("row")
      expect(moved.layout.second.type).toBe("split")
    }
  })

  it("swaps two visible panels without changing the layout shape", () => {
    const swapped = swapPanelsInWorkspace(createDefaultPanelWorkspaceState(), "panel1", "panel3")

    expect(getPanelIds(swapped.layout)).toEqual(["panel3", "panel2", "panel1"])
    expect(swapped.collapsed).toEqual([])
  })

  it("swaps a docked panel with a visible panel", () => {
    const collapsed = collapsePanelInWorkspace(createDefaultPanelWorkspaceState(), "panel1")
    const swapped = swapPanelsInWorkspace(collapsed, "panel1", "panel3")

    expect(getPanelIds(swapped.layout).sort()).toEqual(["panel1", "panel2"])
    expect(swapped.collapsed).toEqual(["panel3"])
    expect(containsPanel(swapped.layout, "panel1")).toBe(true)
    expect(containsPanel(swapped.layout, "panel3")).toBe(false)
  })

  it("clamps split ratio updates", () => {
    const defaultState = createDefaultPanelWorkspaceState()
    const tooSmall = updateSplitRatio(defaultState.layout, [], -2)
    const tooLarge = updateSplitRatio(defaultState.layout, ["second"], 10)

    expect(getSplitRatioAtPath(tooSmall, [])).toBe(0.05)
    expect(getSplitRatioAtPath(tooLarge, ["second"])).toBe(0.95)
  })

  it("normalizes stored state by removing duplicates and adding missing panels", () => {
    const stored: PanelWorkspaceState = {
      layout: {
        type: "split",
        direction: "row",
        ratio: 1.5,
        first: { type: "panel", id: "panel1" },
        second: { type: "panel", id: "panel1" },
      },
      collapsed: ["panel2", "panel2"],
    }

    const normalized = normalizePanelWorkspaceState(stored)

    expect(normalized).not.toBeNull()
    expect(normalized?.collapsed).toEqual(["panel2"])
    expect(getPanelIds(normalized?.layout ?? null).sort()).toEqual(["panel1", "panel3"])
    expect(getSplitRatioAtPath(normalized?.layout ?? null, [])).toBeGreaterThanOrEqual(0.05)
  })

  it("resizes only adjacent items in a same-direction strip before pushing", () => {
    const layout = createThreeColumnLayout()
    const session = createSplitResizeSession(layout, [], "row", 924, 100, 12)

    expect(session?.itemSizes).toEqual([300, 300, 300])

    const resized = resizeSplitLayoutFromSession(layout, session!, 50)
    const resizedSession = createSplitResizeSession(resized, [], "row", 924, 100, 12)

    expect(resizedSession?.itemSizes.map(Math.round)).toEqual([350, 250, 300])
  })

  it("pushes the next panel only after the adjacent item reaches its minimum", () => {
    const layout = createThreeColumnLayout()
    const session = createSplitResizeSession(layout, [], "row", 924, 100, 12)
    const resized = resizeSplitLayoutFromSession(layout, session!, 250)
    const resizedSession = createSplitResizeSession(resized, [], "row", 924, 100, 12)

    expect(resizedSession?.itemSizes.map(Math.round)).toEqual([550, 100, 250])
  })

  it("does not pull a pushed panel back when retracting the same divider", () => {
    const layout = createThreeColumnLayout()
    const session = createSplitResizeSession(layout, [], "row", 924, 100, 12)
    const pushed = resizeSplitSession(session!, 250)
    const retracted = resizeSplitSession(pushed.session, -50)

    expect(pushed.session.itemSizes.map(Math.round)).toEqual([550, 100, 250])
    expect(retracted.session.itemSizes.map(Math.round)).toEqual([500, 150, 250])
    expect(retracted.appliedDelta).toBe(-50)
  })

  it("clamps divider movement when every pushed panel is at minimum", () => {
    const layout = createThreeColumnLayout()
    const session = createSplitResizeSession(layout, [], "row", 924, 100, 12)
    const resized = resizeSplitLayoutFromSession(layout, session!, 500)
    const resizedSession = createSplitResizeSession(resized, [], "row", 924, 100, 12)

    expect(resizedSession?.itemSizes.map(Math.round)).toEqual([700, 100, 100])
  })

  it("resizes the root boundary next to a nested same-direction group without changing the far panel", () => {
    const layout = createLeftNestedThreeColumnLayout()
    const session = createSplitResizeSession(layout, [], "row", 924, 100, 12)

    expect(session?.itemSizes).toEqual([300, 300, 300])

    const resized = resizeSplitLayoutFromSession(layout, session!, 50)
    const resizedSession = createSplitResizeSession(resized, [], "row", 924, 100, 12)

    expect(resizedSession?.itemSizes.map(Math.round)).toEqual([300, 350, 250])
  })

  it("calculates subtree minimum size along the resize axis", () => {
    const layout = createDefaultPanelWorkspaceState().layout

    expect(getPanelLayoutMinSize(layout, "row", 280, 12)).toBe(572)
    expect(getPanelLayoutMinSize(layout, "column", 210, 12)).toBe(432)
  })
})

function createThreeColumnLayout(): PanelLayoutNode {
  return {
    type: "split",
    direction: "row",
    ratio: 300 / 912,
    first: { type: "panel", id: "panel1" },
    second: {
      type: "split",
      direction: "row",
      ratio: 0.5,
      first: { type: "panel", id: "panel2" },
      second: { type: "panel", id: "panel3" },
    },
  }
}

function createLeftNestedThreeColumnLayout(): PanelLayoutNode {
  return {
    type: "split",
    direction: "row",
    ratio: 612 / 912,
    first: {
      type: "split",
      direction: "row",
      ratio: 0.5,
      first: { type: "panel", id: "panel1" },
      second: { type: "panel", id: "panel2" },
    },
    second: { type: "panel", id: "panel3" },
  }
}
