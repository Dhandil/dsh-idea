/**
 * Referenced-Idea model projection types: what one pinned Idea version
 * contributes to the model as untrusted background — the exact pinned
 * version only, never history, source bodies, or evolution events — plus
 * the shared wire descriptor a reference carries everywhere.
 * @module @dsh-external/dsh-idea/src/reference/types
 */

/** The wire descriptor of one pinned Idea version, shared by all surfaces. */
export interface IdeaReferenceDescriptor {
  ideaId: string
  versionId: string
  /** The display title at pin (or listing) time. */
  label: string
  /** The canonical `@[label](dsh-idea:...)` mention text. */
  mention: string
}

/** The serialized content projection of one referenced Idea version. */
export interface ReferencedIdeaProjection {
  ideaId: string
  versionId: string
  title: string
  core?: string
  motivation?: string
  currentConclusion?: string
  possibleValue?: string
  useWhen?: readonly string[]
  openQuestions?: readonly string[]
}
