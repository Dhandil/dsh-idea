/**
 * The injected business faces of the two Idea slot entries. The framework
 * binds the `hooks` compartment into `use<Name>` selector hooks; every other
 * member passes through verbatim.
 * @module @dsh-external/dsh-idea/client/slots
 */

import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import type { IdeaReadState } from './read-state.ts'
import type { EditableIdeaDraft, IdeaSaveState } from './state.ts'

/** Injected business face of one assistant-message Idea action. */
export interface IdeaActionInjected {
  hooks: {
    /** The owning Session's Idea interaction state. */
    idea: HostObservable<IdeaSaveState>
  }
  /** Start the (at most one) prepare call for this message. */
  prepare: (messageId: MessageId) => void
}

/** Full props of one assistant-message Idea action entry. */
export type IdeaActionProps =
  PropsRuntime<'conversation.chat.assistant-actions'>
  & InjectFace<IdeaActionInjected>
  & PropsLocale<'idea'>

/** Injected business face of the Session's Idea preview modal. */
export interface IdeaDialogInjected {
  hooks: {
    /** The owning Session's Idea interaction state. */
    idea: HostObservable<IdeaSaveState>
  }
  /** Apply one field edit to the open modal's draft. */
  editDraft: (patch: Partial<EditableIdeaDraft>) => void
  /** Submit the edited draft to the Host. */
  submit: () => void
  /** Close the modal with zero durable writes. */
  cancel: () => void
  /** Retire the failure toast. */
  dismissFailure: () => void
  /** Retire the success toast. */
  dismissToast: (seq: number) => void
}

/** Full props of the Idea preview modal overlay entry. */
export type IdeaDialogProps =
  InjectFace<IdeaDialogInjected>
  & PropsLocale<'idea'>

/** Injected business face of the Ideas settings section. */
export interface IdeaSectionInjected {
  hooks: {
    /** The read-only Idea library state. */
    ideaRead: HostObservable<IdeaReadState>
  }
  /** Load the list; called once when the section first renders. */
  load: () => void
  /** Open one Idea's detail. */
  open: (id: string) => void
  /** Return from the detail to the list. */
  closeDetail: () => void
}

/** Full props of the Ideas settings section entry. */
export type IdeaSectionProps =
  PropsRuntime<'settings.section'>
  & InjectFace<IdeaSectionInjected>
  & PropsLocale<'idea'>
