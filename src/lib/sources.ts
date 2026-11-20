/**
 * Source attribution for AI-assisted articles.
 *
 * Pure helpers (no server-only, no DB) so they can be unit-tested. The news automation
 * appends a visible "Source: <publisher>" line to every generated article body, so the
 * attribution never depends on the AI model remembering to write it.
 */

/** Used when the news feed did not name the publisher. It is true: the story came from Google News. */
export const FALLBACK_SOURCE_NAME = 'Google News'

const MAX_SOURCE_NAME = 80

export interface SourceRef {
  /** Publisher name as given by the news feed (e.g. "The Hindu"). */
  name: string | null | undefined
  /** Link to the original report (or the news-feed link that redirects to it). */
  url: string | null | undefined
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Plain-text publisher name: tags stripped, whitespace collapsed, length capped. Null when empty. */
export function cleanSourceName(raw: string | null | undefined): string | null {
  if (!raw) return null
  const text = String(raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.length > MAX_SOURCE_NAME ? `${text.slice(0, MAX_SOURCE_NAME - 1).trimEnd()}…` : text
}

/** Returns a normalised http(s) URL, or null for anything else (javascript:, data:, garbage). */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(String(raw).trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** True for news.google.com redirect links (they work for readers but are not the publisher's own URL). */
export function isGoogleNewsUrl(raw: string | null | undefined): boolean {
  const safe = safeHttpUrl(raw)
  if (!safe) return false
  return /(^|\.)news\.google\.com$/i.test(new URL(safe).hostname)
}

/** The source line as HTML: `<p>Source: <a …>The Hindu</a></p>`. Link omitted when the URL is unusable. */
export function buildSourceNote(ref: SourceRef): string {
  const name = escapeHtml(cleanSourceName(ref.name) ?? FALLBACK_SOURCE_NAME)
  const url = safeHttpUrl(ref.url)
  const label = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
    : name
  return `<p><strong>Source:</strong> ${label}</p>`
}

/**
 * Appends the source line to the article HTML. Idempotent: if the body already links to
 * the same URL as a "Source:" line, it is returned unchanged.
 */
export function withSourceNote(html: string, ref: SourceRef): string {
  const url = safeHttpUrl(ref.url)
  if (url && /<strong>\s*Source:\s*<\/strong>/i.test(html) && html.includes(escapeHtml(url))) return html
  return `${html.trimEnd()}\n${buildSourceNote(ref)}`
}
