'use client'

import { useState } from 'react'
import styles from './ScheduleCard.module.scss'

interface DeskStatus {
  authorName: string
  authorId: string | null
  categories: { slug: string; name: string | null; active: boolean }[]
}

export interface ScheduleStatusData {
  enabled: boolean
  autoPublish: boolean
  desks: DeskStatus[]
  last: { title: string; slug: string; publishedAt: string | null; authorName: string | null; category: string | null } | null
}

function formatWhen(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
}

export function ScheduleCard({ initial }: { initial: ScheduleStatusData }) {
  const [status, setStatus] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function setEnabled(enabled: boolean) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/news-automation/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error()
      setStatus((await res.json()) as ScheduleStatusData)
    } catch {
      setError('Could not change the schedule. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const missing = status.desks.filter((d) => !d.authorId)

  return (
    <section className={styles.card} aria-label="Automatic schedule">
      <div className={styles.head}>
        <h2 className={styles.title}>Automatic schedule: one article every 30 minutes</h2>
        <button type="button" className={`${styles.toggle} ${status.enabled ? styles.on : ''}`} disabled={busy} onClick={() => setEnabled(!status.enabled)}>
          {status.enabled ? 'Running — click to pause' : 'Paused — click to resume'}
        </button>
      </div>
      <p className={styles.note}>
        Each run takes the category that has waited longest, writes the best fresh story for it and publishes it under that category&apos;s author.
        {status.autoPublish ? '' : ' Auto-publish is off, so scheduled articles are saved as drafts.'}
      </p>
      <table className={styles.table}>
        <thead>
          <tr><th>Author</th><th>Categories</th><th>Account</th></tr>
        </thead>
        <tbody>
          {status.desks.map((d) => (
            <tr key={d.authorName}>
              <td>{d.authorName}</td>
              <td>{d.categories.map((c) => (c.name && c.active ? c.name : `${c.slug} (missing)`)).join(', ')}</td>
              <td className={d.authorId ? styles.ok : styles.missing}>{d.authorId ? 'Found' : 'No account'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {missing.length > 0 && (
        <p className={styles.error}>
          No account named {missing.map((d) => `"${d.authorName}"`).join(', ')}: those categories are skipped until the account exists (Admin → Users).
        </p>
      )}
      {status.last && (
        <p className={styles.note}>
          Last scheduled article: <a href={`/article/${status.last.slug}`} target="_blank" rel="noopener noreferrer">{status.last.title}</a>
          {status.last.category ? ` · ${status.last.category}` : ''}{status.last.authorName ? ` · ${status.last.authorName}` : ''}{status.last.publishedAt ? ` · ${formatWhen(status.last.publishedAt)}` : ''}
        </p>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </section>
  )
}
