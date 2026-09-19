/**
 * The injected business faces of the two Idea slot entries. The framework
 * binds the `hooks` compartment into `use<Name>` selector hooks; every other
 * member passes through verbatim.
 * @module @dsh-external/dsh-idea/client/slots
 */

import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import type { IdeaDetail, IdeaReferenceDescriptor } from '../remote-host/types.ts'
import type { IdeaReadState } from './read-state.ts'
import type { IdeaSearchUiState } from './search-state.ts'
import type { RelatedIdeasUiState } from './related-state.ts'
import type { EditableIdeaDraft, IdeaSaveState } from './state.ts'

/** Injected business face of one assistant-message unified Idea action. */
export interface UnifiedActionInjected {
  hooks: {
    /** The owning Session's Idea interaction state (Save Idea). */
    idea: HostObservable<IdeaSaveState>
    /** The owning Session's Related Ideas interaction state. */
    related: HostObservable<RelatedIdeasUiState>
  }
  /** Start the (at most one) prepare call for this message. */
  prepare: (messageId: MessageId) => void
  /** Start the (at most one) related-Ideas query for this message. */
  findRelated: (messageId: MessageId) => void
}

/** Full props of one assistant-message unified Idea action entry. */
export type UnifiedActionProps =
  PropsRuntime<'conversation.chat.assistant-actions'>
  & InjectFace<UnifiedActionInjected>
  & PropsLocale<'idea'>

/** Injected business face of the Session's Idea search card. */
export interface SearchCardInjected {
  hooks: {
    /** The owning Session's Idea search interaction state. */
    search: HostObservable<IdeaSearchUiState>
  }
  /** Run one search for the typed query (blank = the recency list). */
  setQuery: (query: string) => void
  /** Select exactly one result row. */
  select: (id: string) => void
  /** Re-run the current query after a failure. */
  retry: () => void
  /** Attach the selected Idea reference to the draft and close the card. */
  add: (descriptor: IdeaReferenceDescriptor) => void
  /** Close the card with zero side effects. */
  close: () => void
}

/** Full props of the Idea search card entry. */
export type SearchCardProps =
  InjectFace<SearchCardInjected>
  & PropsLocale<'idea'>

/** Injected business face of the Session's Related Ideas overlay. */
export interface RelatedOverlayInjected {
  hooks: {
    /** The owning Session's Related Ideas interaction state. */
    related: HostObservable<RelatedIdeasUiState>
  }
  /** Close the overlay and reset its state. */
  close: () => void
  /** Read one Idea's full current-version detail (read-only View). */
  getDetail: (id: string) => Promise<
    | { ok: true; value: IdeaDetail }
    | { ok: false; error: { code: string } }
  >
  /** Attach one Idea's pinned reference to the draft; never submits. */
  add: (descriptor: IdeaReferenceDescriptor) => void
}

/** Full props of the Related Ideas overlay entry. */
export type RelatedOverlayProps =
  InjectFace<RelatedOverlayInjected>
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
    /** The Idea library state: both views, the detail, and the lifecycles. */
    ideaRead: HostObservable<IdeaReadState>
  }
  /** Load the selected view's list; called once when the section first renders. */
  load: () => void
  /** Run the section search for the typed query (blank returns to the tabs). */
  searchIdeas: (query: string) => void
  /** Switch the library tab (current/archived); a read-only operation. */
  selectView: (view: 'current' | 'archived') => void
  /** Open one Idea's detail. */
  open: (id: string) => void
  /** Return from the detail to the list. */
  closeDetail: () => void
  /** Open the manual-edit editor for one Idea (from detail or hover card). */
  openEditor: (id: string) => void
  /** Continue one Idea as a new discussion and open its conversation. */
  continueIdea: (id: string) => void
  /** Ask the Host to propose the next version from the detail's discussion. */
  prepareEvolution: () => void
  /** Apply one field edit to the proposal under review. */
  editProposalDraft: (patch: Partial<EditableIdeaDraft>) => void
  /** Discard the proposal under review; zero durable writes. */
  cancelProposal: () => void
  /** Commit the approved proposal as the next immutable version. */
  commitProposal: () => void
  /** Apply one field edit to the manual-edit form. */
  editDraft: (patch: Partial<EditableIdeaDraft>) => void
  /** Discard the manual-edit form; zero durable writes. */
  cancelEdit: () => void
  /** Save the edited draft as the next version at the opened-at version. */
  saveEdit: () => void
  /** Archive the open idea. */
  archiveIdea: () => void
  /** Restore the open archived idea. */
  restoreIdea: () => void
  /** Open the permanent-delete confirmation (detail-only). */
  requestDelete: () => void
  /** Close the delete confirmation; zero durable writes. */
  cancelDelete: () => void
  /** Confirm the permanent delete at the opened-at version. */
  confirmDelete: () => void
}

/** Full props of the Ideas settings section entry. */
export type IdeaSectionProps =
  PropsRuntime<'settings.section'>
  & InjectFace<IdeaSectionInjected>
  & PropsLocale<'idea'>
