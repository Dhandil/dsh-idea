/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * T9R3 focused tests: the composer Idea search card follows the theme —
 * the light theme gets a light surface (the same alias tokens as the R4
 * hover preview card) plus a light border, and the dark theme keeps its
 * dark surface via the `body[data-ds-dark-theme]` override. Source-level
 * stylesheet guarantees; the computed-style and behavioral proofs live in
 * the isolated Playwright acceptance.
 * @module tests/client-t9r3.spec
 */

import { describe, expect, it } from 'vitest'
import '../src/client/styles.ts'

describe('T9R3: the composer search card follows the theme', () => {
  const css = (): string => {
    const tag = document.querySelector(`style[data-plugin-css='@dsh-external/dsh-idea/client.css']`)
    expect(tag).not.toBeNull()
    return tag!.textContent ?? ''
  }

  it('R1-light: the card surface is the theme layer alias, not a fixed dark color', () => {
    const text = css()
    expect(text).toMatch(/(^|\n)\.dsh-idea-search \{[^}]*background: var\(--dsw-alias-bg-layer-1, #fff\);/s)
    expect(text).not.toMatch(/(^|\n)\.dsh-idea-search \{[^}]*background: #2C2C2E;/s)
  })

  it('R1-light: the card carries a light idle border sourced from the l2 alias', () => {
    const text = css()
    expect(text).toMatch(/(^|\n)\.dsh-idea-search \{[^}]*border: 1px solid var\(--dsw-alias-border-l2, rgba\(0, 0, 0, 0\.1\)\);/s)
  })

  it('R1-dark: the dark theme override keeps the dark surface and drops the border', () => {
    const text = css()
    expect(text).toMatch(/body\[data-ds-dark-theme\] \.dsh-idea-search \{\s*border-color: transparent;\s*background: #2C2C2E;\s*\}/)
  })

  it('R1: the token source matches the R4 hover preview card exactly', () => {
    const text = css()
    const surface = (block: string): string | null => block.match(/background: ([^;]+);/)?.[1] ?? null
    const search = text.match(/\.dsh-idea-search \{[^}]*\}/s)![0]
    const hover = text.match(/\.dsh-idea-hover-card \{[^}]*\}/s)![0]
    expect(surface(search)).toBe(surface(hover))
    expect(surface(search)).toContain('--dsw-alias-bg-layer-1')
    const darkRules = text.match(/body\[data-ds-dark-theme\] \.dsh-idea-\w[\w-]* \{[^}]*\}/g) ?? []
    expect(darkRules).toHaveLength(2)
    expect(darkRules.every(rule => rule.includes('.dsh-idea-search') || rule.includes('.dsh-idea-hover-card'))).toBe(true)
  })

  it('R1: search card geometry and behavior-bearing properties are unchanged', () => {
    const search = css().match(/\.dsh-idea-search \{[^}]*\}/s)![0]
    expect(search).toContain('width: min(480px, calc(100vw - 48px));')
    expect(search).toContain('max-height: min(420px, calc(100vh - 160px));')
    expect(search).toContain('border-radius: 12px;')
    expect(search).toContain('box-shadow: var(--dsw-shadow-lv3);')
    expect(search).toContain('pointer-events: auto;')
  })
})
