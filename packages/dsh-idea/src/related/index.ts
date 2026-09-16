/**
 * Entry of the Related Ideas plugin (`@dsh-external/dsh-idea/related`).
 * Default export is the Host service the bundle's loader row mounts;
 * everything else is the retrieval, prompt, parser, and vocabulary surface
 * the pipeline is proven against.
 * @module @dsh-external/dsh-idea/related
 */

import { IdeaRelatedService } from './service.ts'

export { IdeaRelatedService } from './service.ts'
export { eligibleRelatedCandidates } from './service.ts'
export {
  RELATED_CANDIDATE_LIMIT,
  RELATED_FIELD_WEIGHTS,
  RELATED_MATCH_LIMIT,
  RELATED_PAYLOAD_LIMIT,
  RELATED_WHY_LIMIT,
} from './types.ts'
export type {
  RelatedIdeaCandidate,
  RelatedIdeasResult,
  RelatedIdeaMatch,
  RelatedJudgment,
} from './types.ts'
export {
  extractQueryFeatures,
  projectCandidates,
  scoreCandidate,
  selectCandidates,
} from './retrieval.ts'
export type { RelatedCandidateProjection } from './retrieval.ts'
export { buildRelatedIdeasPrompt } from './prompt.ts'
export type { RelatedIdeasPrompt } from './prompt.ts'
export { parseRelatedMatches } from './parser.ts'

export default IdeaRelatedService
