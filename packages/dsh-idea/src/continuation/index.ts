/**
 * Host bundle row `@dsh-external/dsh-idea/continuation`: the Agent pre-step
 * injector that delivers a continued discussion's frozen Idea seed to the
 * model exactly once.
 * @module @dsh-external/dsh-idea/src/continuation
 */

import { IdeaContinuationService } from './service.ts'

export {
  IDEA_CONTINUATION_MARKER,
  IDEA_PLUGIN_NAME,
  isIdeaContinuationContextMessage,
  isIdeaContinuationSource,
  renderIdeaContinuationContext,
} from './context.ts'
export { IdeaContinuationService } from './service.ts'

export default IdeaContinuationService
