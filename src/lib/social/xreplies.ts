/**
 * Replies on X, inside X's rules. Since 23 Feb 2026 the X API only lets an app reply to a post whose
 * author has mentioned or quoted the account, and the automation rules forbid unsolicited automated
 * replies. So there are two parts:
 *
 * 1. Answer-back (automatic): people who reply to or mention @NewsEdition_1 get a short, relevant
 *    answer, a few a day, never to hostile, political, spammy or off-topic messages.
 * 2. Reply desk (a person posts): fresh posts of big news and official accounts, each with a drafted
 *    reply that adds something. The owner opens the post, copies the draft and posts it by hand; nothing
 *    is sent by the app.
 *
 * Pure and unit-tested; the network parts are in xread.ts and xinbox.ts.
 */
import { CLICKBAIT_RE } from '../news/quality'
import { istDay, istHours } from './policy'
import { groundingIssues, isSensitive } from './xcopy'
import type { Message } from './xcopy'

export const ANSWER_DAILY_CAP = 10
export const ANSWER_MIN_GAP_MS = 4 * 60 * 1000
/** An answer to a reply older than this is stale. */
export const ANSWER_MAX_AGE_MS = 8 * 60 * 60 * 1000
export const ANSWER_MAX_CHARS = 200
export const DESK_MAX_ITEMS = 20
export const DESK_PER_REFRESH = 8
export const DESK_MAX_AGE_MS = 100 * 60 * 1000
export const DESK_REFRESH_GAP_MS = 3.5 * 60 * 60 * 1000
export const DESK_FROM_HOUR = 8.5
export const DESK_TO_HOUR = 22.5
export const DRAFT_MAX_CHARS = 220

/** Handles whose fresh posts are worth a reply (set X_REPLY_TARGETS to change; a wrong handle just finds nothing). */
export const DEFAULT_TARGETS = ['ANI', 'PTI_News', 'PIB_India', 'RBI', 'SEBI_India', 'NSEIndia', 'the_hindu', 'IndianExpress', 'htTweets', 'IndiaToday', 'ndtv', 'EconomicTimes', 'livemint', 'cmohry']

export function targetsOf(raw: string | undefined): string[] {
  const list = (raw ?? '').split(/[,\s]+/).map((h) => h.replace(/^@/, '').trim()).filter((h) => /^\w{1,15}$/.test(h))
  return list.length ? [...new Set(list)] : DEFAULT_TARGETS
}

/** The search query for the desk: original posts only (no replies, no reposts) of the target accounts. */
export function deskQuery(handles: string[]): string {
  return `(${handles.map((h) => `from:${h}`).join(' OR ')}) -is:reply -is:retweet -is:quote lang:en`
}

// ── state kept between runs (one settings row) ──────────────────────────────

export interface ReplyLogEntry {
  at: string
  to: string
  text: string
  dry: boolean
  ok: boolean
  error?: string
}

export interface ReplyState {
  myId?: string
  myUsername?: string
  /** When the inbox last ran, so two callers do not double up. */
  runAt?: string
  sinceId?: string
  /** IST day of the counters below. */
  day: string
  answered: number
  lastAnswerAt?: string
  /** username (lower case) -> IST day of the last answer to them. */
  users: Record<string, string>
  /** The last answers, to avoid saying the same thing twice. */
  recent: string[]
  log: ReplyLogEntry[]
  deskAt?: string
}

export const emptyState = (now: Date): ReplyState => ({ day: istDay(now), answered: 0, users: {}, recent: [], log: [] })

export function parseState(raw: string | null, now: Date): ReplyState {
  if (!raw) return emptyState(now)
  try {
    const v = JSON.parse(raw) as Partial<ReplyState>
    if (!v || typeof v !== 'object') return emptyState(now)
    return { ...emptyState(now), ...v, users: v.users && typeof v.users === 'object' ? v.users : {}, recent: Array.isArray(v.recent) ? v.recent : [], log: Array.isArray(v.log) ? v.log : [] }
  } catch {
    return emptyState(now)
  }
}

/** A new Indian day starts the counters again; users answered on older days are forgotten. */
export function rollDay(s: ReplyState, now: Date): ReplyState {
  const day = istDay(now)
  if (s.day === day) return s
  return { ...s, day, answered: 0, users: {} }
}

// ── answer-back ─────────────────────────────────────────────────────────────

export interface Mention {
  id: string
  authorId: string
  username: string
  text: string
  createdAt: string
  /** Our post this one answers, when it answers one. */
  parentText: string | null
  followers: number
  accountCreatedAt: string | null
}

/** The message without the leading @names X puts in a reply, links and extra whitespace. */
export function bareText(text: string): string {
  return text.replace(/^(\s*@\w+)+/, '').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim()
}

const ABUSE = /\b(fuck|shit|bitch|bastard|chutiya|madarchod|bhosdi|gandu|randi|harami|stupid|idiot|moron|sold out|presstitute|godi media|paid media|bhakt|libtard|anti[- ]national|traitor|kill|die|rape)\b/i

/** Why a message gets no answer, or null when it may be answered. */
export function skipReason(m: Mention, s: ReplyState, now: Date, selfUsername: string): string | null {
  if (m.username.toLowerCase() === selfUsername.toLowerCase()) return 'our own post'
  if (now.getTime() - new Date(m.createdAt).getTime() > ANSWER_MAX_AGE_MS) return 'too old'
  const text = bareText(m.text)
  if (text.length < 8) return 'too short to answer'
  if (/https?:\/\//.test(m.text)) return 'carries a link'
  if ((m.text.match(/@\w+/g) ?? []).length > 3) return 'tags many accounts'
  if (ABUSE.test(text) || isSensitive({ title: text, excerpt: null })) return 'abusive, political or sensitive'
  if (m.accountCreatedAt && now.getTime() - new Date(m.accountCreatedAt).getTime() < 14 * 24 * 3600 * 1000) return 'account under 14 days old'
  if (s.users[m.username.toLowerCase()] === s.day) return 'already answered today'
  return null
}

/** Whether another answer may go out now (daily cap, gap between answers). */
export function mayAnswerNow(s: ReplyState, now: Date): string | null {
  if (s.answered >= ANSWER_DAILY_CAP) return `daily limit of ${ANSWER_DAILY_CAP} answers reached`
  if (s.lastAnswerAt && now.getTime() - new Date(s.lastAnswerAt).getTime() < ANSWER_MIN_GAP_MS) return 'too soon after the last answer'
  return null
}

export function buildAnswerPrompt(m: Mention): { system: string; user: string } {
  const system = [
    'You run the X account of NewsEdition, an Indian news site. A reader answered one of our posts. Write the reply.',
    'Rules: at most 200 characters; warm, specific, plain words; answer their question or acknowledge their point using only facts that are in our post or in their message; never invent a fact; no links, hashtags, @mentions, emoji, or asking for follows; do not argue or lecture.',
    'If the message is hostile, abusive, political (parties, leaders, elections, religion), spam, off-topic, a request for advice, or you would have to guess, return {"reply": null}.',
    'Return JSON: {"reply": string | null}.',
  ].join('\n')
  const user = [m.parentText ? `Our post: ${m.parentText}` : '', `Their message: ${bareText(m.text)}`].filter(Boolean).join('\n\n')
  return { system, user }
}

/** What is wrong with a drafted reply; empty when it can be sent. `known` is the text the facts may come from. */
export function checkReply(reply: string, known: string, recent: string[], max: number): string[] {
  const issues: string[] = []
  if (reply.length < 10 || reply.length > max) issues.push(`The reply must be 10 to ${max} characters.`)
  if (/https?:\/\/|[#@]\w|\p{Extended_Pictographic}/u.test(reply)) issues.push('The reply has a link, hashtag, mention or emoji.')
  if (CLICKBAIT_RE.test(reply) || /!/.test(reply)) issues.push('No clickbait wording or exclamation marks.')
  if (/\b(as an ai|language model|follow us|follow me|dm me)\b/i.test(reply)) issues.push('The reply sounds automated or asks for follows.')
  issues.push(...groundingIssues(reply, known, 'The reply'))
  const key = reply.toLowerCase().replace(/\W+/g, ' ').trim()
  if (recent.some((r) => r.toLowerCase().replace(/\W+/g, ' ').trim() === key)) issues.push('The same reply was sent before.')
  return issues
}

/** Asks for a reply, checks it, asks once more with the reasons. Null means: do not reply. */
export async function writeAnswer(ask: (m: Message[]) => Promise<string | null>, m: Mention, recent: string[]): Promise<string | null> {
  const { system, user } = buildAnswerPrompt(m)
  const known = [m.parentText ?? '', bareText(m.text)].join('\n')
  const messages: Message[] = [{ role: 'system', content: system }, { role: 'user', content: user }]
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(messages)
    if (!raw) return null
    const reply = parseReply(raw)
    if (reply === null) return null
    const issues = checkReply(reply, known, recent, ANSWER_MAX_CHARS)
    if (issues.length === 0) return reply
    messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `Rejected for:\n- ${issues.join('\n- ')}\nReturn corrected JSON, or {"reply": null}.` })
  }
  return null
}

/** The "reply" of the model's JSON, or null for a refusal or a broken answer. */
export function parseReply(raw: string): string | null {
  try {
    const v = JSON.parse(raw) as { reply?: unknown }
    return typeof v.reply === 'string' && v.reply.trim() ? v.reply.replace(/\s+/g, ' ').trim() : null
  } catch {
    return null
  }
}

// ── reply desk ──────────────────────────────────────────────────────────────

export interface DeskTweet {
  id: string
  username: string
  name: string
  text: string
  createdAt: string
  likes: number
  replies: number
  followers: number
}

export interface DeskItem {
  id: string
  username: string
  name: string
  text: string
  createdAt: string
  url: string
  draft: string
  status: 'new' | 'done' | 'skipped'
}

/** Fresh posts only, not about harm, crime, faith or party politics, not already on the desk; the freshest with some traction first. */
export function rankDeskTweets(tweets: DeskTweet[], existing: DeskItem[], now: Date, limit = DESK_PER_REFRESH): DeskTweet[] {
  const have = new Set(existing.map((i) => i.id))
  return tweets
    .filter((t) => !have.has(t.id) && now.getTime() - new Date(t.createdAt).getTime() <= DESK_MAX_AGE_MS && now.getTime() - new Date(t.createdAt).getTime() >= 0)
    .filter((t) => bareText(t.text).length >= 40 && !isSensitive({ title: t.text, excerpt: null }))
    .map((t) => {
      const ageMin = (now.getTime() - new Date(t.createdAt).getTime()) / 60000
      // A reply is seen most in the first hour, and under a post that is just starting to move.
      const score = Math.max(0, 100 - ageMin) + Math.min(t.likes, 50) * 0.4 - Math.min(t.replies, 400) * 0.05
      return { t, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t)
}

export function buildDeskPrompt(t: DeskTweet): { system: string; user: string } {
  const system = [
    'You draft a reply for the NewsEdition X account (an Indian news site) to a post by a larger news or official account. A person will read, edit and post it.',
    'The reply must add something for the readers of that post: the one number or point that matters most put in plain words, what it means for ordinary readers, or a sharp neutral question about it. Use only facts that are in the post; never invent or guess.',
    'Rules: at most 220 characters; one or two short sentences; plain words; no links, hashtags, @mentions, emoji; no repeating the post; no praise, no attack, no opinion on parties or leaders; do not ask for follows.',
    'If the post is about harm, crime, a court case, religion or politics, or you cannot add something checkable, return {"draft": null}.',
    'Return JSON: {"draft": string | null}.',
  ].join('\n')
  return { system, user: `Post by @${t.username}:\n${bareText(t.text)}` }
}

export async function writeDeskDraft(ask: (m: Message[]) => Promise<string | null>, t: DeskTweet): Promise<string | null> {
  const { system, user } = buildDeskPrompt(t)
  const messages: Message[] = [{ role: 'system', content: system }, { role: 'user', content: user }]
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(messages)
    if (!raw) return null
    let draft: string | null = null
    try {
      const v = JSON.parse(raw) as { draft?: unknown }
      draft = typeof v.draft === 'string' && v.draft.trim() ? v.draft.replace(/\s+/g, ' ').trim() : null
    } catch {
      draft = null
    }
    if (draft === null) return null
    const issues = checkReply(draft, bareText(t.text), [], DRAFT_MAX_CHARS)
    if (draft.toLowerCase().includes(bareText(t.text).toLowerCase().slice(0, 50))) issues.push('The reply repeats the post.')
    if (issues.length === 0) return draft
    messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `Rejected for:\n- ${issues.join('\n- ')}\nReturn corrected JSON, or {"draft": null}.` })
  }
  return null
}

export function deskDue(deskAt: string | undefined, now: Date): boolean {
  const h = istHours(now)
  if (h < DESK_FROM_HOUR || h >= DESK_TO_HOUR) return false
  return !deskAt || now.getTime() - new Date(deskAt).getTime() >= DESK_REFRESH_GAP_MS
}

/** New items first, finished and skipped ones and anything older than a day dropped, at most DESK_MAX_ITEMS. */
export function mergeDesk(existing: DeskItem[], fresh: DeskItem[], now: Date): DeskItem[] {
  const keep = existing.filter((i) => i.status === 'new' && now.getTime() - new Date(i.createdAt).getTime() < 24 * 3600 * 1000)
  const ids = new Set(fresh.map((i) => i.id))
  return [...fresh, ...keep.filter((i) => !ids.has(i.id))].slice(0, DESK_MAX_ITEMS)
}
