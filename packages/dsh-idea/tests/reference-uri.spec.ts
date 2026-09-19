/**
 * Idea reference URI protocol tests: canonical round-trips (including
 * Unicode), label escaping in mentions, malformed and non-canonical payload
 * rejection, text parsing with occurrence order, and the wire descriptor.
 * A reference pins one exact ideaId + versionId — nothing else.
 * @module tests/reference-uri.spec
 */

import { describe, expect, it } from 'vitest'
import {
  decodeIdeaReferenceUri,
  encodeIdeaReferenceUri,
  escapeIdeaReferenceLabel,
  formatIdeaReferenceMention,
  ideaReferenceDescriptor,
  parseIdeaReferenceText,
  unescapeIdeaReferenceLabel,
} from '../src/reference/uri.ts'
import { IdeaError } from '../src/errors.ts'

describe('canonical URI', () => {
  it('round-trips an exact pin', () => {
    const uri = encodeIdeaReferenceUri({ ideaId: 'idea_1', versionId: 'idea_ver_2' })
    expect(uri.startsWith('dsh-idea:')).toBe(true)
    expect(decodeIdeaReferenceUri(uri)).toEqual({ ideaId: 'idea_1', versionId: 'idea_ver_2' })
  })

  it('round-trips Unicode identifiers', () => {
    const uri = encodeIdeaReferenceUri({ ideaId: '想法_1', versionId: '版本_β' })
    expect(decodeIdeaReferenceUri(uri)).toEqual({ ideaId: '想法_1', versionId: '版本_β' })
  })

  it('is deterministic: the same pin encodes to the same canonical URI', () => {
    expect(encodeIdeaReferenceUri({ ideaId: 'a', versionId: 'b' }))
      .toBe(encodeIdeaReferenceUri({ ideaId: 'a', versionId: 'b' }))
  })

  it('is URL-safe base64url without padding', () => {
    const uri = encodeIdeaReferenceUri({ ideaId: 'a?x=/+', versionId: 'b<>@' })
    expect(uri.slice('dsh-idea:'.length)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('rejects empty identifiers', () => {
    expect(() => encodeIdeaReferenceUri({ ideaId: '', versionId: 'b' })).toThrow(IdeaError)
    expect(() => encodeIdeaReferenceUri({ ideaId: 'a', versionId: '' })).toThrow(IdeaError)
  })
})

describe('decoding rejects', () => {
  it('non dsh-idea URIs', () => {
    expect(() => decodeIdeaReferenceUri('http://example.com')).toThrow(IdeaError)
    expect(() => decodeIdeaReferenceUri('dsh-idea')).toThrow(IdeaError)
  })

  it('malformed base64 or JSON payloads', () => {
    expect(() => decodeIdeaReferenceUri('dsh-idea:!!!')).toThrow(IdeaError)
    expect(() => decodeIdeaReferenceUri('dsh-idea:bm90LWpzb24')).toThrow(IdeaError)
  })

  it('payloads with missing, extra, or wrongly-typed keys', () => {
    // extra key → non-canonical re-encode
    const extraJson = JSON.stringify({ ideaId: 'a', versionId: 'b', extra: 1 })
    expect(() => decodeIdeaReferenceUri(`dsh-idea:${btoa(extraJson).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`)).toThrow(IdeaError)
    // swapped key order → non-canonical
    const swapped = JSON.stringify({ versionId: 'b', ideaId: 'a' })
    expect(() => decodeIdeaReferenceUri(`dsh-idea:${btoa(swapped).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`)).toThrow(IdeaError)
  })

  it('canonical validation: decode re-encodes and compares', () => {
    const uri = encodeIdeaReferenceUri({ ideaId: 'a', versionId: 'b' })
    // Same semantic content, non-canonical base64 padding variant.
    const payload = uri.slice('dsh-idea:'.length)
    expect(() => decodeIdeaReferenceUri(`dsh-idea:${payload.toUpperCase()}`)).toThrow(/canonical|malformed|payload/)
  })
})

describe('mention formatting', () => {
  it('formats the canonical mention with an escaped label', () => {
    const mention = formatIdeaReferenceMention({ ideaId: 'a', versionId: 'b' }, 'My [best] \\idea\\')
    expect(mention).toBe(`@[My \\[best\\] \\\\idea\\\\](${encodeIdeaReferenceUri({ ideaId: 'a', versionId: 'b' })})`)
    expect(parseIdeaReferenceText(mention)[0]!.label).toBe('My [best] \\idea\\')
  })

  it('escapes and unescapes symmetrically', () => {
    for (const label of ['plain', 'a]b', 'a\\]b', '[[double]]', '反斜杠\\']) {
      expect(unescapeIdeaReferenceLabel(escapeIdeaReferenceLabel(label))).toBe(label)
    }
  })

  it('builds the wire descriptor with identity, label, and mention', () => {
    const descriptor = ideaReferenceDescriptor('idea_1', 'idea_ver_1', 'Title')
    expect(descriptor).toEqual({
      ideaId: 'idea_1',
      versionId: 'idea_ver_1',
      label: 'Title',
      mention: formatIdeaReferenceMention({ ideaId: 'idea_1', versionId: 'idea_ver_1' }, 'Title'),
    })
  })
})

describe('text parsing', () => {
  it('finds mentions in occurrence order with unescaped labels', () => {
    const first = formatIdeaReferenceMention({ ideaId: 'a', versionId: 'va' }, 'Alpha')
    const second = formatIdeaReferenceMention({ ideaId: 'b', versionId: 'vb' }, 'Beta [v2]')
    const text = `see ${first} then ${second} and again ${first}`
    const parsed = parseIdeaReferenceText(text)
    expect(parsed).toHaveLength(3)
    expect(parsed[0]!.pin).toEqual({ ideaId: 'a', versionId: 'va' })
    expect(parsed[0]!.label).toBe('Alpha')
    expect(parsed[1]!.pin).toEqual({ ideaId: 'b', versionId: 'vb' })
    expect(parsed[1]!.label).toBe('Beta [v2]')
    expect(parsed[2]!.mention).toBe(first)
  })

  it('ignores text without mentions', () => {
    expect(parseIdeaReferenceText('no references here')).toEqual([])
    expect(parseIdeaReferenceText('email someone@somewhere')).toEqual([])
  })

  it('throws on a mention whose payload is malformed rather than dropping it', () => {
    expect(() => parseIdeaReferenceText('see @[Label](dsh-idea:!!!not-base64) now')).toThrow(IdeaError)
  })
})
