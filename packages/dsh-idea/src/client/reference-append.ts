/**
 * Appending an Idea reference to the live composer draft: one official
 * edit path only — the session input facade's `insertReference` with a
 * pick-time span CAS. The separating space before the chip is inserted
 * through the scoped plain-text edit event first, the draft revision is
 * re-read afterwards, and any CAS failure reports a localized failure while
 * keeping every surface open — the draft is never reconstructed via
 * `setDraft`, and nothing is ever submitted.
 * @module @dsh-external/dsh-idea/client/reference-append
 */

import type { IdeaReferenceDescriptor } from '../reference/types.ts'

/** The draft facts the append math reads (a structural slice of InputState). */
export interface ReferenceDraftSnapshot {
  /** The clipboard projection of the editor document. */
  draft: string
  /** The monotonic revision the CAS spans target. */
  draftRev: number
  /** Clipboard-coordinate occurrences; a chip occupies its clipboard length. */
  occurrences: readonly { length: number }[]
}

/** The structural face of the session input facade the append path uses. */
export interface ReferenceAppendInput {
  readonly state: { getSnapshot(): ReferenceDraftSnapshot }
  insertReference(
    ref: { source: string; ref: string; label: string; clipboardText: string },
    span: { start: number; end: number; draftRev: number },
  ): boolean
  /** Surface the localized failure copy when an append does not apply. */
  notify(level: 'info' | 'error', text: string): void
}

/** One pick-time plain-text edit (the scoped bail event, wrapped). */
export type ReferenceInsertText = (text: string, span: { start: number; end: number; draftRev: number }) => boolean

/** The append seams: the input facade plus the plain-text edit verb. */
export interface ReferenceAppendSeams {
  input: ReferenceAppendInput
  insertText: ReferenceInsertText
}

/**
 * The detect-coordinate draft length: chips occupy exactly one editor
 * position each, so every clipboard occurrence contributes its length minus
 * one extra clipboard character.
 */
function detectLengthOf(snapshot: ReferenceDraftSnapshot): number {
  const extra = snapshot.occurrences.reduce((sum, occurrence) => sum + (occurrence.length - 1), 0)
  return snapshot.draft.length - extra
}

/**
 * Append one Idea reference chip to the end of the draft. A separating
 * space is inserted first when the draft ends with visible content; the
 * draft revision is re-read after that edit, so the chip insertion always
 * carries a fresh CAS span. Returns whether the whole append applied; a
 * failure means the caller keeps every surface open and reports locally.
 */
export function appendIdeaReference(seams: ReferenceAppendSeams, descriptor: IdeaReferenceDescriptor): boolean {
  const snapshot = seams.input.state.getSnapshot()
  const length = detectLengthOf(snapshot)
  let span: { start: number; end: number; draftRev: number } = {
    start: length,
    end: length,
    draftRev: snapshot.draftRev,
  }
  const lastChar = length > 0 ? snapshot.draft.at(-1) : undefined
  if (lastChar !== undefined && !/\s/.test(lastChar)) {
    if (!seams.insertText(' ', span)) return false
    const fresh = seams.input.state.getSnapshot()
    const freshLength = detectLengthOf(fresh)
    span = { start: freshLength, end: freshLength, draftRev: fresh.draftRev }
  }
  return seams.input.insertReference(
    { source: 'idea', ref: descriptor.mention, label: descriptor.label, clipboardText: descriptor.mention },
    span,
  )
}

/**
 * Append and surface the localized failure copy through the input notice on
 * failure. The card stays open either way; nothing is ever submitted.
 */
export function appendIdeaReferenceNotified(
  seams: ReferenceAppendSeams,
  descriptor: IdeaReferenceDescriptor,
  failureCopy: string,
): boolean {
  const applied = appendIdeaReference(seams, descriptor)
  if (!applied) seams.input.notify('error', failureCopy)
  return applied
}