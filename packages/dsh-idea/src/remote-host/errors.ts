/**
 * The `idea` Remote failure vocabulary and the deliberate mapping from local
 * preparation / storage failures onto it. Known local failures map onto
 * plugin codes; caller cancellation maps onto the Harness carrier code;
 * anything unexpected is rethrown untouched so the Gateway classifies it as
 * `gateway/internal`. No secrets or raw credential values are ever carried.
 * @module @dsh-external/dsh-idea/src/remote-host/errors
 */

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteErrorDetailsMap } from '@deepseek-ai/dsh-typert-protocol'
import { IdeaError } from '../errors.ts'
import type { IdeaErrorCode } from '../errors.ts'
import { IdeaPreparationError } from '../preparation/errors.ts'
import type { IdeaPreparationErrorCode } from '../preparation/errors.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The Session or the requested assistant message does not exist. */
    'idea/source-not-found': {}
    /** The source exists but is unreadable or carries no usable visible text. */
    'idea/source-unavailable': {}
    /** The selected model route cannot be served at all. */
    'idea/model-unavailable': {}
    /** The provider or stream failed, or ended on a non-success finish. */
    'idea/model-failed': {}
    /** The model produced no usable draft. */
    'idea/invalid-model-output': {}
    /** The preparation id is unknown or expired. */
    'idea/preparation-not-found': {}
    /** The edited draft failed validation; `issues` carries codec output when one produced it. */
    'idea/invalid-draft': { readonly issues?: readonly object[] }
    /** The durable Idea write failed; the preparation stays retryable. */
    'idea/storage-failed': {}
  }
}

/**
 * The plugin-owned codes, exported so the augmentation above joins the
 * package's public surface for generated-client consumers.
 */
export const IDEA_REMOTE_ERROR_CODES = [
  'idea/source-not-found',
  'idea/source-unavailable',
  'idea/model-unavailable',
  'idea/model-failed',
  'idea/invalid-model-output',
  'idea/preparation-not-found',
  'idea/invalid-draft',
  'idea/storage-failed',
] as const satisfies readonly (keyof RemoteErrorDetailsMap)[]

export type IdeaRemoteErrorCode = (typeof IDEA_REMOTE_ERROR_CODES)[number]

/** Preparation codes that map one-to-one onto `idea/*` wire codes. */
const DIRECT_PREPARATION_CODES: readonly IdeaPreparationErrorCode[] = [
  'source-not-found',
  'source-unavailable',
  'model-unavailable',
  'model-failed',
  'invalid-model-output',
]

/**
 * Map one thrown preparation failure onto the wire vocabulary.
 * @returns the wire failure, or `undefined` when the error is unexpected and
 * must stay unclassified (`gateway/internal`).
 */
export function remotePreparationError(error: unknown): RemoteError | undefined {
  if (!(error instanceof IdeaPreparationError)) return undefined
  if (error.code === 'request-cancelled') {
    return new RemoteError('gateway/cancelled', 'idea preparation was cancelled', {}, { cause: error })
  }
  if (error.code === 'preparation-not-found') {
    return new RemoteError('idea/preparation-not-found', 'this idea preview has expired', {})
  }
  if (DIRECT_PREPARATION_CODES.includes(error.code)) {
    return new RemoteError(`idea/${error.code}` as IdeaRemoteErrorCode, error.message, {}, { cause: error })
  }
  return undefined
}

/** Map one Idea-domain failure raised inside the commit path. */
export function remoteDomainError(error: unknown): RemoteError | undefined {
  if (!(error instanceof IdeaError)) return undefined
  const code: IdeaErrorCode = error.code
  if (code === 'invalid-input') {
    return new RemoteError('idea/invalid-draft', 'the edited idea draft is invalid', {}, { cause: error })
  }
  return new RemoteError('idea/storage-failed', 'the idea could not be saved', {}, { cause: error })
}
