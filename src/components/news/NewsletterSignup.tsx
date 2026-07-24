'use client'
import { useState } from 'react'
import styles from './NewsletterSignup.module.scss'

export function NewsletterSignup() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (status === 'loading') return
    setStatus('loading')
    setError('')
    const form = e.currentTarget
    const honeypot = (form.elements.namedItem('website') as HTMLInputElement | null)?.value || ''
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website: honeypot }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Something went wrong — please try again')
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again')
    }
  }

  return (
    <section className={styles.newsletter} aria-label="Newsletter signup">
      <div className={styles.inner}>
        <div className={styles.text}>
          {/*
            FIX: h2 → p with role="heading" aria-level="2"
            "Stay ahead of the news" was counted as a heading by Seobility,
            adding to the 36-heading flood. The section already has
            aria-label="Newsletter signup" so screen readers still
            understand the section. Visual style is unchanged (same class).
          */}
          <p className={styles.title} role="heading" aria-level={2}>
            Stay ahead of the news
          </p>
          <p className={styles.subtitle}>
            Get the day&apos;s top stories delivered straight to your inbox. No spam, unsubscribe anytime.
          </p>
        </div>

        {status === 'success' ? (
          <p className={styles.success} role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            You&apos;re subscribed! Welcome aboard.
          </p>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            {/* Honeypot — hidden from humans, catches bots */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className={styles.honeypot}
            />
            <div className={styles.row}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email address"
                required
                maxLength={254}
                className={styles.input}
                aria-label="Email address"
                disabled={status === 'loading'}
              />
              <button type="submit" className={styles.button} disabled={status === 'loading'}>
                {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
              </button>
            </div>
            {status === 'error' && (
              <p className={styles.error} role="alert">{error}</p>
            )}
          </form>
        )}
      </div>
    </section>
  )
}
