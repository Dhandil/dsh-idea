/**
 * Neutral deterministic lexical primitives shared by Search and Related
 * Ideas: one normalization, one feature extraction, and weighted field
 * scoring over pre-extracted field texts. The two consumers keep their own
 * product semantics (selection, fallback, and projection live beside them);
 * this module only owns the mechanics.
 * @module @dsh-external/dsh-idea/src/retrieval/lexical
 */

/**
 * One NFKC + lowercase + collapsed-whitespace normalization applied to every
 * text a lexical stage reads (queries and scored fields alike).
 */
export function normalizeLexical(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Word tokens and CJK scripts, after normalization. CJK script runs cover
 * Han, Hiragana/Katakana, and Hangul; word tokens are runs of two or more
 * ASCII letters/digits.
 */
const FEATURE_PATTERN = /([a-z0-9]{2,})|([぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]+)/g

/**
 * Extract the deduplicated query features of one text: Latin/alphanumeric
 * word tokens (min length 2) and CJK bigrams over contiguous CJK runs —
 * a single-character run contributes itself. Chinese/English mixed text
 * yields both feature kinds.
 */
export function extractQueryFeatures(text: string): string[] {
  const normalized = normalizeLexical(text)
  const features = new Set<string>()
  for (const match of normalized.matchAll(FEATURE_PATTERN)) {
    const word = match[1]
    const run = match[2]
    if (word !== undefined) {
      features.add(word)
    } else if (run !== undefined) {
      if (run.length === 1) {
        features.add(run)
      } else {
        for (let index = 0; index < run.length - 1; index += 1) {
          features.add(run.slice(index, index + 2))
        }
      }
    }
  }
  return [...features]
}

/**
 * Score one record's normalized field texts against query features with the
 * caller's frozen weights: per field, the number of distinct query features
 * present (repeated occurrences within one field count once) times the
 * field's weight, summed.
 */
export function scoreLexicalFields(
  fields: Readonly<Record<string, string>>,
  weights: Readonly<Record<string, number>>,
  features: readonly string[],
): number {
  let score = 0
  for (const [field, weight] of Object.entries(weights)) {
    const text = fields[field]
    if (text === undefined) continue
    let present = 0
    for (const feature of features) {
      if (text.includes(feature)) present += 1
    }
    score += present * weight
  }
  return score
}

/** Recency-then-id order: the shared secondary ranking for lexical stages. */
export function recencyThenIdOrder(a: { updatedAt: number; id: string }, b: { updatedAt: number; id: string }): number {
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}
