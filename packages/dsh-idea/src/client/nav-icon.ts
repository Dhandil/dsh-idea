/**
 * The Settings nav glyph adaptation (T9R2 R2). The settings shell hardcodes
 * every nav icon by section id — `navIcon()` in ui-settings-general — and
 * unknown ids fall back to the settings gear; the slot contract offers no
 * icon option, and the shell is frozen. This installer keeps the Ideas nav
 * row's glyph in step with the conversation Idea action: it swaps the row's
 * SVG for the shared lightbulb whenever the settings dialog renders, and
 * re-applies after the shell re-renders the row. Matching is exact-label
 * (the localized nav text) inside the settings dialog's nav, so no other
 * section is touched.
 * @module @dsh-external/dsh-idea/client/nav-icon
 */

import { ideaLightbulbSvgElement } from './icons.tsx'

/**
 * Watch the document for the Ideas settings nav row and upgrade its glyph.
 * @param label - The section's exact nav label (the localized `read.nav`).
 * @returns The disposer, stopping the observation (already-swapped nodes
 * are self-contained and die with the dialog).
 */
export function installIdeaNavIcon(label: string): () => void {
  const upgrade = (): void => {
    // Cheap exit while no settings dialog exists; the scan itself is the
    // dialog's handful of nav buttons.
    for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button'))) {
      if ((button.textContent ?? '').trim() !== label) continue
      const current = button.querySelector('svg')
      if (current === null || current.dataset.dshIdeaIcon === 'bulb') continue
      const replacement = ideaLightbulbSvgElement(current.getAttribute('class') ?? undefined)
      const width = current.getAttribute('width')
      const height = current.getAttribute('height')
      if (width !== null) replacement.setAttribute('width', width)
      if (height !== null) replacement.setAttribute('height', height)
      current.replaceWith(replacement)
    }
  }
  const observer = new MutationObserver(upgrade)
  observer.observe(document.body, { childList: true, subtree: true })
  upgrade()
  return () => { observer.disconnect() }
}
