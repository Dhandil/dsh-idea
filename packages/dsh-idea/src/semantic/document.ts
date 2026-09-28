/**
 * The deterministic semantic document: a pure projection of one exact
 * `IdeaVersion` draft in a frozen fixed field order, joined with fixed
 * separators. Same draft content + same document version → byte-identical
 * UTF-8 output, so the persisted `contentHash` (SHA-256 over the exact
 * bytes) is a complete identity of what was embedded. Deliberately
 * transcript-free: no LLM, no source-discussion context, no conversation
 * history, no historical versions, no judge output, no budget data — the
 * document contains only what the Idea itself says it is.
 * @module @dsh-external/dsh-idea/src/semantic/document
 */

import { createHash } from 'node:crypto'
import type { IdeaDraft } from '../types.ts'
import { IDEA_SEMANTIC_DOCUMENT_VERSION } from './types.ts'

export { IDEA_SEMANTIC_DOCUMENT_VERSION }

/**
 * Build the deterministic document for one draft. Field order is frozen
 * (Title, Core, Motivation, Current Conclusion, Possible Value, Use When,
 * Open Questions); every field renders as `Label: content` on its own line;
 * list fields join their items with `; `. Output always ends with one
 * trailing newline.
 */
export function buildSemanticDocument(draft: IdeaDraft): string {
  return [
    `Title: ${draft.title}`,
    `Core: ${draft.core}`,
    `Motivation: ${draft.motivation}`,
    `Current Conclusion: ${draft.currentConclusion}`,
    `Possible Value: ${draft.possibleValue}`,
    `Use When: ${draft.useWhen.join('; ')}`,
    `Open Questions: ${draft.openQuestions.join('; ')}`,
  ].join('\n') + '\n'
}

/** SHA-256 hex digest of the exact UTF-8 bytes of one document. */
export function hashSemanticDocument(document: string): string {
  return createHash('sha256').update(document, 'utf8').digest('hex')
}

/** Build the document for one draft and hash its exact bytes, in one step. */
export function semanticContentHash(draft: IdeaDraft): string {
  return hashSemanticDocument(buildSemanticDocument(draft))
}
