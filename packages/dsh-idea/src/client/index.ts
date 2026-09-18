/**
 * Idea client plugin (browser half): mounts the package's own generated
 * Remote contribution, then — only after the `idea` namespace is ready —
 * registers the per-message `💡` action, the Session's preview modal, and
 * the read-only Ideas library settings section. Unload runs in reverse: the
 * UI scope dies first, then the Remote mount.
 * @module @dsh-external/dsh-idea/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only seat pulls: the Context merges (ctx.remote / ctx.locale /
// ctx.slots) and the SlotMap entries the three registrations type against.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { IdeaReadFace } from './read-state.ts'
import type { IdeaRemoteFace } from './state.ts'
import type { IdeaRelatedFace } from './related-state.ts'

import ideaRemote from '@dsh-external/dsh-idea/remote'
import { IdeaSaveDialog } from './IdeaSaveDialog.tsx'
import { IdeaMessageActions } from './IdeaMessageActions.tsx'
import { IdeaRelatedActions } from './IdeaRelatedActions.tsx'
import { IdeaRelatedOverlay } from './IdeaRelatedOverlay.tsx'
import { IdeaSection } from './IdeaSection.tsx'
import { en, zh } from './locales.ts'
import { IdeaReadSurface } from './read-state.ts'
import { RelatedIdeasSurface } from './related-state.ts'
import { selectContinuationWorkspace } from './workspace.ts'
import type { WorkspaceRow } from './workspace.ts'
import type {
  IdeaActionInjected,
  IdeaDialogInjected,
  IdeaSectionInjected,
  RelatedActionInjected,
  RelatedOverlayInjected,
} from './slots.ts'
import { IdeaSaveSurface } from './state.ts'
import './styles.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'idea'

/** Required services: the typed Remote mount carrier, the copy, the slots, and the session domain. */
export const inject = ['remote', 'locale', 'slots', 'sessions']

/**
 * Register the UI half once the mounted `idea` namespace is available. Lives
 * in an inner scope, so it disposes before the Remote mount unwinds.
 * @param ctx - the inner client scope.
 */
function registerUi(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-idea: dictionaries')

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

  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'idea',
    order: 20,
    locale: NS,
    inject: (sessionId): IdeaActionInjected => ({
      hooks: { idea: surfaceFor(sessionId).state },
      prepare: (messageId) => { surfaceFor(sessionId).prepare(messageId) },
    }),
  }, IdeaMessageActions))

  ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'idea-related',
    order: 21,
    locale: NS,
    inject: (sessionId): RelatedActionInjected => ({
      hooks: { related: relatedFor(sessionId).state },
      findRelated: (messageId) => { relatedFor(sessionId).findRelated(messageId) },
    }),
  }, IdeaRelatedActions))

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
      }
    },
  }, IdeaRelatedOverlay))

  // The library (both views), its detail, and the lifecycle flows: one
  // root-scoped surface behind the settings section; the selected view
  // loads when the user first opens the page, Continue Discussion re-pulls
  // the session list before opening the created conversation (the Host's
  // `session/created` stream and the RPC response race, so select must see
  // a refreshed baseline).
  // The cast pins the client Session domain face: two published packages
  // augment `ctx.sessions` with conflicting types, so the ambient property
  // type is unusable and the installed service is the session-controller's.
  const sessions = ctx.sessions as unknown as ISessions
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
