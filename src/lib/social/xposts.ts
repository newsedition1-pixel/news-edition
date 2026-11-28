/**
 * Breaking posts of official news organisations on X as a second way to start an alert (owner decision 28 Nov 2026, "jo news website
 * pr break ho wahi pick krna jaroori nhi, x par official news organisation se break ho use bhi pick krna hai", then "2 sources se check
 * krk post krna").
 *
 * A post never goes out on its own. It is a CLAIM until a second, independent source says the same thing: another allow-listed account's
 * post about the same event, or a story in the feeds of the trusted publishers (lib/news/feeds.ts). "Independent" means a different
 * organisation: an account and the website of the same outlet (`ndtv` and NDTV, `the_hindu` and The Hindu) count once. An unconfirmed post
 * waits (`pending` in the cursor state) for POST_MAX_AGE_MIN minutes and is then dropped. Once two sources agree, the alert line is
 * written from both and checked exactly as a feeds alert is (xalert.ts: names in the reports, numbers and strong words given by both).
 * Other safeguards: only handles in X_BREAKING_SOURCES, only original posts (no replies, retweets, quotes), a breaking marker or an
 * urgent headline, not older than POST_MAX_AGE_MIN. Pure and unit-tested; the X read is in xread.ts, the run in xalertRun.ts.
 */
import { isUrgentHeadline } from '../news/placement'
import { findSameStory } from '../news/dedupe'
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
  /** Posts that wait for a second source (see confirmPost). */
  pending: PostCandidate[]
}

export const PENDING_MAX = 20

export function parsePostState(raw: string | null): PostState {
  const empty: PostState = { pending: [] }
  if (!raw) return empty
  try {
    const v = JSON.parse(raw) as Partial<PostState> | null
    if (!v || typeof v !== 'object') return empty
    const pending = (Array.isArray(v.pending) ? v.pending : [])
      .filter((p): p is PostCandidate => !!p && typeof p.id === 'string' && typeof p.username === 'string' && typeof p.text === 'string' && typeof p.createdAt === 'string')
      .slice(0, PENDING_MAX)
    return { ...(typeof v.sinceId === 'string' && /^\d+$/.test(v.sinceId) ? { sinceId: v.sinceId } : {}), ...(typeof v.readAt === 'string' ? { readAt: v.readAt } : {}), pending }
  } catch {
    return empty
  }
}

/** True when the last read was so recent that this call should not read again. */
export function readTooSoon(state: Pick<PostState, 'readAt'>, now: Date): boolean {
  if (!state.readAt) return false
  const t = new Date(state.readAt).getTime()
  return Number.isFinite(t) && now.getTime() - t < POST_READ_GAP_MS
}

// ── the second source ───────────────────────────────────────────────────────

/** Account -> organisation (the publisher key where there is one), so an outlet's account and its website count as one source. */
const HANDLE_ORG: Record<string, string> = {
  pti_news: 'pti', bbcbreaking: 'bbc', bbcworld: 'bbc', ajenglish: 'al-jazeera', aljazeera: 'al-jazeera', the_hindu: 'the-hindu', thehindu: 'the-hindu',
  httweets: 'hindustan-times', indianexpress: 'indian-express', indiatoday: 'india-today', timesofindia: 'times-of-india', toi_india: 'times-of-india',
  business_standard: 'business-standard', bsindia: 'business-standard', news18india: 'news18', scroll_in: 'scroll',
}

export function orgOfHandle(handle: string): string {
  const h = handle.toLowerCase()
  return HANDLE_ORG[h] ?? h.replace(/_/g, '')
}

/** The Hindu BusinessLine is The Hindu; every other publisher key stands for itself. */
export function orgOfPublisher(key: string): string {
  return key === 'the-hindu-businessline' ? 'the-hindu' : key
}

/** One report that says something happened: a post of an official account or a trusted publisher's story. */
export interface Evidence {
  org: string
  title: string
  summary: string
  kind: 'post' | 'feed'
}

export interface FeedClaim {
  publisherKey: string
  title: string
  summary: string
}

/** Two headlines are about the same event (the same rule that stops us writing a story twice). */
export function sameEvent(a: string, b: string): boolean {
  return findSameStory({ titles: [a] }, [{ title: b }]) !== null
}

/**
 * The independent sources that say the same thing as `post`, the post first, or null when no second organisation confirms it yet.
 * `others` are the other waiting or new posts, `feed` the headlines of the trusted publishers' feeds. At most one report per organisation.
 */
export function confirmPost(post: PostCandidate, others: PostCandidate[], feed: FeedClaim[]): Evidence[] | null {
  const own = orgOfHandle(post.username)
  const evidence: Evidence[] = [{ org: own, title: post.text, summary: '', kind: 'post' }]
  const orgs = new Set([own])
  for (const o of others) {
    const org = orgOfHandle(o.username)
    if (o.id === post.id || orgs.has(org) || !sameEvent(post.text, o.text)) continue
    orgs.add(org)
    evidence.push({ org, title: o.text, summary: '', kind: 'post' })
  }
  for (const f of feed) {
    const org = orgOfPublisher(f.publisherKey)
    if (orgs.has(org) || !sameEvent(post.text, f.title)) continue
    orgs.add(org)
    evidence.push({ org, title: f.title, summary: f.summary, kind: 'feed' })
  }
  return orgs.size >= 2 ? evidence : null
}

/** What stays in the waiting list: posts nobody has confirmed yet and that are still fresh, newest first. */
export function stillPending(posts: PostCandidate[], now: Date, maxAgeMin = POST_MAX_AGE_MIN): PostCandidate[] {
  return posts
    .filter((p) => {
      const age = now.getTime() - new Date(p.createdAt).getTime()
      return Number.isFinite(age) && age <= maxAgeMin * 60_000
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, PENDING_MAX)
}
