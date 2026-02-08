"use client"

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react"
import { Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"

type PanelHeaderProps = {
  title: string
  collapsed: boolean
  onToggle: () => void
  onHeaderMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void
}

function PanelHeader({
  title,
  collapsed,
  onToggle,
  onHeaderMouseDown,
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        "group sticky top-0 z-20 flex w-full items-center justify-between bg-background px-4 py-2.5 text-left text-sm font-semibold shadow-sm ring-1 ring-border/40",
        "transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
        "cursor-pointer",
      )}
      role="button"
      tabIndex={0}
      onMouseDown={onHeaderMouseDown}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onToggle()
        }
      }}
      title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
      aria-expanded={!collapsed}
      data-panel-toggle={title}
    >
      {collapsed ? (
        <span className="mx-auto inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted/70 text-muted-foreground transition-all duration-300 group-hover:bg-muted group-hover:text-foreground/90">
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
      ) : (
        <>
          <span className="flex items-center gap-3">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted/70 text-muted-foreground transition-all duration-300 group-hover:bg-foreground/10 group-hover:text-foreground">
              <Minimize2 className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold leading-tight text-foreground">{title}</span>
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-foreground/80">
            Collapse
          </span>
        </>
      )}
    </div>
  )
}

type ResizablePanelsProps = {
  panel1: ReactNode
  panel2: ReactNode
  panel3: ReactNode
  defaultWidths?: [number, number, number]
  panel1Title?: string
  panel2Title?: string
  panel3Title?: string
}

export function ResizablePanels({
  panel1,
  panel2,
  panel3,
  defaultWidths = [20, 40, 40],
  panel1Title = "Palette Manager",
  panel2Title = "Colour Manager",
  panel3Title = "Contrast Matrix",
}: ResizablePanelsProps) {
  const [collapsed, setCollapsed] = useState<[boolean, boolean, boolean]>([false, false, false])
  const [widths, setWidths] = useState(defaultWidths)
  const [resizingIndex, setResizingIndex] = useState<number | null>(null)
  const [isAnimatingCollapse, setIsAnimatingCollapse] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const widthsRef = useRef(widths)
  const collapsedRef = useRef(collapsed)
  const containerWidthRef = useRef<number | null>(null)
  const headerInteractionRef = useRef<{
    panelIndex: 0 | 1 | 2
    startX: number
    startY: number
    moved: boolean
    canMove: boolean
    collapsedAtStart: [boolean, boolean, boolean]
    startActualWidths: [number, number, number] | null
  } | null>(null)
  const resizeRafRef = useRef<number | null>(null)
  const pendingMouseEventRef = useRef<MouseEvent | null>(null)

  const COLLAPSED_WIDTH = 56
  const MIN_PANEL_WIDTH_PX = 400
  const MIN_PANEL_WIDTH_PERCENT_FALLBACK = 15
  const WIDTH_EPSILON = 0.1
  const HEADER_MOVE_THRESHOLD = 6

  const getMinWidthPercent = useCallback(
    (width: number | null) => {
      if (!width || width <= 0) {
        return MIN_PANEL_WIDTH_PERCENT_FALLBACK
      }
      return (MIN_PANEL_WIDTH_PX / width) * 100
    },
    [],
  )

  const redistributeWidths = useCallback(
    (currentWidths: [number, number, number], collapsedState: [boolean, boolean, boolean], minPercent: number) => {
      const collapsedSum = collapsedState.reduce((sum, isCollapsed, i) => (isCollapsed ? sum + currentWidths[i] : sum), 0)
      const availableForExpanded = Math.max(0, 100 - collapsedSum)
      const expandedIndices = collapsedState
        .map((isCollapsed, i) => (!isCollapsed ? i : -1))
        .filter((i): i is number => i !== -1)
      if (expandedIndices.length === 0) {
        return [...currentWidths] as [number, number, number]
      }

      const next = [...currentWidths] as [number, number, number]
      if (availableForExpanded <= 0) {
        expandedIndices.forEach((i) => {
          next[i] = 0
        })
        return next
      }

      const minimumTotal = minPercent * expandedIndices.length
      if (availableForExpanded <= minimumTotal) {
        const fallback = availableForExpanded / expandedIndices.length
        expandedIndices.forEach((i) => {
          next[i] = fallback
        })
        return next
      }

      const baseTotal = expandedIndices.reduce((sum, i) => sum + currentWidths[i], 0)
      const normalizedBaseTotal = baseTotal === 0 ? expandedIndices.length : baseTotal
      const leftover = availableForExpanded - minimumTotal
      expandedIndices.forEach((i) => {
        const proportion = baseTotal === 0 ? 1 / expandedIndices.length : currentWidths[i] / normalizedBaseTotal
        next[i] = minPercent + leftover * proportion
      })
      return next
    },
    [],
  )

  const cancelScheduledResize = () => {
    if (resizeRafRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(resizeRafRef.current)
      resizeRafRef.current = null
    }
  }

  const pushWidthsIfChanged = (next: [number, number, number]) => {
    setWidths((previous) => {
      const isSame = previous.every((value, index) => Math.abs(value - next[index]) < WIDTH_EPSILON)
      return isSame ? previous : next
    })
  }

  useEffect(() => {
    const node = containerRef.current
    if (!node) {
      return
    }

    const updateWidth = () => {
      const width = node.getBoundingClientRect().width
      setContainerWidth((prev) => (Math.abs((prev ?? 0) - width) < 0.5 ? prev : width))
    }

    updateWidth()

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const width = entry.contentRect.width
        setContainerWidth((prev) => (Math.abs((prev ?? 0) - width) < 0.5 ? prev : width))
      })
      observer.observe(node)
      return () => {
        observer.disconnect()
      }
    }

    if (typeof window === "undefined") {
      return
    }

    window.addEventListener("resize", updateWidth)
    return () => {
      window.removeEventListener("resize", updateWidth)
    }
  }, [])

  useEffect(() => {
    widthsRef.current = widths
  }, [widths])

  useEffect(() => {
    collapsedRef.current = collapsed
  }, [collapsed])

  useEffect(() => {
    containerWidthRef.current = containerWidth
  }, [containerWidth])

  const toggleCollapse = (index: 0 | 1 | 2) => {
    setIsAnimatingCollapse(true)
    const newCollapsed = [...collapsed] as [boolean, boolean, boolean]
    newCollapsed[index] = !newCollapsed[index]

    const rect = containerRef.current?.getBoundingClientRect()
    const measuredContainerWidth = rect ? rect.width : containerWidthRef.current
    if (!measuredContainerWidth || measuredContainerWidth <= 0) {
      setCollapsed(newCollapsed)
      setTimeout(() => setIsAnimatingCollapse(false), 300)
      return
    }

    const minPercent = getMinWidthPercent(measuredContainerWidth)
    const nextWidths = redistributeWidths(widths, newCollapsed, minPercent)
    setWidths(nextWidths)
    setCollapsed(newCollapsed)
    setTimeout(() => setIsAnimatingCollapse(false), 300)
  }

  const startHeaderInteraction = (panelIndex: 0 | 1 | 2, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || resizingIndex !== null) {
      return
    }

    event.preventDefault()

    const collapsedAtStart = [...collapsedRef.current] as [boolean, boolean, boolean]
    const measuredWidth = containerWidthRef.current ?? containerRef.current?.getBoundingClientRect().width ?? 0
    const canMove =
      panelIndex === 1 &&
      !collapsedAtStart[0] &&
      !collapsedAtStart[2] &&
      measuredWidth > 0

    headerInteractionRef.current = {
      panelIndex,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      canMove,
      collapsedAtStart,
      startActualWidths: canMove
        ? computeActualWidths(widthsRef.current, collapsedAtStart, measuredWidth, COLLAPSED_WIDTH)
        : null,
    }

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const interaction = headerInteractionRef.current
      if (!interaction || !interaction.canMove || !interaction.startActualWidths) {
        return
      }

      const deltaX = moveEvent.clientX - interaction.startX
      const deltaY = moveEvent.clientY - interaction.startY
      if (!interaction.moved) {
        const distance = Math.hypot(deltaX, deltaY)
        if (distance < HEADER_MOVE_THRESHOLD) {
          return
        }
        interaction.moved = true
      }

      const width = containerWidthRef.current ?? containerRef.current?.getBoundingClientRect().width ?? 0
      if (width <= 0) {
        return
      }

      const collapsedWidthPercent = (COLLAPSED_WIDTH / width) * 100
      const minWidthPercent = getMinWidthPercent(width)
      const fixedMiddleWidth = interaction.startActualWidths[1]
      const minLeft = interaction.collapsedAtStart[0] ? collapsedWidthPercent : minWidthPercent
      const minRight = interaction.collapsedAtStart[2] ? collapsedWidthPercent : minWidthPercent
      const maxLeft = 100 - fixedMiddleWidth - minRight
      const nextLeft = Math.max(minLeft, Math.min(interaction.startActualWidths[0] + (deltaX / width) * 100, maxLeft))
      const nextRight = 100 - fixedMiddleWidth - nextLeft

      const nextActualWidths: [number, number, number] = [nextLeft, fixedMiddleWidth, nextRight]
      const nextWidths = [...widthsRef.current] as [number, number, number]
      const availableExpandedSpace =
        100 -
        (interaction.collapsedAtStart[0] ? collapsedWidthPercent : 0) -
        (interaction.collapsedAtStart[1] ? collapsedWidthPercent : 0) -
        (interaction.collapsedAtStart[2] ? collapsedWidthPercent : 0)
      const expandedIndices = ([0, 1, 2] as const).filter((index) => !interaction.collapsedAtStart[index])
      const expandedActualTotal = expandedIndices.reduce<number>((sum, index) => sum + nextActualWidths[index], 0)

      expandedIndices.forEach((index) => {
        if (expandedActualTotal <= 0 || availableExpandedSpace <= 0) {
          nextWidths[index] = 0
          return
        }
        nextWidths[index] = (nextActualWidths[index] / expandedActualTotal) * availableExpandedSpace
      })

      pushWidthsIfChanged(nextWidths)
      document.body.style.userSelect = "none"
      document.body.style.cursor = "grab"
    }

    const handleMouseUp = () => {
      const interaction = headerInteractionRef.current
      headerInteractionRef.current = null
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""

      if (!interaction) {
        return
      }

      if (!interaction.moved) {
        toggleCollapse(interaction.panelIndex)
      }
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
  }

  useEffect(() => {
    if (resizingIndex === null) {
      cancelScheduledResize()
      pendingMouseEventRef.current = null
      return
    }

    const processResize = () => {
      resizeRafRef.current = null
      const event = pendingMouseEventRef.current
      const container = containerRef.current
      if (!event || !container) {
        return
      }

      const containerRect = container.getBoundingClientRect()
      if (containerRect.width === 0) {
        return
      }

      const mouseX = event.clientX - containerRect.left
      const percentage = (mouseX / containerRect.width) * 100

      const currentActualWidths = computeActualWidths(
        widthsRef.current,
        collapsedRef.current,
        containerWidthRef.current,
        COLLAPSED_WIDTH,
      )
      const collapsedWidthPercent =
        containerWidthRef.current && containerWidthRef.current > 0
          ? (COLLAPSED_WIDTH / containerWidthRef.current) * 100
          : MIN_PANEL_WIDTH_PERCENT_FALLBACK
      const minWidthPercent = getMinWidthPercent(containerWidthRef.current)
      const panelMinimums = collapsedRef.current.map((isCollapsed) =>
        isCollapsed ? collapsedWidthPercent : minWidthPercent,
      ) as [number, number, number]
      const nextWidths = [...widthsRef.current] as [number, number, number]

      if (resizingIndex === 0) {
        if (collapsedRef.current[0]) {
          return
        }

        if (collapsedRef.current[1]) {
          const panel2Width = currentActualWidths[1]
          const availableForPanels13 = 100 - panel2Width

          const desiredPanel1Width = Math.max(minWidthPercent, Math.min(percentage, availableForPanels13 - minWidthPercent))
          const desiredPanel3Width = availableForPanels13 - desiredPanel1Width

          nextWidths[0] = desiredPanel1Width
          nextWidths[2] = desiredPanel3Width
        } else {
          const minPanel1 = panelMinimums[0]
          const minPanel2 = panelMinimums[1]
          const minPanel3 = panelMinimums[2]
          const maxPanel1 = 100 - (minPanel2 + minPanel3)
          const clampedTarget = Math.max(minPanel1, Math.min(percentage, maxPanel1))
          const remaining = 100 - clampedTarget
          const currentPanel3 = currentActualWidths[2]
          let nextPanel3 = Math.min(currentPanel3, remaining - minPanel2)
          nextPanel3 = Math.max(nextPanel3, minPanel3)
          let nextPanel2 = remaining - nextPanel3
          if (nextPanel2 < minPanel2) {
            nextPanel2 = minPanel2
            nextPanel3 = Math.max(minPanel3, remaining - nextPanel2)
          }
          nextWidths[0] = clampedTarget
          nextWidths[1] = nextPanel2
          nextWidths[2] = nextPanel3
        }
      } else if (resizingIndex === 1) {
        if (collapsedRef.current[2]) {
          return
        }

        if (collapsedRef.current[1]) {
          const panel2Width = currentActualWidths[1]
          const availableForPanels13 = 100 - panel2Width

          const desiredPanel1Width = Math.max(
            minWidthPercent,
            Math.min(percentage - panel2Width, availableForPanels13 - minWidthPercent),
          )
          const desiredPanel3Width = availableForPanels13 - desiredPanel1Width

          nextWidths[0] = desiredPanel1Width
          nextWidths[2] = desiredPanel3Width
        } else {
          const minPanel1 = panelMinimums[0]
          const minPanel2 = panelMinimums[1]
          const minPanel3 = panelMinimums[2]
          const minLeftCombined = minPanel1 + minPanel2
          const maxLeftCombined = 100 - minPanel3
          const clampedLeft = Math.max(minLeftCombined, Math.min(percentage, maxLeftCombined))
          const nextPanel3 = 100 - clampedLeft
          let nextPanel1 = currentActualWidths[0]
          let nextPanel2 = clampedLeft - nextPanel1
          if (nextPanel2 < minPanel2) {
            nextPanel2 = minPanel2
            nextPanel1 = clampedLeft - nextPanel2
          }
          if (nextPanel1 < minPanel1) {
            nextPanel1 = minPanel1
            nextPanel2 = Math.max(minPanel2, clampedLeft - nextPanel1)
          }
          nextWidths[0] = nextPanel1
          nextWidths[1] = nextPanel2
          nextWidths[2] = nextPanel3
        }
      }

      pushWidthsIfChanged(nextWidths as [number, number, number])

      if (pendingMouseEventRef.current !== event) {
        resizeRafRef.current = window.requestAnimationFrame(processResize)
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      pendingMouseEventRef.current = e
      if (resizeRafRef.current === null) {
        resizeRafRef.current = window.requestAnimationFrame(processResize)
      }
    }

    const handleMouseUp = () => {
      setResizingIndex(null)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }

    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      cancelScheduledResize()
      pendingMouseEventRef.current = null
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }
  }, [resizingIndex, getMinWidthPercent])

  const actualWidths = computeActualWidths(widths, collapsed, containerWidth, COLLAPSED_WIDTH)

  const transitionClass =
    resizingIndex !== null
      ? "transition-none"
      : isAnimatingCollapse
        ? "transition-all duration-300 ease-in-out"
        : "transition-all duration-75"

  return (
    <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
      <div
        className={`overflow-hidden bg-muted ${transitionClass} flex flex-col`}
        style={{
          width: `${actualWidths[0]}%`,
        }}
      >
        <PanelHeader
          title={panel1Title}
          collapsed={collapsed[0]}
          onToggle={() => toggleCollapse(0)}
          onHeaderMouseDown={(event) => startHeaderInteraction(0, event)}
        />
        {collapsed[0] ? (
          <div className="mx-auto flex flex-1 items-start justify-start px-0 py-4">
            <span
              className="font-mono whitespace-nowrap text-2xl font-thin tracking-[0.2em] transition-all duration-300"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              {panel1Title}
            </span>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">{panel1}</div>
        )}
      </div>

      <div
        className={cn(
          "group relative z-10 -mx-2 flex w-5 flex-shrink-0 cursor-col-resize items-center justify-center transition-colors",
          resizingIndex === 0 ? "bg-blue-50/60" : "bg-transparent",
        )}
        data-panel-divider="true"
        onMouseDown={(e) => {
          e.preventDefault()
          setResizingIndex(0)
        }}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors",
            resizingIndex === 0 ? "bg-blue-500" : "bg-border group-hover:bg-blue-500",
          )}
        />

        <div
          className={cn(
            "absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-0.5 transition-opacity",
            resizingIndex === 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <div
            className={cn(
              "h-8 w-0.5 rounded-full transition-colors",
              resizingIndex === 0 ? "bg-blue-500" : "bg-border group-hover:bg-blue-500",
            )}
          />
          <div
            className={cn(
              "h-8 w-0.5 rounded-full transition-colors",
              resizingIndex === 0 ? "bg-blue-500" : "bg-border group-hover:bg-blue-500",
            )}
          />
        </div>
      </div>

      <div
        className={`overflow-hidden ${transitionClass} flex flex-col bg-muted`}
        style={{
          width: `${actualWidths[1]}%`,
        }}
      >
        <PanelHeader
          title={panel2Title}
          collapsed={collapsed[1]}
          onToggle={() => toggleCollapse(1)}
          onHeaderMouseDown={(event) => startHeaderInteraction(1, event)}
        />
        {collapsed[1] ? (
          <div className="mx-auto flex flex-1 items-start justify-start bg-muted px-0 py-4 font-mono">
            <span
              className="font-mono whitespace-nowrap text-2xl font-extralight leading-5 tracking-[0.2em] transition-all duration-300"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              {panel2Title}
            </span>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">{panel2}</div>
        )}
      </div>

      <div
        className={cn(
          "group relative z-10 -mx-2 flex w-5 flex-shrink-0 cursor-col-resize items-center justify-center transition-colors",
          resizingIndex === 1 ? "bg-blue-50/60" : "bg-transparent",
        )}
        data-panel-divider="true"
        onMouseDown={(e) => {
          e.preventDefault()
          setResizingIndex(1)
        }}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors",
            resizingIndex === 1 ? "bg-blue-500" : "bg-border group-hover:bg-blue-500",
          )}
        />

        <div
          className={cn(
            "absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-0.5 transition-opacity",
            resizingIndex === 1 ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <div
            className={cn(
              "h-8 w-0.5 rounded-full transition-colors",
              resizingIndex === 1 ? "bg-blue-500" : "bg-border group-hover:bg-blue-500",
            )}
          />
          <div
            className={cn(
              "h-8 w-0.5 rounded-full transition-colors",
              resizingIndex === 1 ? "bg-blue-500" : "bg-border group-hover:bg-blue-500",
            )}
          />
        </div>
      </div>

      <div
        className={`overflow-hidden ${transitionClass} flex flex-col bg-muted`}
        style={{
          width: `${actualWidths[2]}%`,
        }}
      >
        <PanelHeader
          title={panel3Title}
          collapsed={collapsed[2]}
          onToggle={() => toggleCollapse(2)}
          onHeaderMouseDown={(event) => startHeaderInteraction(2, event)}
        />
        {collapsed[2] ? (
          <div className="mx-auto flex flex-1 items-start justify-start bg-muted px-0 py-4">
            <span
              className="font-mono whitespace-nowrap text-2xl font-extralight tracking-[0.2em] transition-all duration-300"
              style={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
              }}
            >
              {panel3Title}
            </span>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">{panel3}</div>
        )}
      </div>
    </div>
  )
}

function computeActualWidths(
  widths: [number, number, number],
  collapsed: [boolean, boolean, boolean],
  containerWidth: number | null,
  collapsedWidthPx: number,
): [number, number, number] {
  if (!containerWidth || containerWidth <= 0) {
    return widths
  }

  const collapsedWidthPercent = (collapsedWidthPx / containerWidth) * 100
  const numCollapsed = collapsed.filter(Boolean).length
  const numExpanded = 3 - numCollapsed

  if (numExpanded === 0) {
    return [collapsedWidthPercent, collapsedWidthPercent, collapsedWidthPercent]
  }

  const collapsedSpace = numCollapsed * collapsedWidthPercent
  const availableSpace = 100 - collapsedSpace
  const expandedWidthsSum = widths.reduce((sum, w, i) => (collapsed[i] ? sum : sum + w), 0)

  return widths.map((w, i) => {
    if (collapsed[i]) {
      return collapsedWidthPercent
    }
    return expandedWidthsSum === 0 ? availableSpace / numExpanded : (w / expandedWidthsSum) * availableSpace
  }) as [number, number, number]
}
