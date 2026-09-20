/**
 * Idea client plugin (browser half): mounts the package's own generated
 * Remote contribution, then — only after the `idea` namespace is ready —
 * registers the unified per-message Idea action, the Session's preview
 * modal, the Related Ideas overlay, the conversation search card behind the
 * `idea` command, the `idea` composer reference source, and the read-only
 * Ideas library settings section. Unload runs in reverse: the UI scope dies
 * first, then the Remote mount.
 * @module @dsh-external/dsh-idea/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only seat pulls: the Context merges (ctx.remote / ctx.locale /
// ctx.slots / ctx.commandUi / ctx.inputTriggers / ctx.conversation) and the
// SlotMap entries the registrations type against.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { parseIdeaReferenceText } from '../reference/uri.ts'
import type { IdeaReferenceDescriptor } from '../reference/types.ts'
import type { IdeaReadFace } from './read-state.ts'
import type { IdeaRemoteFace } from './state.ts'
import type { IdeaRelatedFace } from './related-state.ts'
import type { IdeaSearchFace } from './search-state.ts'
import { appendIdeaReferenceNotified } from './reference-append.ts'
import type { ReferenceAppendSeams } from './reference-append.ts'

import ideaRemote from '@dsh-external/dsh-idea/remote'
import { IdeaSaveDialog } from './IdeaSaveDialog.tsx'
import { IdeaAssistantActions } from './IdeaAssistantActions.tsx'
import { IdeaRelatedOverlay } from './IdeaRelatedOverlay.tsx'
import { IdeaSearchCard } from './IdeaSearchCard.tsx'
import { IdeaSection } from './IdeaSection.tsx'
import { IdeaLightbulbIcon } from './icons.tsx'
import { installIdeaNavIcon } from './nav-icon.ts'
import { en, zh } from './locales.ts'
import { IdeaReadSurface } from './read-state.ts'
import { RelatedIdeasSurface } from './related-state.ts'
import { IdeaSearchSurface } from './search-state.ts'
import { selectContinuationWorkspace } from './workspace.ts'
import type { WorkspaceRow } from './workspace.ts'
import type {
  IdeaDialogInjected,
  IdeaSectionInjected,
  RelatedOverlayInjected,
  SearchCardInjected,
  UnifiedActionInjected,
} from './slots.ts'
import { IdeaSaveSurface } from './state.ts'
import './styles.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'idea'

/** Required services: the typed Remote mount carrier, the copy, the slots, the session domain, and the composer command / input-trigger / conversation seams (accessed via ctx.commandUi / ctx.inputTriggers / ctx.conversation — cordis rejects any service access not declared here). */
export const inject = ['remote', 'locale', 'slots', 'sessions', 'commandUi', 'inputTriggers', 'conversation']

/**
 * Register the UI half once the mounted `idea` namespace is available. Lives
 * in an inner scope, so it disposes before the Remote mount unwinds.
 * @param ctx - the inner client scope.
 */
function registerUi(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-idea: dictionaries')

  const t = ctx.locale.bind(NS)

  // The Ideas nav row's glyph (T9R2 R2): the frozen shell hardcodes nav
  // icons by section id (unknown = gear), so the plugin upgrades its own
  // row to the same shared lightbulb the conversation action uses.
  ctx.effect(() => installIdeaNavIcon(t('read.nav')), 'dsh-idea: settings nav icon')

  const sessions = ctx.sessions as unknown as ISessions

  const surfaces = new Map<SessionId, IdeaSaveSurface>()
  const surfaceFor = (sessionId: SessionId): IdeaSaveSurface => {
    let surface = surfaces.get(sessionId)
    if (surface === undefined) {
      surface = new IdeaSaveSurface(ctx.remote.idea as IdeaRemoteFace, sessionId)
      surfaces.set(sessionId, surface)
    }
    return surface
  }
  ctx.effect(() => () => {
    for (const surface of surfaces.values()) surface.dispose()
    surfaces.clear()
  }, 'dsh-idea: per-session surfaces')

  const relatedSurfaces = new Map<SessionId, RelatedIdeasSurface>()
  const relatedFor = (sessionId: SessionId): RelatedIdeasSurface => {
    let surface = relatedSurfaces.get(sessionId)
    if (surface === undefined) {
      surface = new RelatedIdeasSurface(ctx.remote.idea as IdeaRelatedFace, sessionId)
      relatedSurfaces.set(sessionId, surface)
    }
    return surface
  }
  ctx.effect(() => () => {
    for (const surface of relatedSurfaces.values()) surface.dispose()
    relatedSurfaces.clear()
  }, 'dsh-idea: per-session related surfaces')

  const searchSurfaces = new Map<SessionId, IdeaSearchSurface>()
  const searchFor = (sessionId: SessionId): IdeaSearchSurface => {
    let surface = searchSurfaces.get(sessionId)
    if (surface === undefined) {
      surface = new IdeaSearchSurface(ctx.remote.idea as IdeaSearchFace)
      searchSurfaces.set(sessionId, surface)
    }
    return surface
  }
  ctx.effect(() => () => {
    for (const surface of searchSurfaces.values()) surface.dispose()
    searchSurfaces.clear()
  }, 'dsh-idea: per-session search surfaces')

  /** Resolve the live composer seams of one Session for reference appends. */
  const appendSeamsFor = (sessionId: SessionId): ReferenceAppendSeams | undefined => {
    const actx = sessions.scope(sessionId)
    if (actx === undefined) return undefined
    const input = ctx.conversation.input.for(actx)
    return {
      input,
      insertText: (text, span) => actx.bail(actx, 'slash/input-insert-text', { text, span }) === true,
    }
  }

  /**
   * Attach one reference to the Session's draft. Reports whether the append
   * applied; a failure reports locally and the caller keeps its surface open.
   */
  const attachReference = (sessionId: SessionId, descriptor: IdeaReferenceDescriptor): boolean => {
    const seams = appendSeamsFor(sessionId)
    if (seams === undefined) return false
    return appendIdeaReferenceNotified(seams, descriptor, t('search.addFailed'))
  }

  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'idea',
    order: 20,
    locale: NS,
    inject: (sessionId): UnifiedActionInjected => ({
      hooks: {
        idea: surfaceFor(sessionId).state,
        related: relatedFor(sessionId).state,
      },
      prepare: (messageId) => { surfaceFor(sessionId).prepare(messageId) },
      findRelated: (messageId) => { relatedFor(sessionId).findRelated(messageId) },
    }),
  }, IdeaAssistantActions))

  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'idea-dialog',
    order: 3,
    locale: NS,
    inject: (sessionId): IdeaDialogInjected => {
      const surface = surfaceFor(sessionId)
      return {
        hooks: { idea: surface.state },
        editDraft: (patch) => { surface.editDraft(patch) },
        submit: () => { surface.submit() },
        cancel: () => { surface.cancel() },
        dismissFailure: () => { surface.dismissFailure() },
        dismissToast: (seq) => { surface.dismissToast(seq) },
      }
    },
  }, IdeaSaveDialog))

  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'idea-related',
    order: 4,
    locale: NS,
    inject: (sessionId): RelatedOverlayInjected => {
      const surface = relatedFor(sessionId)
      return {
        hooks: { related: surface.state },
        close: () => { surface.close() },
        getDetail: id => (ctx.remote.idea as IdeaReadFace).get({ id }),
        add: (descriptor) => { attachReference(sessionId, descriptor) },
      }
    },
  }, IdeaRelatedOverlay))

  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: 'idea-search',
    order: 5,
    locale: NS,
    inject: (sessionId): SearchCardInjected => {
      const surface = searchFor(sessionId)
      return {
        hooks: { search: surface.state },
        setQuery: (query) => { surface.setQuery(query) },
        select: (id) => { surface.select(id) },
        retry: () => { surface.retry() },
        add: (descriptor) => {
          // The card closes only after a successful append; a CAS/seam
          // failure keeps it open with the localized composer notice.
          if (attachReference(sessionId, descriptor)) {
            surface.close()
          }
        },
        close: () => { surface.close() },
      }
    },
  }, IdeaSearchCard))

  // The `idea` command: the single composer `+`-menu entry opening the
  // search card. The action only opens the card; attaching happens through
  // the card's Add verb and never submits.
  ctx.effect(() => ctx.commandUi.register({
    name: 'idea',
    label: () => t('search.command'),
    description: () => t('search.commandDescription'),
    icon: IdeaLightbulbIcon,
    available: () => true,
    ui: {
      kind: 'action',
      run: (session) => { searchFor(SessionId(session.sessionId)).open() },
    },
  }), 'dsh-idea: idea command')

  // The `idea` composer reference source: the owner of every attached Idea
  // chip. The menu offers no candidates (attachment happens through the
  // search card); the codec validates that every serialized reference is one
  // canonical mention, so a broken chip fails the submit instead of silently
  // degrading the message to plain text.
  ctx.effect(() => ctx.inputTriggers.registerSource({
    trigger: '@',
    name: 'idea',
    showGroupTitle: false,
    candidates: async () => [],
    onPick: () => 'handled',
    codec: {
      clipboardText: ref => ref,
      serialize: async (ref) => {
        const parsed = parseIdeaReferenceText(ref)
        if (parsed.length !== 1 || parsed[0]!.mention !== ref) {
          throw new Error('idea reference chip is not one canonical mention')
        }
        return ref
      },
    },
  }), 'dsh-idea: idea reference source')

  // The library (both views), its detail, and the lifecycle flows: one
  // root-scoped surface behind the settings section; the selected view
  // loads when the user first opens the page, Continue Discussion re-pulls
  // the session list before opening the created conversation (the Host's
  // `session/created` stream and the RPC response race, so select must see
  // a refreshed baseline).
  // Face of the shared Workspace navigation, resolved lazily per click: a
  // deployment without the workspace domain keeps Continue Discussion on the
  // Host-created default conversation.
  type WorkspaceListFace = {
    list: {
      getSnapshot(): {
        phase: string
        items: readonly WorkspaceRow[]
      }
    }
  }
  const prepareWorkspace = async (): Promise<string | undefined> => {
    const workspaces = ctx.get('workspaces') as WorkspaceListFace | undefined
    if (workspaces === undefined) return undefined
    const snapshot = workspaces.list.getSnapshot()
    if (snapshot.phase !== 'ready') return undefined
    // The client names only the Workspace; the Host's Session Controller
    // creates the Session and attaches it to that Workspace.
    return selectContinuationWorkspace(snapshot.items, sessions.list.getSnapshot().current)
  }
  const readSurface = new IdeaReadSurface(ctx.remote.idea as IdeaReadFace, async (conversationId) => {
    await sessions.refresh()
    sessions.open(SessionId(conversationId))
  }, prepareWorkspace)
  ctx.effect(() => () => { readSurface.dispose() }, 'dsh-idea: library read surface')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'ideas',
    order: 25,
    label: () => ctx.locale.bind(NS)('read.nav'),
    locale: NS,
    inject: (): IdeaSectionInjected => ({
      hooks: { ideaRead: readSurface.state },
      load: () => { readSurface.load() },
      searchIdeas: (query) => { readSurface.searchIdeas(query) },
      selectView: (view) => { readSurface.selectView(view) },
      open: (id) => { readSurface.open(id) },
      closeDetail: () => { readSurface.closeDetail() },
      openEditor: (id) => { readSurface.openEditor(id) },
      continueIdea: (id) => { readSurface.continueDiscussion(id) },
      prepareEvolution: () => { readSurface.prepareEvolution() },
      editProposalDraft: (patch) => { readSurface.editProposalDraft(patch) },
      cancelProposal: () => { readSurface.cancelProposal() },
      commitProposal: () => { readSurface.commitProposal() },
      editDraft: (patch) => { readSurface.editDraft(patch) },
      cancelEdit: () => { readSurface.cancelEdit() },
      saveEdit: () => { readSurface.commitEdit() },
      archiveIdea: () => { readSurface.archiveIdea() },
      restoreIdea: () => { readSurface.restoreIdea() },
      requestDelete: () => { readSurface.requestDelete() },
      cancelDelete: () => { readSurface.cancelDelete() },
      confirmDelete: () => { readSurface.confirmDelete() },
    }),
  }, IdeaSection))
}

/**
 * Client plugin body: mount the generated Remote contribution, then register
 * the UI on top of the ready namespace.
 * @param ctx - client root context.
 * @returns the Remote mount disposer, run after the UI scope has unwound.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(ideaRemote)
  ctx.inject(['remote.idea', 'locale', 'slots'], registerUi)
  return async () => {
    await disposeRemote()
  }
}
