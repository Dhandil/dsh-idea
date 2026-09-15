/**
 * The `idea` locale namespace: every user-visible string of the Save Idea
 * surface. Simplified Chinese is the key-set source of truth; English is
 * checked complete against it.
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
} satisfies Record<string, string>

/** The idea namespace key union. */
export type IdeaLocaleKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Save Idea surface's copy: the action, the modal, and the toasts. */
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
} satisfies Record<IdeaLocaleKey, string>
