/**
 * The feature-owned anchored preview card. The Harness HoverCard portals its
 * card at z-index 100 — below the settings Modal's full-viewport mask
 * (modal layer z-index 1000) — which left the card's quick action unclickable
 * whenever the library is shown inside that modal (found in real-browser
 * testing). This copy keeps the primitive's interaction contract (dwell
 * before open, pointer grace before close, fixed placement at the anchor's
 * right edge with a bottom clamp) but lifts the card above the modal layer.
 * @module @dsh-external/dsh-idea/client/hover-card
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function IdeaHoverCard(
  {
    anchor, content, openDelayMs = 400, graceMs = 200,
  }: {
    anchor: ReactNode
    content: ReactNode
    openDelayMs?: number
    graceMs?: number
  },
): ReactNode {
  const rootRef = useRef<HTMLSpanElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const dwellRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const cancelGrace = () => {
    if (graceRef.current !== null) {
      clearTimeout(graceRef.current)
      graceRef.current = null
    }
  }
  const clearAll = () => {
    if (dwellRef.current !== null) {
      clearTimeout(dwellRef.current)
      dwellRef.current = null
    }
    cancelGrace()
  }
  useEffect(() => clearAll, [])

  // Fixed-position from the anchor rect before paint; track the anchor while
  // open (capture-phase scroll catches nested panes), as in the primitive.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const place = () => {
      const wrapper = rootRef.current
      if (wrapper === null) return
      const r = wrapper.getBoundingClientRect()
      const h = cardRef.current?.offsetHeight ?? 0
      const top = r.top + h > window.innerHeight - 8 ? window.innerHeight - h - 8 : r.top
      setPos({ left: r.right + 8, top })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // The first placement ran before the card mounted (height read 0): correct
  // the bottom-edge clamp once the real height is measurable.
  useLayoutEffect(() => {
    if (!open || pos === null) return
    const h = cardRef.current?.offsetHeight ?? 0
    if (h > 0 && pos.top + h > window.innerHeight - 8) {
      setPos({ left: pos.left, top: window.innerHeight - h - 8 })
    }
  }, [open, pos])

  const card = open && pos !== null && (
    <div
      ref={cardRef}
      className="dsh-idea-hover-card"
      style={pos}
      onPointerEnter={cancelGrace}
      onPointerLeave={() => {
        cancelGrace()
        graceRef.current = setTimeout(() => { setOpen(false) }, graceMs)
      }}
    >
      {content}
    </div>
  )

  return (
    <span
      ref={rootRef}
      className="dsh-idea-hover-root"
      onPointerEnter={() => {
        cancelGrace()
        if (open) return
        if (dwellRef.current !== null) clearTimeout(dwellRef.current)
        dwellRef.current = setTimeout(() => { setOpen(true) }, openDelayMs)
      }}
      onPointerLeave={() => {
        if (dwellRef.current !== null) {
          clearTimeout(dwellRef.current)
          dwellRef.current = null
        }
        if (open) {
          cancelGrace()
          graceRef.current = setTimeout(() => { setOpen(false) }, graceMs)
        }
      }}
      // A press inside the anchor dismisses the card immediately; a press on
      // the card itself starts an interaction there and must keep it mounted.
      onPointerDownCapture={(e) => {
        if (cardRef.current?.contains(e.target as Node)) return
        clearAll()
        setOpen(false)
      }}
    >
      {anchor}
      {createPortal(card, document.body)}
    </span>
  )
}
