/** Host-backed, read-only Idea binding for a continued discussion. */
import { useEffect, useState } from 'react'
import type { IdeaDiscussionCardResult } from '../remote-host/types.ts'

export interface DiscussionCardProps {
  read: () => Promise<{ ok: true; value: IdeaDiscussionCardResult | null } | { ok: false }>
  events: {
    subscribe: (listener: () => void) => () => void
    getSnapshot: () => { change: { kind: string; entries?: readonly { type: string; event: { type: string } }[] } }
  }
  t: (key: 'discussion.card.title' | 'discussion.card.pending' | 'discussion.card.delivered' | 'discussion.card.unknown') => string
}

export function IdeaDiscussionCard({ read, events, t }: DiscussionCardProps) {
  const [card, setCard] = useState<IdeaDiscussionCardResult | null>(null)
  useEffect(() => {
    let active = true
    let generation = 0
    const refresh = () => {
      const current = ++generation
      void read().then(result => {
        if (active && current === generation) setCard(result.ok ? result.value : null)
      }).catch(() => {
        if (active && current === generation) setCard(null)
      })
    }
    const unsubscribe = events.subscribe(() => {
      const change = events.getSnapshot().change
      if (change.kind === 'append' && change.entries?.some(entry =>
        entry.type === 'event' && entry.event.type === 'user/message')) refresh()
    })
    refresh()
    return () => { active = false; unsubscribe() }
  }, [read, events])

  if (card === null) return null
  const status = card.injection === 'delivered' ? t('discussion.card.delivered')
    : card.injection === 'pending' ? t('discussion.card.pending') : t('discussion.card.unknown')
  return <aside className="dsh-idea-discussion-card" aria-label={t('discussion.card.title')}>
    <span className="dsh-idea-discussion-card-label">{t('discussion.card.title')}</span>
    <strong>{card.title}</strong>
    <span className="dsh-idea-discussion-card-status">{status}</span>
  </aside>
}
