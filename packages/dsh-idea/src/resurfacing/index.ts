/**
 * Entry of the Contextual Resurfacing plugin (`@dsh-external/dsh-idea/resurfacing`).
 * Default export is the Host service the bundle's loader row mounts;
 * everything else is the detector, retrieval, suppression, prompt, parser,
 * and vocabulary surface the pipeline is proven against.
 * @module @dsh-external/dsh-idea/resurfacing
 */

import { IdeaResurfacingService } from './service.ts'

export { IdeaResurfacingService } from './service.ts'
export { detectResurfacingOpportunity } from './detector.ts'
export { scoreResurfacingCandidate, selectResurfacingPool } from './retrieval.ts'
export { suppressResurfacingCandidates } from './suppression.ts'
export { buildResurfacingJudgePrompt } from './prompt.ts'
export type { ResurfacingJudgePrompt } from './prompt.ts'
export { parseResurfacingJudgment } from './parser.ts'
export {
  RESURFACING_CANDIDATE_LIMIT,
  RESURFACING_FEATURE_ENABLED,
  RESURFACING_FIELD_WEIGHTS,
  RESURFACING_RETRIEVAL_FLOOR,
} from './types.ts'
export type {
  ResurfacingCandidate,
  ResurfacingContextMessage,
  ResurfacingDetection,
  ResurfacingDropReason,
  ResurfacingEvaluateInput,
  ResurfacingEvaluation,
  ResurfacingEvaluateStopReason,
  ResurfacingHostSuppressionReason,
  ResurfacingJudgeInput,
  ResurfacingJudgment,
  ResurfacingJudgeNegativeReason,
  ResurfacingJudgePositiveReason,
  ResurfacingMediumAtomicSignal,
  ResurfacingSignal,
  ResurfacingSignalStrength,
  ResurfacingSignalType,
  ResurfacingStrongAtomicSignal,
  ResurfacingStrongCompoundSignal,
} from './types.ts'

export default IdeaResurfacingService
