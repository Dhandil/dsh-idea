/**
 * The Idea reference URI protocol: a canonical `dsh-idea:` URI that pins one
 * exact Idea version, the `@[label](dsh-idea:...)` mention form with label
 * escaping, and text parsing. Canonical means the payload is base64url of
 * the JSON `{"ideaId":...,"versionId":...}` with exactly that key order and
 * no padding — decode re-encodes and compares, so anything that does not
 * round-trip byte-identically is rejected.
 * @module @dsh-external/dsh-idea/src/reference/uri
 */

import { IdeaError } from '../errors.ts'
import type { IdeaReferenceDescriptor as IdeaReferenceDescriptorShape } from './types.ts'

const IDEA_REFERENCE_SCHEME = 'dsh-idea:'

/** The exact Idea version one reference pins. */
export interface IdeaReferencePin {
  ideaId: string
  versionId: string
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const encoded = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64')
  return encoded.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(payload: string): string {
  const normalized = payload.replaceAll('-', '+').replaceAll('_', '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary')
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function encodePayload(pin: IdeaReferencePin): string {
  return toBase64Url(JSON.stringify({ ideaId: pin.ideaId, versionId: pin.versionId }))
}

/**
 * Encode one pinned Idea version into its canonical `dsh-idea:` URI.
 * Throws on empty identifiers — a reference without both identifiers is not
 * a reference.
 */
export function encodeIdeaReferenceUri(pin: IdeaReferencePin): string {
  if (pin.ideaId.length === 0 || pin.versionId.length === 0) {
    throw new IdeaError('invalid-input', 'an Idea reference URI needs both an ideaId and a versionId')
  }
  return IDEA_REFERENCE_SCHEME + encodePayload(pin)
}

/**
 * Decode one `dsh-idea:` URI back to its pinned Idea version. The payload
 * must be canonical — decode, re-encode, and compare; a non-canonical or
 * malformed payload throws instead of guessing.
 */
export function decodeIdeaReferenceUri(uri: string): IdeaReferencePin {
  if (!uri.startsWith(IDEA_REFERENCE_SCHEME)) {
    throw new IdeaError('invalid-input', `not an Idea reference URI: ${JSON.stringify(uri.slice(0, 32))}`)
  }
  const payload = uri.slice(IDEA_REFERENCE_SCHEME.length)
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(payload))
  } catch {
    throw new IdeaError('invalid-input', 'malformed Idea reference payload')
  }
  if (
    typeof parsed !== 'object' || parsed === null
    || !('ideaId' in parsed) || !('versionId' in parsed)
    || typeof parsed.ideaId !== 'string' || typeof parsed.versionId !== 'string'
    || Object.keys(parsed).length !== 2
  ) {
    throw new IdeaError('invalid-input', 'malformed Idea reference payload')
  }
  const pin = { ideaId: parsed.ideaId, versionId: parsed.versionId }
  if (pin.ideaId.length === 0 || pin.versionId.length === 0) {
    throw new IdeaError('invalid-input', 'malformed Idea reference payload')
  }
  if (encodePayload(pin) !== payload) {
    throw new IdeaError('invalid-input', 'non-canonical Idea reference payload')
  }
  return pin
}

/** Escape a mention label: backslash first, then the brackets. */
export function escapeIdeaReferenceLabel(label: string): string {
  return label.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]')
}

/** Undo `escapeIdeaReferenceLabel`. */
export function unescapeIdeaReferenceLabel(label: string): string {
  let unescaped = ''
  for (let index = 0; index < label.length; index += 1) {
    const char = label[index]!
    if (char === '\\' && index + 1 < label.length) {
      const next = label[index + 1]!
      if (next === '\\' || next === '[' || next === ']') {
        unescaped += next
        index += 1
        continue
      }
    }
    unescaped += char
  }
  return unescaped
}

/** The mention text of one pinned Idea version with its current label. */
export function formatIdeaReferenceMention(pin: IdeaReferencePin, label: string): string {
  return `@[${escapeIdeaReferenceLabel(label)}](${encodeIdeaReferenceUri(pin)})`
}

/** The canonical wire descriptor of one pinned Idea version. */
export function ideaReferenceDescriptor(
  ideaId: string,
  versionId: string,
  label: string,
): IdeaReferenceDescriptorShape {
  return {
    ideaId,
    versionId,
    label,
    mention: formatIdeaReferenceMention({ ideaId, versionId }, label),
  }
}

/** One parsed mention occurrence inside a larger text. */
export interface ParsedIdeaReference {
  /** The pinned Idea version the mention carries. */
  pin: IdeaReferencePin
  /** The unescaped display label as written in the mention. */
  label: string
  /** The exact mention substring as it occurs in the text. */
  mention: string
}

// The payload matches even when empty (`*`, not `+`): an explicit
// `@[X](dsh-idea:)` mention must reach the canonical decoder and be
// rejected, never survive as ordinary text.
const MENTION_PATTERN = /@\[((?:\\.|[^\\\]])*)\]\((dsh-idea:[^\s)]*)\)/g

/**
 * Parse every Idea mention in one text, in occurrence order. The URI payload
 * of each mention is validated (decode → re-encode); a mention-shaped string
 * whose payload is empty, malformed, or non-canonical throws — references
 * never silently degrade to plain text.
 */
export function parseIdeaReferenceText(text: string): ParsedIdeaReference[] {
  const parsed: ParsedIdeaReference[] = []
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const label = unescapeIdeaReferenceLabel(match[1]!)
    const pin = decodeIdeaReferenceUri(match[2]!)
    parsed.push({ pin, label, mention: match[0] })
  }
  return parsed
}
