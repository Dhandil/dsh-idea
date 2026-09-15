/**
 * Types of the Host-side Evolution preparation pipeline. An evolution
 * proposal is the model's drafted next version of an Idea, held ephemerally
 * behind an opaque id until the user approves it — proposing never writes
 * durable state, and only the user-approved commit does.
 * @module @dsh-external/dsh-idea/src/evolution/types
 */

import type { IdeaDiscussion, IdeaDraft, IdeaEvolutionProposal, IdeaEvolutionReason, IdeaId, IdeaVersionId, SourceDiscussionDraft } from '../types.ts'

export type {
  IdeaDiscussion,
  IdeaDraft,
  IdeaEvolutionProposal,
  IdeaEvolutionReason,
  IdeaId,
  IdeaVersionId,
  SourceDiscussionDraft,
}

/**
 * What a caller hands the Host registry to hold behind a proposal id: the
 * pending proposal (its id is minted by the registry, not supplied) plus the
 * bounded discussion capture that fed it. The capture becomes the committed
 * version's source snapshot when the user approves.
 */
export interface PreparedEvolution {
  proposal: Omit<IdeaEvolutionProposal, 'proposalId'>
  source: SourceDiscussionDraft
}

/**
 * What the Host registry resolves behind one proposal id: the complete
 * proposal (carrying its minted id) plus the bounded discussion capture.
 */
export interface ResolvedEvolution {
  proposal: IdeaEvolutionProposal
  source: SourceDiscussionDraft
}

/**
 * The preview returned by a successful evolution preparation: identities and
 * the proposed draft. The current version the proposal was prepared against
 * travels as `baseVersionId`; a commit must re-confirm it.
 */
export interface IdeaEvolutionPreview {
  proposalId: IdeaEvolutionProposal['proposalId']
  ideaId: IdeaId
  baseVersionId: IdeaVersionId
  reason: IdeaEvolutionReason
  draft: IdeaDraft
}
