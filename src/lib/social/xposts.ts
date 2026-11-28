/**
 * Breaking posts of official news organisations on X as a second way to start an alert (owner decision 28 Nov 2026,
 * "jo news website pr break ho wahi pick krna jaroori nhi ... x par official news organisation se break ho use bhi pick
 * krna hai, chahe sirf ek line ki headline ho").
 *
 * The feeds path (xalert.ts) needs 2+ publishers to agree. Here ONE post of an allow-listed official account is enough, so the
 * safeguards move to the account list and the wording: only handles in X_BREAKING_SOURCES (default: the wire agencies and the big
 * channels), only original posts (no replies, retweets, quotes), only a breaking marker or an urgent headline, not older than
 * POST_MAX_AGE_MIN minutes, and the line is rewritten from that one post alone: every name, number and strong word must already be
 * in the post, no outlet is named, no run of 8 words is copied. Pure and unit-tested; the X read is in xread.ts, the run in xalertRun.ts.
 */
import { isUrgentHeadline } from '../news/placement'
import type { DeskTweet } from './xreplies'

export const POST_SOURCES_DEFAULT = ['ANI', 'PTI_News', 'Reuters', 'AP', 'AFP', 'BBCBreaking', 'AJEnglish', 'ndtv', 'the_hindu', 'htTweets']
export const POST_SOURCES_MAX = 12
/** A post older than this is not "first" any more. */
export const POST_MAX_AGE_MIN = 45
/** The next read waits at least this long, so two overlapping cron calls read once. */
export const POST_READ_GAP_MS = 90 * 1000
/** Posts looked at per run after the filters. */
export const POSTS_PER_RUN = 6
export const POST_STATE_KEY = 'xAlertPosts'
/** X search accepts at most 512 characters of query. */
export const QUERY_MAX = 500

export function postSources(raw: string | undefined): string[] {
  const list = (raw ?? '')
    .split(/[,\s]+/)
    .map((h) => h.replace(/^@/, '').trim())
    .filter((h) => /^[A-Za-z0-9_]{1,15}$/.test(h))
  const seen = new Set<string>()
  const unique = list.filter((h) => !seen.has(h.toLowerCase()) && !!seen.add(h.toLowerCase()))
  return (unique.length ? unique : POST_SOURCES_DEFAULT).slice(0, POST_SOURCES_MAX)
}

/**
 * Words the search itself asks for, so X bills only posts that can qualify (every post read is billed). The code filters again
 * with `isBreakingPost`, so a word that is only here or only there changes the cost, not what gets through.
 */
const SEARCH_WORDS = ['BREAKING', '"JUST IN"', 'FLASH', 'killed', 'dead', 'dies', 'blast', 'explosion', 'attack', 'earthquake', 'crash', 'shot', 'missile', 'resigns', 'arrested']
const SEARCH_FILTERS = '-is:retweet -is:reply -is:quote lang:en'

export function postQuery(handles: string[]): string {
  const words = `(${SEARCH_WORDS.join(' OR ')})`
  const build = (hs: string[]) => `(${hs.map((h) => `from:${h}`).join(' OR ')}) ${words} ${SEARCH_FILTERS}`
  let hs = handles.slice()
  while (hs.length > 1 && build(hs).length > QUERY_MAX) hs = hs.slice(0, -1)
  return build(hs)
}

const MARKER_RE = /^[\W_]*(breaking|just in|flash|alert|developing|urgent)\b/i
const EMOJI_RE = /[\p{Extended_Pictographic}‍️]/gu
const ATTRIBUTION_RE = /\s*[\(\[]\s*(ANI|PTI|IANS|AFP|AP|Reuters|Bloomberg|UNI)\s*[\)\]]\s*$|\s+[-–—|]\s*(ANI|PTI|IANS|AFP|AP|Reuters|BBC|Al Jazeera)\s*$/i

/** The post as plain words: no links, @names, hashtag signs, emoji, leading "BREAKING:" or trailing agency tag. */
export function cleanPostText(raw: string): string {
  let t = raw.replace(/https?:\/\/\S+/g, ' ').replace(/(^|\s)@\w+/g, ' ').replace(/#(\w+)/g, '$1').replace(EMOJI_RE, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  t = t.replace(/^[\W_]*(breaking( news)?|just in|flash|alert|developing|urgent)\s*[:|\-–—!]*\s*/i, '')
  t = t.replace(ATTRIBUTION_RE, '')
  return t.replace(/\s+/g, ' ').trim()
}

/** Marked as breaking by the account itself, or an urgent headline (a death, attack, disaster, arrest, verdict ...). */
export function isBreakingPost(raw: string): boolean {
  const flat = raw.replace(EMOJI_RE, ' ').replace(/https?:\/\/\S+/g, ' ')
  return MARKER_RE.test(flat) || isUrgentHeadline(cleanPostText(raw))
}

export interface PostCandidate {
  id: string
  username: string
  text: string
  createdAt: string
}

/** The posts of a read that may start an alert: fresh, breaking, long enough to say something, newest first. */
export function postCandidates(tweets: DeskTweet[], now: Date, handles: string[], maxAgeMin = POST_MAX_AGE_MIN, limit = POSTS_PER_RUN): PostCandidate[] {
  const allowed = new Set(handles.map((h) => h.toLowerCase()))
  const seen = new Set<string>()
  const out: PostCandidate[] = []
  for (const t of tweets) {
    if (seen.has(t.id) || !allowed.has(t.username.toLowerCase())) continue
    seen.add(t.id)
    const age = now.getTime() - new Date(t.createdAt).getTime()
    if (!Number.isFinite(age) || age < -60_000 || age > maxAgeMin * 60_000) continue
    if (!isBreakingPost(t.text)) continue
    const text = cleanPostText(t.text)
    if (text.length < 25) continue
    out.push({ id: t.id, username: t.username, text, createdAt: t.createdAt })
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit)
}

// ── the cursor kept between reads ───────────────────────────────────────────

export interface PostState {
  /** Newest post id seen: the next read asks only for newer posts, so nothing is billed twice. */
  sinceId?: string
  readAt?: string
}

export function parsePostState(raw: string | null): PostState {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as PostState | null
    if (!v || typeof v !== 'object') return {}
    return { ...(typeof v.sinceId === 'string' && /^\d+$/.test(v.sinceId) ? { sinceId: v.sinceId } : {}), ...(typeof v.readAt === 'string' ? { readAt: v.readAt } : {}) }
  } catch {
    return {}
  }
}

/** True when the last read was so recent that this call should not read again. */
export function readTooSoon(state: PostState, now: Date): boolean {
  if (!state.readAt) return false
  const t = new Date(state.readAt).getTime()
  return Number.isFinite(t) && now.getTime() - t < POST_READ_GAP_MS
}
