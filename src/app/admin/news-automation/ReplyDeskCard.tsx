'use client'

import { useState } from 'react'
import styles from './ScheduleCard.module.scss'

export interface ReplyDeskData {
  mode: 'off' | 'dry' | 'on'
  repliesOff: boolean
  answered: number
  cap: number
  lastRunAt: string | null
  deskAt: string | null
  targets: string[]
  desk: { id: string; username: string; name: string; text: string; createdAt: string; url: string; draft: string }[]
  log: { at: string; to: string; text: string; dry: boolean; ok: boolean; error?: string }[]
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'not yet'
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
}

export function ReplyDeskCard({ initial }: { initial: ReplyDeskData }) {
  const [data, setData] = useState(initial)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [copied, setCopied] = useState('')

  async function send(body: { action: 'refresh' | 'done' | 'skip'; id?: string }) {
    setBusy(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch('/api/admin/x-replies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error()
      const next = (await res.json()) as ReplyDeskData & { message?: string }
      setData(next)
      if (next.message) setInfo(next.message)
    } catch {
      setError('That did not work. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      setError('Could not copy. Select the text and copy it by hand.')
    }
  }

  return (
    <section className={styles.card} aria-label="X replies">
      <div className={styles.head}>
        <h2 className={styles.title}>X replies: answer-back and reply desk</h2>
        <button type="button" className={styles.toggle} disabled={busy || data.mode === 'off'} onClick={() => send({ action: 'refresh' })}>
          {busy ? 'Working…' : 'Refresh desk now'}
        </button>
      </div>
      <p className={styles.note}>
        {data.repliesOff ? 'Replies are switched off (X_REPLIES=off). ' : data.mode === 'off' ? 'Social posting is off, so nothing runs. ' : ''}
        <strong>Answer-back</strong> (automatic): a short, checked answer to people who reply to or mention the account, up to {data.cap} a day, one per person.
        {data.mode === 'dry' ? ' Preview mode only writes the answers in the list below.' : ''} Answered today: {data.answered} of {data.cap}.
        {' '}<strong>Reply desk</strong> (you post by hand): fresh posts of {data.targets.slice(0, 6).join(', ')}{data.targets.length > 6 ? ` and ${data.targets.length - 6} more` : ''} with a draft reply.
        X does not allow automatic replies to accounts that have not written to you, so open the post, read it, edit the draft and post it yourself. A good habit is 10 to 15 replies a day, early, while the post is fresh.
        {' '}Last run {formatWhen(data.lastRunAt)}; desk refreshed {formatWhen(data.deskAt)}.
      </p>
      {data.desk.length === 0 && <p className={styles.note}>No open posts on the desk. It fills a few times a day between 8:30 and 22:30 IST.</p>}
      {data.desk.map((item) => {
        const text = drafts[item.id] ?? item.draft
        return (
          <div key={item.id} style={{ borderTop: '1px solid var(--border-color, #ddd)', paddingTop: 12, display: 'grid', gap: 8 }}>
            <p className={styles.note}>
              <strong>@{item.username}</strong> · {formatWhen(item.createdAt)} ·{' '}
              <a href={item.url} target="_blank" rel="noopener noreferrer">Open post</a>
              <br />
              <span style={{ whiteSpace: 'pre-wrap' }}>{item.text}</span>
            </p>
            <textarea
              value={text}
              rows={3}
              maxLength={280}
              aria-label={`Draft reply to @${item.username}`}
              onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
              style={{ width: '100%', font: 'inherit', padding: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className={styles.toggle} onClick={() => copy(item.id, text)}>{copied === item.id ? 'Copied' : 'Copy draft'}</button>
              <button type="button" className={styles.toggle} disabled={busy} onClick={() => send({ action: 'done', id: item.id })}>Done</button>
              <button type="button" className={styles.toggle} disabled={busy} onClick={() => send({ action: 'skip', id: item.id })}>Skip</button>
            </div>
          </div>
        )
      })}
      {data.log.length > 0 && (
        <details>
          <summary>Answer-back log ({data.log.length})</summary>
          <ul>
            {data.log.slice(0, 15).map((e, i) => (
              <li key={`${e.at}-${i}`}>
                {formatWhen(e.at)} · @{e.to}{e.dry ? ' [preview]' : ''}: {e.ok ? e.text : `failed (${e.error ?? 'unknown error'})`}
              </li>
            ))}
          </ul>
        </details>
      )}
      {info && <p className={styles.note}>{info}</p>}
      {error && <p className={styles.error}>{error}</p>}
    </section>
  )
}
