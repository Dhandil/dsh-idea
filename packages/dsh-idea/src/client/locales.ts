/**
 * The `idea` locale namespace: every user-visible string of the Save Idea
 * surface and the read-only Ideas library section. Simplified Chinese is the
 * key-set source of truth; English is checked complete against it.
 * @module @dsh-external/dsh-idea/client/locales
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'action.tooltip': '保存为 Idea',
  'dialog.title': '保存 Idea',
  'dialog.source': '来源：当前对话 · {count} 条消息',
  'dialog.close': '关闭',
  'dialog.cancel': '取消',
  'dialog.save': '保存',
  'dialog.saving': '保存中…',
  'field.title': '标题 *',
  'field.core': '核心想法 *',
  'field.motivation': '为什么值得保留 *',
  'field.currentConclusion': '当前结论',
  'field.possibleValue': '可能价值',
  'field.useWhen': '适用场景（每行一条）',
  'field.openQuestions': '待解决问题（每行一条）',
  'toast.saved': 'Idea 已保存',
  'error.prepare': '生成预览失败，请稍后重试',
  'error.save': '保存失败，请稍后重试',
  'error.expired': '预览已过期，请关闭后重新点击 💡 生成',
  'read.nav': 'Ideas',
  'read.loading': '加载中…',
  'read.error': 'Idea 列表加载失败',
  'read.retry': '重试',
  'read.empty': '还没有保存的 Idea。在对话中点击回答旁的 💡 即可保存。',
  'read.back': '返回列表',
  'read.created': '创建于 {time}',
  'read.updated': '更新于 {time}',
  'read.source.short': '来源：会话 {sessionId}',
  'read.source.detail': '来源对话：会话 {sessionId} · 消息 {anchor}',
  'read.source.detail.noAnchor': '来源对话：会话 {sessionId}',
  'read.field.title': '标题',
  'read.field.core': '核心想法',
  'read.field.motivation': '为什么值得保留',
  'read.field.currentConclusion': '当前结论',
  'read.field.possibleValue': '可能价值',
  'read.field.useWhen': '适用场景',
  'read.field.openQuestions': '待解决问题',
  'read.detail.error': '该 Idea 加载失败',
  'read.detail.notFound': '该 Idea 不存在或已不可用',
  'read.history': '版本历史',
  'read.history.current': '当前版本 v{ordinal}',
  'read.reason.initial-save': '初次保存',
  'read.reason.manual-edit': '手动修改',
  'read.reason.continued-discussion': '继续讨论',
} satisfies Record<string, string>

/** The idea namespace key union. */
export type IdeaLocaleKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Idea surface's copy: the action, the modal, the toasts, the library. */
    idea: IdeaLocaleKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'action.tooltip': 'Save as Idea',
  'dialog.title': 'Save Idea',
  'dialog.source': 'Source: current conversation · {count} messages',
  'dialog.close': 'Close',
  'dialog.cancel': 'Cancel',
  'dialog.save': 'Save',
  'dialog.saving': 'Saving…',
  'field.title': 'Title *',
  'field.core': 'Core idea *',
  'field.motivation': 'Why it is worth keeping *',
  'field.currentConclusion': 'Current conclusion',
  'field.possibleValue': 'Possible value',
  'field.useWhen': 'When to use (one per line)',
  'field.openQuestions': 'Open questions (one per line)',
  'toast.saved': 'Idea saved',
  'error.prepare': 'Could not prepare a preview. Try again later.',
  'error.save': 'Could not save the idea. Try again later.',
  'error.expired': 'This preview has expired. Close it and click 💡 again.',
  'read.nav': 'Ideas',
  'read.loading': 'Loading…',
  'read.error': 'Could not load the ideas.',
  'read.retry': 'Retry',
  'read.empty': 'No saved ideas yet. Click the 💡 next to an answer in a conversation to save one.',
  'read.back': 'Back to the list',
  'read.created': 'Created {time}',
  'read.updated': 'Updated {time}',
  'read.source.short': 'From session {sessionId}',
  'read.source.detail': 'Source conversation: session {sessionId} · message {anchor}',
  'read.source.detail.noAnchor': 'Source conversation: session {sessionId}',
  'read.field.title': 'Title',
  'read.field.core': 'Core idea',
  'read.field.motivation': 'Why it is worth keeping',
  'read.field.currentConclusion': 'Current conclusion',
  'read.field.possibleValue': 'Possible value',
  'read.field.useWhen': 'When to use',
  'read.field.openQuestions': 'Open questions',
  'read.detail.error': 'Could not load this idea.',
  'read.detail.notFound': 'This idea does not exist or is no longer available.',
  'read.history': 'Version history',
  'read.history.current': 'Current version v{ordinal}',
  'read.reason.initial-save': 'Initial save',
  'read.reason.manual-edit': 'Manual edit',
  'read.reason.continued-discussion': 'Continued discussion',
} satisfies Record<IdeaLocaleKey, string>
