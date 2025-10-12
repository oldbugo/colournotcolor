"use client"

import { useState, useRef, useEffect, type ReactNode } from "react"
import { Maximize2, Minimize2 } from "lucide-react"

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
  panel2Title = "Color Manager",
  panel3Title = "Contrast Matrix",
}: ResizablePanelsProps) {
  const [collapsed, setCollapsed] = useState<[boolean, boolean, boolean]>([false, false, false])
  const [widths, setWidths] = useState(defaultWidths)
  const [resizingIndex, setResizingIndex] = useState<number | null>(null)
  const [isAnimatingCollapse, setIsAnimatingCollapse] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const COLLAPSED_WIDTH = 80
  const MIN_WIDTH_THRESHOLD = 15

  const toggleCollapse = (index: 0 | 1 | 2) => {
    setIsAnimatingCollapse(true)
    const newCollapsed = [...collapsed] as [boolean, boolean, boolean]
    const wasCollapsed = collapsed[index]
    newCollapsed[index] = !newCollapsed[index]

    if (!containerRef.current) {
      setCollapsed(newCollapsed)
      setTimeout(() => setIsAnimatingCollapse(false), 300)
      return
    }

    const containerWidth = containerRef.current.getBoundingClientRect().width
    const collapsedWidthPercent = (COLLAPSED_WIDTH / containerWidth) * 100

    if (wasCollapsed) {
      // Expanding: take space proportionally from other expanded panels
      const expandedIndices = collapsed.map((c, i) => (i !== index && !c ? i : -1)).filter((i) => i !== -1)

      if (expandedIndices.length > 0) {
        const spaceToTake = widths[index] - collapsedWidthPercent
        const totalExpandedWidth = expandedIndices.reduce((sum, i) => sum + widths[i], 0)

        const newWidths = [...widths] as [number, number, number]
        expandedIndices.forEach((i) => {
          const proportion = widths[i] / totalExpandedWidth
          newWidths[i] = widths[i] - spaceToTake * proportion
        })
        setWidths(newWidths)
      }
    } else {
      // Collapsing: distribute freed space proportionally to other expanded panels
      const expandedIndices = newCollapsed.map((c, i) => (i !== index && !c ? i : -1)).filter((i) => i !== -1)

      if (expandedIndices.length > 0) {
        const freedSpace = widths[index] - collapsedWidthPercent
        const totalExpandedWidth = expandedIndices.reduce((sum, i) => sum + widths[i], 0)

        const newWidths = [...widths] as [number, number, number]
        expandedIndices.forEach((i) => {
          const proportion = widths[i] / totalExpandedWidth
          newWidths[i] = widths[i] + freedSpace * proportion
        })
        setWidths(newWidths)
      }
    }

    setCollapsed(newCollapsed)
    setTimeout(() => setIsAnimatingCollapse(false), 300)
  }

  const getActualWidths = () => {
    if (!containerRef.current) return widths

    const containerWidth = containerRef.current.getBoundingClientRect().width
    const collapsedWidthPercent = (COLLAPSED_WIDTH / containerWidth) * 100

    const numCollapsed = collapsed.filter(Boolean).length
    const numExpanded = 3 - numCollapsed

    if (numExpanded === 0) {
      return [collapsedWidthPercent, collapsedWidthPercent, collapsedWidthPercent] as [number, number, number]
    }

    const collapsedSpace = numCollapsed * collapsedWidthPercent
    const availableSpace = 100 - collapsedSpace

    const expandedWidthsSum = widths.reduce((sum, w, i) => (collapsed[i] ? sum : sum + w), 0)

    return widths.map((w, i) => {
      if (collapsed[i]) {
        return collapsedWidthPercent
      }
      return (w / expandedWidthsSum) * availableSpace
    }) as [number, number, number]
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizingIndex === null || !containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - containerRect.left
      const percentage = (mouseX / containerRect.width) * 100

      const currentActualWidths = getActualWidths()

      if (resizingIndex === 0) {
        // Dragging divider 1 (between panel 1 and panel 2)

        if (collapsed[0]) {
          return
        }

        if (collapsed[1]) {
          // Panel 2 collapsed: resize panels 1 and 3
          const panel2Width = currentActualWidths[1]
          const availableForPanels13 = 100 - panel2Width

          const desiredPanel1Width = Math.max(
            MIN_WIDTH_THRESHOLD,
            Math.min(percentage, availableForPanels13 - MIN_WIDTH_THRESHOLD),
          )
          const desiredPanel3Width = availableForPanels13 - desiredPanel1Width

          setWidths([desiredPanel1Width, widths[1], desiredPanel3Width])
        } else {
          // Normal case: both panels 1 and 2 expanded
          let newWidth1 = percentage
          let newWidth2 = currentActualWidths[1]
          let newWidth3 = currentActualWidths[2]

          // Clamp panel 1 to min width
          if (newWidth1 < MIN_WIDTH_THRESHOLD) {
            newWidth1 = MIN_WIDTH_THRESHOLD
          }

          // Calculate what panel 2 would be
          const desiredWidth2 = 100 - newWidth1 - newWidth3

          if (desiredWidth2 < MIN_WIDTH_THRESHOLD) {
            // Panel 2 would be too small, try to take from panel 3
            newWidth2 = MIN_WIDTH_THRESHOLD
            newWidth3 = 100 - newWidth1 - newWidth2

            if (newWidth3 < MIN_WIDTH_THRESHOLD) {
              // Can't shrink panel 3 further, stop panel 1 from expanding
              newWidth3 = MIN_WIDTH_THRESHOLD
              newWidth1 = 100 - newWidth2 - newWidth3
            }
          } else {
            newWidth2 = desiredWidth2
          }

          setWidths([newWidth1, newWidth2, newWidth3])
        }
      } else if (resizingIndex === 1) {
        // Dragging divider 2 (between panel 2 and panel 3)

        if (collapsed[2]) {
          return
        }

        if (collapsed[1]) {
          // Panel 2 collapsed: resize panels 1 and 3
          const panel2Width = currentActualWidths[1]
          const availableForPanels13 = 100 - panel2Width

          const divider2Position = currentActualWidths[0] + panel2Width
          const desiredPanel1Width = Math.max(
            MIN_WIDTH_THRESHOLD,
            Math.min(percentage - panel2Width, availableForPanels13 - MIN_WIDTH_THRESHOLD),
          )
          const desiredPanel3Width = availableForPanels13 - desiredPanel1Width

          setWidths([desiredPanel1Width, widths[1], desiredPanel3Width])
        } else {
          // Normal case: both panels 2 and 3 expanded
          let newWidth1 = currentActualWidths[0]
          let newWidth2 = percentage - newWidth1
          let newWidth3 = 100 - percentage

          // Clamp panel 3 to min width
          if (newWidth3 < MIN_WIDTH_THRESHOLD) {
            newWidth3 = MIN_WIDTH_THRESHOLD
            newWidth2 = 100 - newWidth1 - newWidth3
          }

          // Clamp panel 2 to min width
          if (newWidth2 < MIN_WIDTH_THRESHOLD) {
            newWidth2 = MIN_WIDTH_THRESHOLD
            // Try to take from panel 1
            newWidth1 = 100 - newWidth2 - newWidth3

            if (newWidth1 < MIN_WIDTH_THRESHOLD) {
              // Can't shrink panel 1 further, stop panel 3 from expanding
              newWidth1 = MIN_WIDTH_THRESHOLD
              newWidth3 = 100 - newWidth1 - newWidth2
            }
          }

          setWidths([newWidth1, newWidth2, newWidth3])
        }
      }
    }

    const handleMouseUp = () => {
      setResizingIndex(null)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }

    if (resizingIndex !== null) {
      document.body.style.userSelect = "none"
      document.body.style.cursor = "col-resize"
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [resizingIndex, widths, collapsed])

  const actualWidths = getActualWidths()

  const transitionClass =
    resizingIndex !== null
      ? "transition-none"
      : isAnimatingCollapse
        ? "transition-all duration-300 ease-in-out"
        : "transition-all duration-75"

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden relative">
      {/* Panel 1 */}
      <div
        className={`overflow-hidden bg-muted ${transitionClass} flex flex-col`}
        style={{
          width: `${actualWidths[0]}%`,
        }}
      >
        <div
          className="flex items-center justify-center p-2 border-b bg-background flex-shrink-0 cursor-pointer hover:bg-accent transition-colors h-10 px-6"
          onClick={() => toggleCollapse(0)}
          title={collapsed[0] ? `Expand ${panel1Title}` : `Collapse ${panel1Title}`}
        >
          {collapsed[0] ? (
            <div className="transition-all duration-300 w-full flex justify-center">
              <Maximize2 className="h-4 w-4" />
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full">
              <div className="transition-all duration-300">
                <Minimize2 className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold">{panel1Title}</span>
            </div>
          )}
        </div>
        {collapsed[0] ? (
          <div className="flex-1 flex justify-start items-start px-0 py-4 mx-auto">
            <span
              className="font-mono whitespace-nowrap transition-all duration-300 font-thin text-4xl tracking-widest"
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

      {/* Divider 1 */}
      <div
        className="w-6 flex-shrink-0 cursor-col-resize group relative flex items-center justify-center -mx-3 z-10"
        onMouseDown={(e) => {
          e.preventDefault()
          setResizingIndex(0)
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-10 border-b bg-background" />

        {/* Thin visual line */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border group-hover:bg-blue-500 transition-colors" />

        {/* Double bar indicator in the middle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-0.5 h-8 bg-border group-hover:bg-blue-500 rounded-full transition-colors" />
          <div className="w-0.5 h-8 bg-border group-hover:bg-blue-500 rounded-full transition-colors" />
        </div>
      </div>

      {/* Panel 2 */}
      <div
        className={`overflow-hidden ${transitionClass} flex flex-col bg-muted`}
        style={{
          width: `${actualWidths[1]}%`,
        }}
      >
        <div
          className="flex items-center justify-center p-2 border-b bg-background flex-shrink-0 cursor-pointer hover:bg-accent transition-colors h-10 px-6"
          onClick={() => toggleCollapse(1)}
          title={collapsed[1] ? `Expand ${panel2Title}` : `Collapse ${panel2Title}`}
        >
          {collapsed[1] ? (
            <div className="transition-all duration-300 w-full flex justify-center">
              <Maximize2 className="h-4 w-4" />
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full">
              <div className="transition-all duration-300">
                <Minimize2 className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold">{panel2Title}</span>
            </div>
          )}
        </div>
        {collapsed[1] ? (
          <div className="flex-1 flex justify-start bg-muted mx-auto px-0 py-4 font-mono items-start">
            <span
              className="font-mono whitespace-nowrap transition-all duration-300 tracking-widest leading-7 font-extralight text-4xl"
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

      {/* Divider 2 */}
      <div
        className="w-6 flex-shrink-0 cursor-col-resize group relative flex items-center justify-center -mx-3 z-10"
        onMouseDown={(e) => {
          e.preventDefault()
          setResizingIndex(1)
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-10 border-b bg-background" />

        {/* Thin visual line */}
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border group-hover:bg-blue-500 transition-colors" />

        {/* Double bar indicator in the middle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-0.5 h-8 bg-border group-hover:bg-blue-500 rounded-full transition-colors" />
          <div className="w-0.5 h-8 bg-border group-hover:bg-blue-500 rounded-full transition-colors" />
        </div>
      </div>

      {/* Panel 3 */}
      <div
        className={`overflow-hidden ${transitionClass} flex flex-col bg-muted`}
        style={{
          width: `${actualWidths[2]}%`,
        }}
      >
        <div
          className="flex items-center justify-center p-2 border-b bg-background flex-shrink-0 cursor-pointer hover:bg-accent transition-colors h-10 px-6"
          onClick={() => toggleCollapse(2)}
          title={collapsed[2] ? `Expand ${panel3Title}` : `Collapse ${panel3Title}`}
        >
          {collapsed[2] ? (
            <div className="transition-all duration-300 w-full flex justify-center">
              <Maximize2 className="h-4 w-4" />
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full">
              <div className="transition-all duration-300">
                <Minimize2 className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold">{panel3Title}</span>
            </div>
          )}
        </div>
        {collapsed[2] ? (
          <div className="flex-1 flex justify-start bg-muted items-start px-0 py-4 mx-auto">
            <span
              className="font-mono whitespace-nowrap transition-all duration-300 text-4xl font-extralight tracking-widest"
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
