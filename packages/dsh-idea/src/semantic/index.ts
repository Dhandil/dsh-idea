/**
 * Public surface of the semantic plugin: the service class (default export,
 * mounted by the Host loader as `@dsh-external/dsh-idea/semantic`) plus the
 * pure vocabulary, configuration, deterministic document and profile
 * builders, vector mechanics, provider abstraction, and domain spec for
 * direct consumers and tests.
 * @module @dsh-external/dsh-idea/semantic
 */

import { IdeaSemanticService } from './service.ts'

export { IdeaSemanticService } from './service.ts'
export { SemanticConfig, resolveSemanticConfig, SemanticConfigError } from './config.ts'
export type { SemanticPluginConfig, ResolvedSemanticConfig, SemanticConfigRejection } from './config.ts'
export {
  IDEA_SEMANTIC_DOCUMENT_VERSION,
  SEMANTIC_MODES,
  SEMANTIC_NORMALIZATION_VERSION,
  SEMANTIC_ADAPTER,
  SEMANTIC_TOP_K,
  SEMANTIC_SELECTOR_PAYLOAD_LIMIT,
  SEMANTIC_DIMENSIONS_MAX,
  SEMANTIC_TIMEOUT_MS_MAX,
  SEMANTIC_BATCH_SIZE_MAX,
  SEMANTIC_API_KEY_ENV_DEFAULT,
  SEMANTIC_TIMEOUT_MS_DEFAULT,
  SEMANTIC_BATCH_SIZE_DEFAULT,
} from './types.ts'
export type { SemanticMode, SemanticEmbeddingRecord, EmbeddingProfile, ResolvedEmbeddingProfile } from './types.ts'
export { semanticEmbeddingRecordSchema } from './schema.ts'
export { ideaSemanticDomainSpec } from './spec.ts'
export { buildSemanticDocument, hashSemanticDocument, semanticContentHash } from './document.ts'
export { canonicalizeBaseURL, resolveEmbeddingProfile, BaseURLValidationError } from './profile.ts'
export type { BaseURLRejection } from './profile.ts'
export { normalizeVector, normalizeEmbeddingBatch, dotProduct, VectorValidationError } from './vector.ts'
export type { VectorRejection, RawEmbedding } from './vector.ts'
export { EmbeddingProviderError, EmbeddingCancelledError } from './provider.ts'
export type { IdeaEmbeddingProvider, EmbeddingProviderRejection } from './provider.ts'
export { OpenAICompatibleEmbeddingProvider } from './openai-compatible.ts'
export type { OpenAICompatibleEmbeddingOptions } from './openai-compatible.ts'
export {
  buildSemanticQueryText,
  boundSemanticQueryInput,
  selectSemanticTopK,
} from './retrieval.ts'
export type { SemanticScoredRecord } from './retrieval.ts'
export {
  extractSelectorQueryFeatures,
  scoreSelectorCandidate,
  selectSelectorPool,
  projectSelectorCandidates,
} from './selector-retrieval.ts'
export type { SelectorCandidateProjection } from './selector-retrieval.ts'
export { SELECTOR_SYSTEM_PROMPT, buildSelectorPrompt } from './selector-prompt.ts'
export type { SelectorPrompt } from './selector-prompt.ts'
export { parseSelectorIdeaIds } from './selector-parser.ts'

export default IdeaSemanticService
