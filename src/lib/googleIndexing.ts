import { createSign } from 'crypto'

type NotifyType = 'URL_UPDATED' | 'URL_DELETED'

// ── IndexNow ─────────────────────────────────────────────────────────────────
// Per-URL ping to Bing/Yandex (they share with Google). Only for new/updated URLs.
async function notifyIndexNow(url: string): Promise<void> {
  const key = process.env.INDEXNOW_KEY
  if (!key) return

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'
  const host = new URL(siteUrl).hostname

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, urlList: [url] }),
  })
  if (!res.ok) console.error('IndexNow error:', res.status, await res.text())
}

// ── Google Indexing API via OAuth (newsedition1@gmail.com) ───────────────────
// Uses refresh token — access token auto-generated each time, refresh token never expires
async function notifyGoogleOAuth(url: string, type: NotifyType): Promise<void> {
  const clientId = process.env.GOOGLE_INDEXING_CLIENT_ID
  const clientSecret = process.env.GOOGLE_INDEXING_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_INDEXING_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!tokenRes.ok) { console.error('OAuth token error:', await tokenRes.text()); return }

  const { access_token } = await tokenRes.json()
  const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type }),
  })
  if (!res.ok) console.error('Google Indexing API (OAuth) error:', await res.text())
}

// ── Google Indexing API via Service Account JWT ───────────────────────────────
// Private key is permanent — tokens auto-generated. Works once SC ownership is resolved.
async function notifyGoogleServiceAccount(url: string, type: NotifyType): Promise<void> {
  const clientEmail = process.env.GOOGLE_INDEXING_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_INDEXING_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!clientEmail || !privateKey) return

  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/indexing',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url')

  const signingInput = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  const signature = signer.sign(privateKey, 'base64url')
  const jwt = `${signingInput}.${signature}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!tokenRes.ok) { console.error('Service account token error:', await tokenRes.text()); return }

  const { access_token } = await tokenRes.json()
  const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type }),
  })
  if (!res.ok) console.error('Google Indexing API (SA) error:', await res.text())
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Google's Indexing API is only meant for job-posting and livestream pages, and on this site it failed all day
 * (daily quota of 200 exceeded, 403 "Failed to verify the URL ownership"; ~70 errors a day in the 24 Nov audit).
 * Since 25 Nov 2026 it is off unless GOOGLE_INDEXING_API=on. Google finds articles through the sitemaps;
 * IndexNow (Bing, Yandex, and Copilot through Bing) keeps running.
 */
export function googleIndexingEnabled(raw: string | undefined = process.env.GOOGLE_INDEXING_API): boolean {
  return (raw ?? '').trim().toLowerCase() === 'on'
}

export function notifyIndexing(url: string, type: NotifyType = 'URL_UPDATED'): void {
  const methods: Promise<void>[] = googleIndexingEnabled() ? [notifyGoogleOAuth(url, type), notifyGoogleServiceAccount(url, type)] : []
  // IndexNow only makes sense for new/updated URLs, not deletions
  if (type === 'URL_UPDATED') methods.push(notifyIndexNow(url))

  Promise.allSettled(methods).catch(() => {})
}
