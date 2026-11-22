'use client'

import { useState } from 'react'
import styles from './ScheduleCard.module.scss'

type Mode = 'off' | 'dry' | 'on'

export interface SocialStatusData {
  mode: Mode
  channels: { name: string; configured: boolean; who: string; needs: string[] }[]
  xLinkMode: 'always' | 'top' | 'never'
  today: { top: number; cap: number }
  x: { mode: 'growth' | 'legacy'; posts: number; cap: number; links: number; linkCap: number; polls: number; pollCap: number }
  recent: {
    id: number
    title: string
    at: string
    dry: boolean
    top: boolean
    reason: string
    results: Record<string, { ok: boolean; ref?: string; error?: string; skipped?: string; note?: string }>
    captions?: Record<string, string>
    x?: { format: 'skip' | 'post' | 'poll' | 'video'; link: boolean; image: boolean; reason: string; copy?: 'ai' | 'plain' }
  }[]
}

const LABEL: Record<string, string> = { telegram: 'Telegram', x: 'X', facebook: 'Facebook Page', instagram: 'Instagram', webhook: 'Webhook (Make/Zapier)' }

const MODES: { value: Mode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'dry', label: 'Preview only' },
  { value: 'on', label: 'Live' },
]

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
}

function resultText(r: { ok: boolean; error?: string; skipped?: string; note?: string } | undefined): string {
  if (!r) return '–'
  if (r.ok) return r.note ? `posted (${r.note})` : 'posted'
  if (r.skipped) return r.skipped
  return `failed: ${r.error ?? 'unknown error'}`
}

export function SocialCard({ initial }: { initial: SocialStatusData }) {
  const [status, setStatus] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function setMode(mode: Mode) {
    if (mode === status.mode) return
    if (mode === 'on' && !window.confirm('Turn on live posting? Every new article will be posted to the connected accounts, in public.')) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      if (!res.ok) throw new Error()
      setStatus((await res.json()) as SocialStatusData)
    } catch {
      setError('Could not change the setting. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const connected = status.channels.filter((c) => c.configured)

  return (
    <section className={styles.card} aria-label="Social media posting">
      <div className={styles.head}>
        <h2 className={styles.title}>Social media: post every published article</h2>
        <div role="group" aria-label="Posting mode" style={{ display: 'flex', gap: 8 }}>
          {MODES.map((m) => (
            <button key={m.value} type="button" className={`${styles.toggle} ${status.mode === m.value ? styles.on : ''}`} disabled={busy} aria-pressed={status.mode === m.value} onClick={() => setMode(m.value)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.note}>
        Each article goes out with its headline, a short summary and a few hashtags. Telegram gets every article; Instagram and Facebook get up to {status.today.cap} a day
        (between 7:00 and 23:00 IST, at least 25 minutes apart, spread over the day; {status.today.top} chosen today).
        {status.x.mode === 'growth'
          ? ` X is in growth mode (${status.x.posts} of ${status.x.cap} tweets today, at least 25 minutes apart), each with a hook and one checked fact, a photo when the cover is a real photo, and one poll a day in the evening (${status.x.polls} of ${status.x.pollCap} today). Links are kept for ${status.x.linkCap} tweets a day (${status.x.links} so far), because a tweet with a link costs far more on the X API.`
          : ' X is in legacy mode: every article is tweeted.'}
        {' '}Preview only writes the posts below without sending anything.
      </p>
      <table className={styles.table}>
        <thead>
          <tr><th>Platform</th><th>Gets</th><th>Status</th></tr>
        </thead>
        <tbody>
          {status.channels.map((c) => (
            <tr key={c.name}>
              <td>{LABEL[c.name] ?? c.name}</td>
              <td>{c.who}</td>
              <td className={c.configured ? styles.ok : styles.missing}>{c.configured ? 'Connected' : `Not set up (${c.needs.join(', ')})`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {status.mode === 'on' && connected.length === 0 && <p className={styles.error}>Live is on but no platform is connected yet, so nothing is posted.</p>}
      {status.recent.length > 0 && (
        <div>
          <p className={styles.note}><strong>Latest</strong></p>
          {status.recent.map((e) => (
            <details key={`${e.id}-${e.dry}`}>
              <summary>
                {e.dry ? '[preview] ' : ''}{e.title} · {formatWhen(e.at)}{e.top ? ' · feed post' : ''}
              </summary>
              <ul>
                {Object.entries(e.results).map(([name, r]) => (
                  <li key={name}>{LABEL[name] ?? name}: {resultText(r)}</li>
                ))}
              </ul>
              {e.x && (
                <p className={styles.note}>
                  X plan: {e.x.format}{e.x.link ? ' + link' : ''}{e.x.image ? ' + photo' : ''}{e.x.copy ? ` · ${e.x.copy === 'ai' ? 'written copy' : 'plain copy'}` : ''} ({e.x.reason})
                </p>
              )}
              {e.captions && Object.entries(e.captions).map(([name, text]) => (
                <p key={name} className={styles.note}><strong>{LABEL[name] ?? name}</strong><br /><span style={{ whiteSpace: 'pre-wrap' }}>{text}</span></p>
              ))}
            </details>
          ))}
        </div>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </section>
  )
}
