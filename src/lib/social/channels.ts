/**
 * One small sender per platform. Each reads its keys from the environment (a platform with no keys
 * is simply not configured and is skipped), takes the fetch function as a parameter so it can be
 * tested without a network, and never throws: the answer is `{ ok, ref | error }`.
 *
 * Telegram     Bot API, a bot that is an admin of the channel.
 * X            POST /2/tweets, OAuth 1.0a with the four keys of the account.
 * Facebook     Graph API, a Page access token: a link post (Facebook builds the card from the page).
 * Instagram    Graph API, an Instagram professional account linked to the Page: one image post.
 * Webhook      Everything as JSON to a Make / Zapier / n8n URL, for any platform not covered above.
 */
import { oauthHeader } from './oauth1'
import type { ComposedPost } from './compose'

export type ChannelName = 'telegram' | 'x' | 'facebook' | 'instagram' | 'webhook'

/** Where the feed platforms (Facebook, Instagram) sit in the picture: only top stories go there. */
export const TOP_ONLY: ChannelName[] = ['facebook', 'instagram']

export type XLinkMode = 'always' | 'top' | 'never'

export interface ChannelConfig {
  telegram?: { token: string; chatId: string }
  x?: { consumerKey: string; consumerSecret: string; token: string; tokenSecret: string }
  facebook?: { pageId: string; token: string }
  instagram?: { accountId: string; token: string }
  webhook?: { url: string; secret?: string }
  graphVersion: string
  xLinkMode: XLinkMode
}

type Env = Record<string, string | undefined>

export function loadChannelConfig(env: Env): ChannelConfig {
  const v = (k: string) => (env[k] ?? '').trim()
  const cfg: ChannelConfig = {
    graphVersion: v('META_GRAPH_VERSION') || 'v23.0',
    xLinkMode: (['always', 'top', 'never'] as const).find((m) => m === v('X_LINK_MODE')) ?? 'top',
  }
  if (v('TELEGRAM_BOT_TOKEN') && v('TELEGRAM_CHAT_ID')) cfg.telegram = { token: v('TELEGRAM_BOT_TOKEN'), chatId: v('TELEGRAM_CHAT_ID') }
  if (v('X_API_KEY') && v('X_API_SECRET') && v('X_ACCESS_TOKEN') && v('X_ACCESS_TOKEN_SECRET')) {
    cfg.x = { consumerKey: v('X_API_KEY'), consumerSecret: v('X_API_SECRET'), token: v('X_ACCESS_TOKEN'), tokenSecret: v('X_ACCESS_TOKEN_SECRET') }
  }
  const metaToken = v('META_PAGE_ACCESS_TOKEN')
  if (metaToken && v('FACEBOOK_PAGE_ID')) cfg.facebook = { pageId: v('FACEBOOK_PAGE_ID'), token: metaToken }
  if (metaToken && v('INSTAGRAM_ACCOUNT_ID')) cfg.instagram = { accountId: v('INSTAGRAM_ACCOUNT_ID'), token: metaToken }
  if (v('SOCIAL_WEBHOOK_URL')) cfg.webhook = { url: v('SOCIAL_WEBHOOK_URL'), secret: v('SOCIAL_WEBHOOK_SECRET') || undefined }
  return cfg
}

export function configuredChannels(cfg: ChannelConfig): ChannelName[] {
  return (['telegram', 'x', 'facebook', 'instagram', 'webhook'] as const).filter((c) => !!cfg[c])
}

/** Every secret in the config, so error text can be cleaned before it is stored. */
export function secretsOf(cfg: ChannelConfig): string[] {
  return [
    cfg.telegram?.token, cfg.x?.consumerSecret, cfg.x?.token, cfg.x?.tokenSecret, cfg.x?.consumerKey,
    cfg.facebook?.token, cfg.instagram?.token, cfg.webhook?.secret, cfg.webhook?.url,
  ].filter((s): s is string => !!s)
}

export interface SendResult {
  ok: boolean
  ref?: string
  error?: string
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export interface SendDeps {
  fetch: FetchFn
  sleep?: (ms: number) => Promise<void>
}

const TIMEOUT_MS = 12_000

async function call(deps: SendDeps, url: string, init: RequestInit): Promise<{ status: number; body: Record<string, unknown>; text: string }> {
  const res = await deps.fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  const text = await res.text()
  let body: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
  } catch {
    /* not JSON */
  }
  return { status: res.status, body, text }
}

function short(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, 240)
}

function failure(err: unknown): SendResult {
  return { ok: false, error: short(err instanceof Error ? err.message : String(err)) }
}

function form(params: Record<string, string>): { body: string; headers: Record<string, string> } {
  return { body: new URLSearchParams(params).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
}

// ── Telegram ────────────────────────────────────────────────────────────────

export async function sendTelegram(cfg: NonNullable<ChannelConfig['telegram']>, post: ComposedPost, deps: SendDeps): Promise<SendResult> {
  const api = (method: string) => `https://api.telegram.org/bot${cfg.token}/${method}`
  const json = (payload: Record<string, unknown>): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const messageId = (b: Record<string, unknown>) => String((b.result as { message_id?: number } | undefined)?.message_id ?? '')
  try {
    if (post.imageUrl) {
      const r = await call(deps, api('sendPhoto'), json({ chat_id: cfg.chatId, photo: post.imageUrl, caption: post.text, parse_mode: 'HTML' }))
      if (r.body.ok === true) return { ok: true, ref: messageId(r.body) }
      // The picture could not be fetched or was refused: send the text (Telegram adds the link preview itself).
    }
    const r = await call(deps, api('sendMessage'), json({ chat_id: cfg.chatId, text: post.text, parse_mode: 'HTML' }))
    if (r.body.ok === true) return { ok: true, ref: messageId(r.body) }
    return { ok: false, error: short(`Telegram ${r.status}: ${String(r.body.description ?? r.text)}`) }
  } catch (err) {
    return failure(err)
  }
}

// ── X ───────────────────────────────────────────────────────────────────────

export async function sendX(cfg: NonNullable<ChannelConfig['x']>, post: ComposedPost, deps: SendDeps): Promise<SendResult> {
  const url = 'https://api.x.com/2/tweets'
  try {
    const r = await call(deps, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: oauthHeader({ method: 'POST', url, ...cfg }) },
      body: JSON.stringify({ text: post.text }),
    })
    const id = (r.body.data as { id?: string } | undefined)?.id
    if (r.status >= 200 && r.status < 300 && id) return { ok: true, ref: id }
    const why = r.status === 402 ? 'X API credits are used up (buy credits in the X developer console)' : String(r.body.detail ?? r.body.title ?? r.text)
    return { ok: false, error: short(`X ${r.status}: ${why}`) }
  } catch (err) {
    return failure(err)
  }
}

// ── Facebook Page ───────────────────────────────────────────────────────────

function graph(cfg: ChannelConfig, path: string): string {
  return `https://graph.facebook.com/${cfg.graphVersion}/${path}`
}

function metaError(r: { status: number; body: Record<string, unknown>; text: string }): string {
  const e = r.body.error as { message?: string; code?: number } | undefined
  return short(`Meta ${r.status}: ${e?.message ?? r.text}${e?.code ? ` (code ${e.code})` : ''}`)
}

export async function sendFacebook(all: ChannelConfig, post: ComposedPost, deps: SendDeps): Promise<SendResult> {
  const cfg = all.facebook
  if (!cfg) return { ok: false, error: 'not configured' }
  try {
    const f = form({ message: post.text, ...(post.link ? { link: post.link } : {}), access_token: cfg.token })
    const r = await call(deps, graph(all, `${cfg.pageId}/feed`), { method: 'POST', ...f })
    const id = r.body.id
    if (r.status >= 200 && r.status < 300 && typeof id === 'string') return { ok: true, ref: id }
    return { ok: false, error: metaError(r) }
  } catch (err) {
    return failure(err)
  }
}

// ── Instagram ───────────────────────────────────────────────────────────────

export async function sendInstagram(all: ChannelConfig, post: ComposedPost, deps: SendDeps): Promise<SendResult> {
  const cfg = all.instagram
  if (!cfg) return { ok: false, error: 'not configured' }
  if (!post.imageUrl) return { ok: false, error: 'the article has no cover image' }
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)))
  try {
    const created = await call(deps, graph(all, `${cfg.accountId}/media`), {
      method: 'POST',
      ...form({ image_url: post.imageUrl, caption: post.text, access_token: cfg.token }),
    })
    const containerId = created.body.id
    if (created.status < 200 || created.status >= 300 || typeof containerId !== 'string') return { ok: false, error: metaError(created) }

    // An image is usually ready at once; wait briefly for the rest.
    let status = ''
    for (let i = 0; i < 6; i++) {
      const s = await call(deps, graph(all, `${containerId}?fields=status_code&access_token=${encodeURIComponent(cfg.token)}`), { method: 'GET' })
      status = String(s.body.status_code ?? '')
      if (status === 'FINISHED' || status === 'ERROR' || status === 'EXPIRED') break
      await sleep(2000)
    }
    if (status !== 'FINISHED') return { ok: false, error: `Instagram did not accept the image (status ${status || 'unknown'})` }

    const published = await call(deps, graph(all, `${cfg.accountId}/media_publish`), {
      method: 'POST',
      ...form({ creation_id: containerId, access_token: cfg.token }),
    })
    const id = published.body.id
    if (published.status >= 200 && published.status < 300 && typeof id === 'string') return { ok: true, ref: id }
    return { ok: false, error: metaError(published) }
  } catch (err) {
    return failure(err)
  }
}

// ── Webhook ─────────────────────────────────────────────────────────────────

export async function sendWebhook(cfg: NonNullable<ChannelConfig['webhook']>, payload: unknown, deps: SendDeps): Promise<SendResult> {
  try {
    const r = await call(deps, cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.secret ? { Authorization: `Bearer ${cfg.secret}` } : {}) },
      body: JSON.stringify(payload),
    })
    if (r.status >= 200 && r.status < 300) return { ok: true }
    return { ok: false, error: short(`Webhook ${r.status}: ${r.text}`) }
  } catch (err) {
    return failure(err)
  }
}
