/**
 * Reading from X for the reply features: the account's own id, the replies and mentions it received,
 * and the recent posts of the desk's target accounts, plus sending one reply. Every call takes the
 * fetch function as a parameter (tests use a fake) and never throws: a string result is the reason it
 * failed. Reads are billed per post by the X API, so the callers keep the numbers small.
 */
import { oauthHeader, percentEncode } from './oauth1'
import { bareText, type DeskTweet, type Mention } from './xreplies'
import type { ChannelConfig, SendDeps, SendResult } from './channels'

type XKeys = NonNullable<ChannelConfig['x']>
const API = 'https://api.x.com/2'

interface Reply {
  status: number
  body: Record<string, unknown>
}

async function request(cfg: XKeys, deps: SendDeps, method: 'GET' | 'POST', path: string, params: Record<string, string> = {}, json?: unknown): Promise<Reply> {
  const base = `${API}${path}`
  // The query string is part of an OAuth 1.0a signature and must be encoded exactly as it is signed.
  const query = Object.entries(params).map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`).join('&')
  const headers: Record<string, string> = { Authorization: oauthHeader({ method, url: base, params, ...cfg }) }
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  const res = await deps.fetch(query ? `${base}?${query}` : base, { method, headers, body: json === undefined ? undefined : JSON.stringify(json), signal: AbortSignal.timeout(15_000) })
  const text = await res.text()
  let body: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
  } catch {
    /* not JSON */
  }
  return { status: res.status, body }
}

function why(r: Reply): string {
  const base = r.status === 402 ? 'X API credits are used up' : String(r.body.detail ?? r.body.title ?? 'request failed')
  return `X ${r.status}: ${base}`.replace(/\s+/g, ' ').slice(0, 240)
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200)

export async function getMe(cfg: XKeys, deps: SendDeps): Promise<{ id: string; username: string } | string> {
  try {
    const r = await request(cfg, deps, 'GET', '/users/me')
    const d = r.body.data as { id?: string; username?: string } | undefined
    return r.status === 200 && d?.id && d.username ? { id: d.id, username: d.username } : why(r)
  } catch (e) {
    return message(e)
  }
}

interface ApiUser { id: string; username?: string; name?: string; created_at?: string; public_metrics?: { followers_count?: number } }
interface ApiTweet {
  id: string
  text: string
  author_id?: string
  created_at?: string
  referenced_tweets?: { type: string; id: string }[]
  public_metrics?: { like_count?: number; reply_count?: number }
}
interface Page { data?: ApiTweet[]; includes?: { users?: ApiUser[]; tweets?: ApiTweet[] }; meta?: { newest_id?: string } }

export function parseMentions(body: Record<string, unknown>, myId: string): { mentions: Mention[]; newestId?: string } {
  const page = body as Page
  const users = new Map((page.includes?.users ?? []).map((u) => [u.id, u]))
  const tweets = new Map((page.includes?.tweets ?? []).map((t) => [t.id, t]))
  const mentions: Mention[] = []
  for (const t of page.data ?? []) {
    const u = t.author_id ? users.get(t.author_id) : undefined
    if (!t.author_id || !u?.username || !t.created_at) continue
    const parentRef = t.referenced_tweets?.find((r) => r.type === 'replied_to')
    const parent = parentRef ? tweets.get(parentRef.id) : undefined
    mentions.push({
      id: t.id, authorId: t.author_id, username: u.username, text: t.text, createdAt: t.created_at,
      parentText: parent && parent.author_id === myId ? bareText(parent.text) : null,
      followers: u.public_metrics?.followers_count ?? 0, accountCreatedAt: u.created_at ?? null,
    })
  }
  // Oldest first, so the answers go out in the order the people wrote.
  mentions.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  return { mentions, newestId: page.meta?.newest_id }
}

/** Replies and mentions the account received since `sinceId` (at most 20 posts are read). */
export async function getMentions(cfg: XKeys, deps: SendDeps, myId: string, sinceId?: string): Promise<{ mentions: Mention[]; newestId?: string } | string> {
  try {
    const params: Record<string, string> = {
      max_results: '20',
      'tweet.fields': 'author_id,created_at,referenced_tweets',
      expansions: 'author_id,referenced_tweets.id',
      'user.fields': 'username,created_at,public_metrics',
    }
    if (sinceId) params.since_id = sinceId
    const r = await request(cfg, deps, 'GET', `/users/${myId}/mentions`, params)
    return r.status === 200 ? parseMentions(r.body, myId) : why(r)
  } catch (e) {
    return message(e)
  }
}

export function parseDeskTweets(body: Record<string, unknown>): DeskTweet[] {
  const page = body as Page
  const users = new Map((page.includes?.users ?? []).map((u) => [u.id, u]))
  const out: DeskTweet[] = []
  for (const t of page.data ?? []) {
    const u = t.author_id ? users.get(t.author_id) : undefined
    if (!u?.username || !t.created_at) continue
    out.push({
      id: t.id, username: u.username, name: u.name ?? u.username, text: t.text, createdAt: t.created_at,
      likes: t.public_metrics?.like_count ?? 0, replies: t.public_metrics?.reply_count ?? 0, followers: u.public_metrics?.followers_count ?? 0,
    })
  }
  return out
}

/** Recent original posts matching `query` (10 posts are read: the API's minimum). */
export async function searchRecent(cfg: XKeys, deps: SendDeps, query: string): Promise<DeskTweet[] | string> {
  try {
    const r = await request(cfg, deps, 'GET', '/tweets/search/recent', {
      query,
      max_results: '10',
      'tweet.fields': 'author_id,created_at,public_metrics',
      expansions: 'author_id',
      'user.fields': 'username,name,public_metrics',
    })
    return r.status === 200 ? parseDeskTweets(r.body) : why(r)
  } catch (e) {
    return message(e)
  }
}

/**
 * New posts for each of `queries` (up to 20 per search; with a cursor X returns, and bills, only posts newer than `sinceId`).
 * `newestId` is the cursor for the next read; it is left out when one search failed, so what that search missed is asked for
 * again (posts already seen are dropped by id). A string result means every search failed. Used by the breaking-post sources (xposts.ts).
 */
export async function searchPosts(cfg: XKeys, deps: SendDeps, queries: string[], sinceId?: string): Promise<{ tweets: DeskTweet[]; newestId?: string; errors: string[] } | string> {
  const one = async (query: string): Promise<{ tweets: DeskTweet[]; newestId?: string } | string> => {
    try {
      const params: Record<string, string> = {
        query,
        max_results: '20',
        'tweet.fields': 'author_id,created_at,public_metrics',
        expansions: 'author_id',
        'user.fields': 'username,name,public_metrics',
      }
      if (sinceId) params.since_id = sinceId
      const r = await request(cfg, deps, 'GET', '/tweets/search/recent', params)
      return r.status === 200 ? { tweets: parseDeskTweets(r.body), newestId: (r.body as Page).meta?.newest_id } : why(r)
    } catch (e) {
      return message(e)
    }
  }
  const results = await Promise.all(queries.map(one))
  const errors = results.filter((r): r is string => typeof r === 'string')
  const ok = results.filter((r): r is { tweets: DeskTweet[]; newestId?: string } => typeof r !== 'string')
  if (ok.length === 0) return errors[0] ?? 'no search was made'
  const byId = new Map(ok.flatMap((r) => r.tweets).map((t) => [t.id, t]))
  const ids = ok.map((r) => r.newestId).filter((id): id is string => !!id && /^\d+$/.test(id))
  const newestId = errors.length || ids.length === 0 ? undefined : ids.reduce((x, y) => (BigInt(x) >= BigInt(y) ? x : y))
  return { tweets: [...byId.values()], newestId, errors }
}

/** One reply to a post whose author mentioned or quoted the account (the only case the X API allows). */
export async function postReply(cfg: XKeys, deps: SendDeps, text: string, toId: string): Promise<SendResult> {
  try {
    const r = await request(cfg, deps, 'POST', '/tweets', {}, { text, reply: { in_reply_to_tweet_id: toId } })
    const id = (r.body.data as { id?: string } | undefined)?.id
    return r.status >= 200 && r.status < 300 && id ? { ok: true, ref: id } : { ok: false, error: why(r) }
  } catch (e) {
    return { ok: false, error: message(e) }
  }
}
