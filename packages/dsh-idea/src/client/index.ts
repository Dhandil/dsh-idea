/**
 * Idea client plugin (browser half): mounts the package's own generated
 * Remote contribution, then — only after the `idea` namespace is ready —
 * registers the per-message `💡` action and the Session's preview modal.
 * Unload runs in reverse: the UI scope dies first, then the Remote mount.
 * @module @dsh-external/dsh-idea/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only seat pulls: the Context merges (ctx.remote / ctx.locale /
// ctx.slots) and the SlotMap entries the two registrations type against.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { IdeaRemoteFace } from './state.ts'

import ideaRemote from '@dsh-external/dsh-idea/remote'
import { IdeaSaveDialog } from './IdeaSaveDialog.tsx'
import { IdeaMessageActions } from './IdeaMessageActions.tsx'
import { en, zh } from './locales.ts'
import type { IdeaActionInjected, IdeaDialogInjected } from './slots.ts'
import { IdeaSaveSurface } from './state.ts'
import './styles.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'idea'

/** Required services: the typed Remote mount carrier, the copy, and the slots. */
export const inject = ['remote', 'locale', 'slots']

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
