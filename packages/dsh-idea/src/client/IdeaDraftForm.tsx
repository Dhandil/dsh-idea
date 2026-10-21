import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode, TextareaHTMLAttributes } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EditableIdeaDraft } from './state.ts'
import type { IdeaLocaleKey } from './locales.ts'

export const IDEA_FORM_FIELDS: ReadonlyArray<{
  key: keyof EditableIdeaDraft
  label: IdeaLocaleKey
  multiline: boolean
}> = [
  { key: 'title', label: 'field.title', multiline: false },
  { key: 'core', label: 'field.core', multiline: true },
  { key: 'motivation', label: 'field.motivation', multiline: true },
  { key: 'currentConclusion', label: 'field.currentConclusion', multiline: true },
  { key: 'possibleValue', label: 'field.possibleValue', multiline: true },
  { key: 'useWhenText', label: 'field.useWhen', multiline: true },
  { key: 'openQuestionsText', label: 'field.openQuestions', multiline: true },
]

/** Grow with wrapped content, then scroll within the CSS height cap. */
export function IdeaAutoTextarea({ inputRef, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  inputRef?: (node: HTMLTextAreaElement | null) => void
}): ReactNode {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return
    const resize = () => {
      node.style.height = 'auto'
      node.style.height = `${Math.max(node.scrollHeight, 40)}px`
    }
    resize()
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize) }
  }, [props.value])
  return <textarea {...props} ref={node => {
    ref.current = node
    inputRef?.(node)
  }} className={`dsh-idea-auto-textarea ${props.className ?? ''}`} />
}

function IdeaListField({ label, value, disabled, onChange, t }: {
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
  t: (key: IdeaLocaleKey, params?: Record<string, unknown>) => string
}): ReactNode {
  const rows = value.split('\n')
  const refs = useRef<Array<HTMLTextAreaElement | null>>([])
  const [focusRow, setFocusRow] = useState<number | null>(null)
  useEffect(() => {
    if (focusRow === null) return
    refs.current[focusRow]?.focus()
    setFocusRow(null)
  }, [focusRow, value])

  const update = (index: number, next: string) => {
    const replacement = next.replace(/\r\n?/g, '\n').split('\n')
    onChange([...rows.slice(0, index), ...replacement, ...rows.slice(index + 1)].join('\n'))
    if (replacement.length > 1) setFocusRow(index + replacement.length - 1)
  }
  return (
    <fieldset className="dsh-idea-list-field">
      <legend>{label}</legend>
      {rows.map((row, index) => (
        <div className="dsh-idea-list-item" key={index}>
          <IdeaAutoTextarea
            inputRef={node => { refs.current[index] = node }}
            aria-label={t('field.list.item', { label, index: index + 1 })}
            value={row}
            rows={1}
            readOnly={disabled}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => { update(index, event.target.value) }}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                const start = event.currentTarget.selectionStart
                const end = event.currentTarget.selectionEnd
                onChange([...rows.slice(0, index), row.slice(0, start), row.slice(end), ...rows.slice(index + 1)].join('\n'))
                setFocusRow(index + 1)
              }
            }}
          />
          <Button
            variant="outline"
            disabled={disabled}
            aria-label={t('field.list.removeAria', { label, index: index + 1 })}
            onClick={() => {
              onChange(rows.length === 1 ? '' : rows.filter((_, rowIndex) => rowIndex !== index).join('\n'))
              setFocusRow(Math.max(0, index - 1))
            }}
          >{t('field.list.remove')}</Button>
        </div>
      ))}
      <Button variant="outline" aria-label={t('field.list.addAria', { label })} disabled={disabled} onClick={() => {
        onChange(`${value}\n`)
        setFocusRow(rows.length)
      }}>{t('field.list.add')}</Button>
    </fieldset>
  )
}

/** All save surfaces share the same seven fields and newline-backed lists. */
export function IdeaDraftFields({ draft, disabled, onEdit, t }: {
  draft: EditableIdeaDraft
  disabled: boolean
  onEdit: (patch: Partial<EditableIdeaDraft>) => void
  t: (key: IdeaLocaleKey, params?: Record<string, unknown>) => string
}): ReactNode {
  return <>
    {IDEA_FORM_FIELDS.map(field => {
      const label = t(field.label)
      if (field.key === 'useWhenText' || field.key === 'openQuestionsText') {
        return <IdeaListField key={field.key} label={label} value={draft[field.key]} disabled={disabled}
          onChange={value => { onEdit({ [field.key]: value }) }} t={t} />
      }
      return <label key={field.key} className="dsh-idea-field">
        <span>{label}</span>
        {field.multiline
          ? <IdeaAutoTextarea value={draft[field.key]} readOnly={disabled}
              onChange={event => { onEdit({ [field.key]: event.target.value }) }} />
          : <input type="text" value={draft[field.key]} readOnly={disabled}
              onChange={event => { onEdit({ [field.key]: event.target.value }) }} />}
      </label>
    })}
  </>
}
