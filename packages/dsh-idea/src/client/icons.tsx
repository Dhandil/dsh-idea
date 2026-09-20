/**
 * The feature-owned lightbulb glyph. The primitives set has no lightbulb —
 * its `IconLightOutline16` draws a brightness/sun ring, which read as the
 * wrong semantic on the Idea action (T9R2 R1). One source of truth here
 * feeds both the conversation Idea action and the Settings Ideas nav row
 * (T9R2 R2), in the primitives' own conventions: 16 viewBox, currentColor,
 * fill-carried outline geometry.
 * @module @dsh-external/dsh-idea/client/icons
 */

import type { ReactNode } from 'react'

/** The bulb glass: an even-odd ring (outer silhouette minus inner). */
export const IDEA_BULB_GLASS_PATH =
  'M8 1.1C4.752 1.1 2.1 3.752 2.1 7C2.1 9.096 3.29 10.9 5.05 11.748V12.4H10.95V11.748C12.71 10.9 13.9 9.096 13.9 7C13.9 3.752 11.248 1.1 8 1.1Z'
  + 'M8 2.3C10.581 2.3 12.7 4.419 12.7 7C12.7 8.512 11.95 9.855 10.75 10.654V11.2H5.25V10.654C4.05 9.855 3.3 8.512 3.3 7C3.3 4.419 5.419 2.3 8 2.3Z'

/** The bulb base: one small rounded block under the glass. */
export const IDEA_BULB_BASE_PATH =
  'M5.8 13.2H10.2V13.7C10.2 14.141 9.841 14.5 9.4 14.5H6.6C6.159 14.5 5.8 14.141 5.8 13.7V13.2Z'

/**
 * The shared lightbulb icon component (primitives `IconProps` shape, so it
 * passes anywhere a shared icon is expected — the `idea` command included).
 */
export function IdeaLightbulbIcon({ size = 16, className }: { size?: number | undefined, className?: string | undefined }): ReactNode {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d={IDEA_BULB_GLASS_PATH} fill="currentColor" />
      <path d={IDEA_BULB_BASE_PATH} fill="currentColor" />
    </svg>
  )
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * The DOM twin of {@link IdeaLightbulbIcon} for the shell nav adaptation,
 * which patches imperative SVG nodes. Tagged with `data-dsh-idea-icon` so
 * the upgrade pass is idempotent.
 */
export function ideaLightbulbSvgElement(className?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')
  if (className !== undefined && className.length > 0) svg.setAttribute('class', className)
  const glass = document.createElementNS(SVG_NS, 'path')
  glass.setAttribute('fill-rule', 'evenodd')
  glass.setAttribute('clip-rule', 'evenodd')
  glass.setAttribute('d', IDEA_BULB_GLASS_PATH)
  glass.setAttribute('fill', 'currentColor')
  const base = document.createElementNS(SVG_NS, 'path')
  base.setAttribute('d', IDEA_BULB_BASE_PATH)
  base.setAttribute('fill', 'currentColor')
  svg.append(glass, base)
  svg.dataset.dshIdeaIcon = 'bulb'
  return svg
}
