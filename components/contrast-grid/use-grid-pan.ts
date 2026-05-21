"use client"

import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react"

const SCROLL_DELTA_EPSILON = 0.5

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

// Walk up the DOM to find the first ancestor that can actually scroll on the requested axis.
const findScrollableParent = (node: HTMLElement | null, axis: "x" | "y"): HTMLElement | null => {
  let current: HTMLElement | null = node
  while (current) {
    const hasRoom =
      axis === "x"
        ? current.scrollWidth - current.clientWidth > SCROLL_DELTA_EPSILON
        : current.scrollHeight - current.clientHeight > SCROLL_DELTA_EPSILON
    if (hasRoom) {
      return current
    }
    current = current.parentElement
  }
  return null
}

// Apply a drag delta to a scrollable element; return any remaining distance when clamped at the edges.
const applyPanToAxis = (target: HTMLElement, delta: number, axis: "x" | "y") => {
  const total = axis === "x" ? target.scrollWidth : target.scrollHeight
  const viewport = axis === "x" ? target.clientWidth : target.clientHeight
  if (total <= viewport + SCROLL_DELTA_EPSILON) {
    return delta
  }
  const current = axis === "x" ? target.scrollLeft : target.scrollTop
  const desired = current - delta
  const clamped = clamp(desired, 0, Math.max(0, total - viewport))
  if (axis === "x") {
    target.scrollLeft = clamped
  } else {
    target.scrollTop = clamped
  }
  return desired - clamped
}

type UseGridPanOptions = {
  /** Element that hosts the pan gesture (also the pointermove target). */
  scrollNodeRef: RefObject<HTMLElement | null>
  /** Called with `true` on pan start and `false` on pan end / unmount. Optional. */
  onMiddlePanChange?: (active: boolean) => void
}

type UseGridPanResult = {
  /** Currently middle-button panning (drives the grabbing cursor). */
  isMiddlePanning: boolean
  /**
   * Synchronous mirror of `isMiddlePanning`. Consumers can read `.current` from
   * inside event handlers (e.g. the overlay-close pointerdown) to suppress
   * actions while a pan is in flight.
   */
  isMiddlePanningRef: MutableRefObject<boolean>
}

/**
 * Middle-button "grab to pan" for the contrast matrix:
 *   - On middle-mouse pointerdown over the scroll node, capture the pointer
 *     and start a panning gesture.
 *   - Subsequent pointermove deltas are queued into a single RAF tick that
 *     scrolls the nearest horizontal-overflow ancestor (for X) and
 *     vertical-overflow ancestor (for Y), falling back to the document.
 *   - pointerup / pointercancel / window blur ends the gesture.
 *
 * Behaviour is identical to the inline implementation that previously lived in
 * ContrastGrid; the only thing changing is where the code lives.
 */
export function useGridPan({
  scrollNodeRef,
  onMiddlePanChange,
}: UseGridPanOptions): UseGridPanResult {
  const [isMiddlePanning, setIsMiddlePanning] = useState(false)
  const isMiddlePanningRef = useRef(false)
  const onMiddlePanChangeRef = useRef(onMiddlePanChange)
  useEffect(() => {
    onMiddlePanChangeRef.current = onMiddlePanChange
  }, [onMiddlePanChange])

  const panStateRef = useRef<{
    active: boolean
    lastX: number
    lastY: number
    pendingX: number
    pendingY: number
    animationFrameId: number | null
    xTarget: HTMLElement | null
    yTarget: HTMLElement | null
    pointerId: number | null
  }>({
    active: false,
    lastX: 0,
    lastY: 0,
    pendingX: 0,
    pendingY: 0,
    animationFrameId: null,
    xTarget: null,
    yTarget: null,
    pointerId: null,
  })

  useEffect(() => {
    const scrollNode = scrollNodeRef.current
    if (!scrollNode) {
      return
    }

    const applyPendingPan = () => {
      const state = panStateRef.current
      state.animationFrameId = null
      if (!state.active) {
        state.pendingX = 0
        state.pendingY = 0
        return
      }

      const dx = state.pendingX
      const dy = state.pendingY
      state.pendingX = 0
      state.pendingY = 0

      let leftoverX = dx
      let leftoverY = dy

      if (state.xTarget) {
        leftoverX = applyPanToAxis(state.xTarget, dx, "x")
      }

      if (state.yTarget) {
        leftoverY = applyPanToAxis(state.yTarget, dy, "y")
      }

      if (Math.abs(leftoverX) > SCROLL_DELTA_EPSILON || Math.abs(leftoverY) > SCROLL_DELTA_EPSILON) {
        const scrollingElement = document.scrollingElement
        if (scrollingElement) {
          scrollingElement.scrollLeft -= leftoverX
          scrollingElement.scrollTop -= leftoverY
        } else {
          window.scrollBy(-leftoverX, -leftoverY)
        }
      }
    }

    const stopPanning = () => {
      if (!panStateRef.current.active) return
      if (panStateRef.current.animationFrameId !== null) {
        window.cancelAnimationFrame(panStateRef.current.animationFrameId)
        panStateRef.current.animationFrameId = null
      }
      applyPendingPan()
      panStateRef.current.active = false
      setIsMiddlePanning(false)
      isMiddlePanningRef.current = false
      onMiddlePanChangeRef.current?.(false)
      if (panStateRef.current.pointerId !== null) {
        try {
          scrollNode.releasePointerCapture?.(panStateRef.current.pointerId)
        } catch {
          // ignore if capture was not set
        }
      }
      panStateRef.current.xTarget = null
      panStateRef.current.yTarget = null
      panStateRef.current.pointerId = null
      panStateRef.current.pendingX = 0
      panStateRef.current.pendingY = 0
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopPanning)
      window.removeEventListener("pointercancel", stopPanning)
      window.removeEventListener("blur", stopPanning)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const state = panStateRef.current
      if (!state.active) return
      event.preventDefault()
      state.pendingX += event.clientX - state.lastX
      state.pendingY += event.clientY - state.lastY
      state.lastX = event.clientX
      state.lastY = event.clientY
      if (state.animationFrameId === null) {
        state.animationFrameId = window.requestAnimationFrame(applyPendingPan)
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 1) {
        return
      }
      event.preventDefault()
      event.stopPropagation()

      const xTarget = findScrollableParent(scrollNode, "x") ?? scrollNode
      const yTarget = findScrollableParent(scrollNode, "y") ?? scrollNode

      panStateRef.current = {
        active: true,
        lastX: event.clientX,
        lastY: event.clientY,
        pendingX: 0,
        pendingY: 0,
        animationFrameId: null,
        xTarget,
        yTarget,
        pointerId: event.pointerId,
      }
      setIsMiddlePanning(true)
      isMiddlePanningRef.current = true
      onMiddlePanChangeRef.current?.(true)
      try {
        scrollNode.setPointerCapture?.(event.pointerId)
      } catch {
        // ignore if capture fails
      }
      window.addEventListener("pointermove", handlePointerMove, { passive: false })
      window.addEventListener("pointerup", stopPanning)
      window.addEventListener("pointercancel", stopPanning)
      window.addEventListener("blur", stopPanning)
    }

    scrollNode.addEventListener("pointerdown", handlePointerDown)
    return () => {
      stopPanning()
      onMiddlePanChangeRef.current?.(false)
      scrollNode.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopPanning)
      window.removeEventListener("pointercancel", stopPanning)
      window.removeEventListener("blur", stopPanning)
    }
  }, [scrollNodeRef])

  return { isMiddlePanning, isMiddlePanningRef }
}
