/// <reference types="@testing-library/dom" />
// @vitest-environment jsdom
/**
 * T9R2 focused tests: the UI consistency and detail readability repairs —
 * R1/R2 one shared lightbulb icon source across the conversation action,
 * the `idea` command, and the Settings Ideas nav row; R3 the idle search
 * border; R4 the theme-aware hover preview card; R5 the compact top-left
 * back button; R6 the 讨论/删除 action labels; R7 the settings re-entry
 * reset to the list; R8 the detail's lightweight field cards with no field
 * content loss. CSS value proofs here are source-level; the computed-style
 * and visual proofs live in the isolated Playwright acceptance.
 * @module tests/client-t9r2.spec
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { IdeaReadSurface } from '../src/client/read-state.ts'
import type { IdeaReadFace, IdeaReadState } from '../src/client/read-state.ts'
import { IdeaSection } from '../src/client/IdeaSection.tsx'
import { IdeaAssistantActions } from '../src/client/IdeaAssistantActions.tsx'
import { IDEA_BULB_BASE_PATH, IDEA_BULB_GLASS_PATH, IdeaLightbulbIcon, ideaLightbulbSvgElement } from '../src/client/icons.tsx'
import { installIdeaNavIcon } from '../src/client/nav-icon.ts'
import type { IdeaSectionProps, UnifiedActionProps } from '../src/client/slots.ts'
import type { EditableIdeaDraft } from '../src/client/state.ts'
import { en, zh } from '../src/client/locales.ts'
import type { IdeaDetail, IdeaListRow, IdeaSummary, IdeaVersionSummary } from '../src/remote-host/types.ts'
import type { IdeaVersionId } from '../src/types.ts'
import '../src/client/styles.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  for (const dispose of pendings.splice(0)) dispose()
})

/** Surfaces to dispose after each test (aborts in-flight reads). */
const pendings: Array<() => void> = []

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

/** The fake `t` seat: zh interpolation, exactly the placeholders we use. */
const t = (key: string, params?: Record<string, unknown>): string =>
  (zh as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ''))

const row = (overrides: Partial<IdeaListRow> = {}): IdeaListRow => ({
  id: 'idea_1',
  status: 'active',
  currentVersionId: 'idea_ver_1',
  title: 'Saved idea',
  core: 'Core text',
  currentConclusion: 'Conclusion text',
  useWhen: ['use one', 'use two'],
  openQuestionsCount: 1,
  updatedAt: 1_700_000_000_000,
  ...overrides,
})

const summary = (overrides: Partial<IdeaSummary> = {}): IdeaSummary => ({
  id: 'idea_1',
  status: 'active',
  title: 'Saved idea',
  core: 'Core text',
  motivation: 'Why kept',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  source: { sessionId: 'session-9', anchorMessageId: 'msg-9' },
  ...overrides,
})

const detailOf = (base: IdeaSummary, overrides: Partial<IdeaDetail> = {}): IdeaDetail => ({
  ...base,
  currentConclusion: 'Conclusion text',
  possibleValue: 'Value text',
  useWhen: ['use one', 'use two'],
  openQuestions: ['question one'],
  versionId: 'idea_ver_1' as IdeaVersionId,
  ...overrides,
})

const versionSummary = (overrides: Partial<IdeaVersionSummary> = {}): IdeaVersionSummary => ({
  id: 'idea_ver_1' as IdeaVersionId,
  ordinal: 1,
  reason: 'initial-save',
  title: 'Saved idea',
  createdAt: 1_700_000_000_000,
  ...overrides,
})

function faceWith(): IdeaReadFace {
  return {
    list: vi.fn(async () => ({ ok: true as const, value: [row()] })),
    get: vi.fn(async () => ({ ok: true as const, value: detailOf(summary()) })),
    getVersions: vi.fn(async () => ({ ok: true as const, value: [versionSummary()] })),
    search: vi.fn(async () => ({ ok: true as const, value: [] })),
  } as unknown as IdeaReadFace
}

function newSurface(face: IdeaReadFace): IdeaReadSurface {
  const surface = new IdeaReadSurface(face)
  pendings.push(() => surface.dispose())
  return surface
}

/** The framework-synthesized selector hook over the surface's store. */
const useIdeaReadOf = (store: SnapshotStore<IdeaReadState>) =>
  (select: (state: IdeaReadState) => unknown) =>
    useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()))

function sectionProps(surface: IdeaReadSurface): IdeaSectionProps {
  return {
    load: () => { surface.load() },
    searchIdeas: (query: string) => { surface.searchIdeas(query) },
    selectView: (view: 'current' | 'archived') => { surface.selectView(view) },
    open: (id: string) => { surface.open(id) },
    closeDetail: () => { surface.closeDetail() },
    archiveIdea: () => { surface.archiveIdea() },
    continueIdea: (id: string) => { surface.continueDiscussion(id) },
    prepareEvolution: () => { surface.prepareEvolution() },
    editProposalDraft: (patch: Partial<EditableIdeaDraft>) => { surface.editProposalDraft(patch) },
    cancelProposal: () => { surface.cancelProposal() },
    commitProposal: () => { surface.commitProposal() },
    useIdeaRead: useIdeaReadOf(surface.state),
    t,
  } as unknown as IdeaSectionProps
}

describe('T9R2 R1/R2: one shared lightbulb icon source', () => {
  it('renders the lightbulb component with the shared geometry', () => {
    const { container } = render(<IdeaLightbulbIcon size={15} className="probe" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('viewBox')).toBe('0 0 16 16')
    expect(svg!.getAttribute('fill')).toBe('none')
    expect(svg!.getAttribute('class')).toBe('probe')
    const paths = svg!.querySelectorAll('path')
    expect(paths).toHaveLength(2)
    expect(paths[0]!.getAttribute('d')).toBe(IDEA_BULB_GLASS_PATH)
    expect(paths[0]!.getAttribute('fill-rule')).toBe('evenodd')
    expect(paths[1]!.getAttribute('d')).toBe(IDEA_BULB_BASE_PATH)
  })

  it('the DOM twin carries the exact same geometry (single source)', () => {
    const svg = ideaLightbulbSvgElement('navIcon')
    expect(svg.dataset.dshIdeaIcon).toBe('bulb')
    expect(svg.getAttribute('class')).toBe('navIcon')
    const paths = svg.querySelectorAll('path')
    expect(paths[0]!.getAttribute('d')).toBe(IDEA_BULB_GLASS_PATH)
    expect(paths[1]!.getAttribute('d')).toBe(IDEA_BULB_BASE_PATH)
  })

  it('the DOM twin carries the exact same geometry (single icon source)', () => {
    const svg = ideaLightbulbSvgElement('navIcon')
    expect(svg.dataset.dshIdeaIcon).toBe('bulb')
    expect(svg.getAttribute('class')).toBe('navIcon')
    const paths = svg.querySelectorAll('path')
    expect(paths[0]!.getAttribute('d')).toBe(IDEA_BULB_GLASS_PATH)
    expect(paths[1]!.getAttribute('d')).toBe(IDEA_BULB_BASE_PATH)
  })
})

describe('T9R2 R1: the assistant Idea action icon', () => {
  it('the action button renders the shared lightbulb, not the sun glyph', () => {
    const pendingStore = createSnapshotStore({ preparingMessageId: null, loadingMessageId: null })
    const useHook = (select: (state: unknown) => unknown) =>
      useSyncExternalStore(pendingStore.subscribe, () => select(pendingStore.getSnapshot()))
    const props = {
      messageId: 'a1',
      prepare: () => {},
      findRelated: () => {},
      useIdea: useHook,
      useRelated: useHook,
      t,
    } as unknown as UnifiedActionProps
    const { container } = render(<IdeaAssistantActions {...props} />)
    const button = container.querySelector('button.dsh-idea-action')
    expect(button).not.toBeNull()
    const svg = button!.querySelector('svg')
    expect(svg).not.toBeNull()
    const glass = svg!.querySelector('path')
    expect(glass!.getAttribute('d')).toBe(IDEA_BULB_GLASS_PATH)
    // No sun/brightness glyph: the primitives light icon's ray geometry or
    // circle rings would carry circle elements and the old path data.
    expect(svg!.querySelectorAll('path')).toHaveLength(2)
    expect(svg!.querySelector('circle')).toBeNull()
  })
})

describe('T9R2 R2: the Settings Ideas nav glyph adaptation', () => {
  const mountNav = (): void => {
    document.body.innerHTML = `
      <div role="dialog" aria-modal="true">
        <nav>
          <button type="button"><svg width="16" height="16" class="navIcon gearA"></svg><span>Ideas</span></button>
          <button type="button"><svg width="16" height="16" class="navIcon gearB"></svg><span>模型</span></button>
        </nav>
      </div>`
  }

  it('swaps only the Ideas row to the shared lightbulb', () => {
    mountNav()
    const dispose = installIdeaNavIcon(t('read.nav'))
    pendings.push(dispose)
    const buttons = document.querySelectorAll('[role="dialog"] nav button')
    const ideas = buttons[0]!.querySelector('svg')!
    expect(ideas.dataset.dshIdeaIcon).toBe('bulb')
    expect(ideas.getAttribute('class')).toBe('navIcon gearA')
    expect(ideas.getAttribute('width')).toBe('16')
    expect(ideas.querySelector('path')!.getAttribute('d')).toBe(IDEA_BULB_GLASS_PATH)
    const other = buttons[1]!.querySelector('svg')!
    expect(other.dataset.dshIdeaIcon).toBeUndefined()
  })

  it('re-applies after the shell re-renders the row, and stops on dispose', async () => {
    mountNav()
    const dispose = installIdeaNavIcon(t('read.nav'))
    pendings.push(dispose)
    expect(document.querySelector('[data-dsh-idea-icon="bulb"]')).not.toBeNull()

    // Simulate the shell re-rendering the nav row with its own gear glyph.
    const ideasButton = document.querySelectorAll('[role="dialog"] nav button')[0]!
    ideasButton.innerHTML = '<svg width="16" height="16" class="navIcon gearA"></svg><span>Ideas</span>'
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    expect(ideasButton.querySelector('svg')!.dataset.dshIdeaIcon).toBe('bulb')

    dispose()
    ideasButton.innerHTML = '<svg width="16" height="16" class="navIcon gearA"></svg><span>Ideas</span>'
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    expect(ideasButton.querySelector('svg')!.dataset.dshIdeaIcon).toBeUndefined()
  })

  it('never touches rows whose label is not the Ideas nav label', () => {
    mountNav()
    const dispose = installIdeaNavIcon('read.nav' as never)
    pendings.push(dispose)
    for (const svg of Array.from(document.querySelectorAll('[role="dialog"] nav svg'))) {
      expect(svg.getAttribute('data-dsh-idea-icon')).toBeNull()
    }
  })
})

describe('T9R2 R3/R4/R8: shipped stylesheet guarantees', () => {
  const css = (): string => {
    const tag = document.querySelector(`style[data-plugin-css='@dsh-external/dsh-idea/client.css']`)
    expect(tag).not.toBeNull()
    return tag!.textContent ?? ''
  }

  it('R3: the Ideas search box has a visible idle border, not a transparent fallback', () => {
    const text = css()
    expect(text).toContain('border: 1px solid var(--dsw-alias-border-l3')
    expect(text).not.toContain('--dsw-alias-line-secondary')
    expect(text).toMatch(/\.dsh-idea-library-search:focus \{\s*border-color/)
  })

  it('R4: the hover card follows the theme (light alias + dark-theme override kept)', () => {
    const text = css()
    expect(text).toMatch(/\.dsh-idea-hover-card \{[^}]*background: var\(--dsw-alias-bg-layer-1, #fff\)/s)
    expect(text).toMatch(/body\[data-ds-dark-theme\] \.dsh-idea-hover-card \{[^}]*background: #2C2C2E;/s)
  })

  it('R8: detail fields render as lightweight bordered cards', () => {
    const text = css()
    expect(text).toMatch(/\.dsh-idea-detail-field \{[^}]*border: 1px solid var\(--dsw-alias-border-l3[^}]*border-radius: 10px;[^}]*\}/s)
  })

  it('R5: the back row keeps the button left-aligned and natural-width', () => {
    const text = css()
    expect(text).toMatch(/\.dsh-idea-back-row \{[^}]*display: flex;[^}]*justify-content: flex-start;/s)
  })
})

describe('T9R2 R5: the detail back button', () => {
  it('renders inside the left-aligned back row, not stretched', async () => {
    const surface = newSurface(faceWith())
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    const back = await screen.findByRole('button', { name: '返回列表' })
    expect(back.closest('.dsh-idea-back-row')).not.toBeNull()
    expect(back.closest('.dsh-idea-back-row')).toBe(back.parentElement)
  })
})

describe('T9R2 R6: the detail action labels', () => {
  it('shows 讨论 and 删除; the old long labels are gone from the actions', async () => {
    const surface = newSurface(faceWith())
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    expect(screen.getByRole('button', { name: '讨论' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '删除' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '编辑' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '归档' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: '继续讨论' })).toBeNull()
    expect(screen.queryByRole('button', { name: '永久删除' })).toBeNull()
  })

  it('keeps the zh/en dictionaries aligned on the two changed labels', () => {
    expect(zh['read.continue']).toBe('讨论')
    expect(zh['read.delete']).toBe('删除')
    expect(en['read.continue']).toBe('Discuss')
    expect(en['read.delete']).toBe('Delete')
    // The delete confirmation's safety copy keeps its §14-frozen wording.
    expect(zh['read.delete.title']).toContain('永久删除')
    expect(zh['read.delete.confirm']).toBe('永久删除')
  })
})

describe('T9R2 R7: settings navigation re-entry returns to the list', () => {
  it('a fresh section mount over the same surface shows the list, not the previous detail', async () => {
    const surface = newSurface(faceWith())
    const props = sectionProps(surface)

    const first = render(<IdeaSection {...props} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    expect(screen.getByRole('button', { name: '返回列表' })).not.toBeNull()

    // The shell unmounts the section (any other section / modal close) and
    // mounts a fresh one later; the read surface persists underneath.
    first.unmount()
    const second = render(<IdeaSection {...props} />)
    await flush()
    expect(screen.queryByRole('button', { name: '返回列表' })).toBeNull()
    expect(screen.getByRole('button', { name: /Saved idea/ })).not.toBeNull()
    second.unmount()
  })

  it('does not break the in-page list → detail → back-to-list flow', async () => {
    const surface = newSurface(faceWith())
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    expect(screen.getByRole('button', { name: '返回列表' })).not.toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '返回列表' })) })
    await flush()
    expect(screen.queryByRole('button', { name: '返回列表' })).toBeNull()
    expect(screen.getByRole('button', { name: /Saved idea/ })).not.toBeNull()
  })
})

describe('T9R2 R8: the detail lightweight field cards', () => {
  it('renders all six field blocks as cards with their full content', async () => {
    const surface = newSurface(faceWith())
    render(<IdeaSection {...sectionProps(surface)} />)
    await flush()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Saved idea/ })) })
    await flush()
    for (const label of ['核心想法', '为什么值得保留', '当前结论', '可能价值', '适用场景', '待解决问题']) {
      expect(screen.getByText(label)).not.toBeNull()
    }
    for (const content of ['Core text', 'Why kept', 'Conclusion text', 'Value text', 'use one', 'use two', 'question one']) {
      expect(screen.getByText(content)).not.toBeNull()
    }
    const cards = Array.from(document.querySelectorAll('.dsh-idea-detail .dsh-idea-detail-field'))
    expect(cards).toHaveLength(6)
    for (const card of cards) {
      expect(card.querySelector('.dsh-idea-detail-label')).not.toBeNull()
    }
    // The preview card (hover) never uses the detail field card class.
    expect(document.querySelectorAll('.dsh-idea-preview .dsh-idea-detail-field')).toHaveLength(0)
  })
})
