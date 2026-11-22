/**
 * One small sender per platform. Each reads its keys from the environment (a platform with no keys
 * is simply not configured and is skipped), takes the fetch function as a parameter so it can be
 * tested without a network, and never throws: the answer is `{ ok, ref | error }`.
 *
 * Telegram     Bot API, a bot that is an admin of the channel.
 * X            POST /2/tweets, OAuth 1.0a with the four keys of the account; a picture or a poll or a video attached.
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
  /** Sent, but not exactly as planned (for example without the picture). */
  note?: string
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

export interface SendDeps {
  fetch: FetchFn
  sleep?: (ms: number) => Promise<void>
}

const TIMEOUT_MS = 12_000
/**
 * A Facebook link post makes Facebook fetch the (just published, so cold) article page for its preview, which
 * can take longer than 12 s: on 22 Nov 2026 article #1688 was logged as FAILED (aborted due to timeout) although
 * the next article went through. The senders run in parallel, so a longer wait delays nothing else.
 */
export const FACEBOOK_TIMEOUT_MS = 40_000

async function call(deps: SendDeps, url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<{ status: number; body: Record<string, unknown>; text: string }> {
  const res = await deps.fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
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

const X_TWEETS = 'https://api.x.com/2/tweets'
export const X_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const X_VIDEO_MAX_BYTES = 25 * 1024 * 1024
const X_VIDEO_CHUNK = 4 * 1024 * 1024

type XKeys = NonNullable<ChannelConfig['x']>

function xError(r: { status: number; body: Record<string, unknown>; text: string }): string {
  const why = r.status === 402 ? 'X API credits are used up (buy credits in the X developer console)' : String(r.body.detail ?? r.body.title ?? r.text)
  return short(`X ${r.status}: ${why}`)
}

const signed = (cfg: XKeys, method: string, url: string, params?: Record<string, string>) => oauthHeader({ method, url, params, ...cfg })

/** Downloads a picture or video for upload; a string is the reason it cannot be used. */
async function download(deps: SendDeps, url: string, kind: 'image' | 'video'): Promise<{ bytes: Uint8Array; type: string } | string> {
  const res = await deps.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS * (kind === 'video' ? 3 : 1)) })
  if (!res.ok) return `${kind} download answered ${res.status}`
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const allowed = kind === 'image' ? /^image\/(jpeg|png|gif|webp)$/ : /^video\/mp4$/
  if (!allowed.test(type)) return `${kind} has the type "${type || 'unknown'}"`
  const bytes = new Uint8Array(await res.arrayBuffer())
  const max = kind === 'image' ? X_IMAGE_MAX_BYTES : X_VIDEO_MAX_BYTES
  if (bytes.byteLength === 0) return `${kind} is empty`
  if (bytes.byteLength > max) return `${kind} is larger than ${Math.round(max / 1024 / 1024)} MB`
  return { bytes, type }
}

function multipart(fields: Record<string, string>, file: { name: string; bytes: Uint8Array; type: string }): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  fd.append('media', new Blob([file.bytes as unknown as BlobPart], { type: file.type }), file.name)
  return fd
}

/**
 * Uploads a picture and returns its media id. X is moving media upload to /2/media/upload and says
 * the old v1.1 endpoint will go, so the new one is tried first and the old one is the fallback.
 * (A multipart body is not part of the OAuth 1.0a signature.)
 */
async function uploadXImage(cfg: XKeys, imageUrl: string, deps: SendDeps): Promise<{ id: string } | { error: string }> {
  const img = await download(deps, imageUrl, 'image')
  if (typeof img === 'string') return { error: img }
  const attempts: { url: string; fields: Record<string, string>; id: (b: Record<string, unknown>) => string | undefined }[] = [
    { url: 'https://api.x.com/2/media/upload', fields: { media_category: 'tweet_image', media_type: img.type }, id: (b) => (b.data as { id?: string } | undefined)?.id },
    { url: 'https://upload.twitter.com/1.1/media/upload.json', fields: { media_category: 'tweet_image' }, id: (b) => (typeof b.media_id_string === 'string' ? b.media_id_string : undefined) },
  ]
  const errors: string[] = []
  for (const at of attempts) {
    const r = await call(deps, at.url, { method: 'POST', headers: { Authorization: signed(cfg, 'POST', at.url) }, body: multipart(at.fields, { name: 'cover', bytes: img.bytes, type: img.type }) })
    const id = at.id(r.body)
    if (r.status >= 200 && r.status < 300 && id) return { id: String(id) }
    errors.push(xError(r))
  }
  return { error: errors.join(' | ') }
}

export async function sendX(cfg: XKeys, post: ComposedPost, deps: SendDeps): Promise<SendResult> {
  try {
    const payload: Record<string, unknown> = { text: post.text }
    let note: string | undefined
    if (post.poll && post.poll.options.length >= 2) {
      // A tweet carries a poll or media, never both.
      payload.poll = { options: post.poll.options.slice(0, 4), duration_minutes: Math.min(10080, Math.max(5, Math.round(post.poll.durationMinutes))) }
    } else if (post.imageUrl) {
      const media = await uploadXImage(cfg, post.imageUrl, deps)
      if ('id' in media) payload.media = { media_ids: [media.id] }
      else note = `posted without the picture: ${media.error}`
    }
    const send = (body: Record<string, unknown>) =>
      call(deps, X_TWEETS, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: signed(cfg, 'POST', X_TWEETS) }, body: JSON.stringify(body) })
    let r = await send(payload)
    if (r.status === 400 && payload.media) {
      // X refused the attachment: the story still goes out, as text.
      const { media: _dropped, ...textOnly } = payload
      void _dropped
      note = `posted without the picture: ${xError(r)}`
      r = await send(textOnly)
    }
    const id = (r.body.data as { id?: string } | undefined)?.id
    if (r.status >= 200 && r.status < 300 && id) return note ? { ok: true, ref: id, note: short(note) } : { ok: true, ref: id }
    return { ok: false, error: xError(r) }
  } catch (err) {
    return failure(err)
  }
}

/**
 * A tweet with a video: chunked upload (initialize, append, finalize, wait for X to process it),
 * then the tweet. The video is given as bytes (the daily X video, rendered by the x-video workflow) or as a public URL.
 * Not covered by live tests: run it once by hand and read the result before relying on it.
 */
export async function sendXVideo(cfg: XKeys, input: { text: string; videoUrl?: string; video?: { bytes: Uint8Array; type: string } }, deps: SendDeps): Promise<SendResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const base = 'https://api.x.com/2/media/upload'
  try {
    let video: { bytes: Uint8Array; type: string }
    if (input.video) {
      if (input.video.bytes.byteLength === 0 || input.video.bytes.byteLength > X_VIDEO_MAX_BYTES) return { ok: false, error: 'video is empty or too large' }
      video = input.video
    } else if (input.videoUrl) {
      const got = await download(deps, input.videoUrl, 'video')
      if (typeof got === 'string') return { ok: false, error: short(got) }
      video = got
    } else {
      return { ok: false, error: 'no video given' }
    }
    const init = await call(deps, `${base}/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: signed(cfg, 'POST', `${base}/initialize`) },
      body: JSON.stringify({ media_type: video.type, total_bytes: video.bytes.byteLength, media_category: 'tweet_video' }),
    })
    const mediaId = (init.body.data as { id?: string } | undefined)?.id
    if (init.status < 200 || init.status >= 300 || !mediaId) return { ok: false, error: xError(init) }

    const appendUrl = `${base}/${mediaId}/append`
    for (let i = 0, at = 0; at < video.bytes.byteLength; i++, at += X_VIDEO_CHUNK) {
      const chunk = video.bytes.subarray(at, Math.min(at + X_VIDEO_CHUNK, video.bytes.byteLength))
      const r = await call(deps, appendUrl, { method: 'POST', headers: { Authorization: signed(cfg, 'POST', appendUrl) }, body: multipart({ segment_index: String(i) }, { name: 'reel.mp4', bytes: chunk, type: video.type }) })
      if (r.status < 200 || r.status >= 300) return { ok: false, error: xError(r) }
    }

    const finUrl = `${base}/${mediaId}/finalize`
    const fin = await call(deps, finUrl, { method: 'POST', headers: { Authorization: signed(cfg, 'POST', finUrl) } })
    if (fin.status < 200 || fin.status >= 300) return { ok: false, error: xError(fin) }
    let info = (fin.body.data as { processing_info?: { state?: string; check_after_secs?: number } } | undefined)?.processing_info
    for (let tries = 0; info && info.state !== 'succeeded' && tries < 10; tries++) {
      if (info.state === 'failed') return { ok: false, error: 'X could not process the video' }
      await sleep(Math.min(Math.max(info.check_after_secs ?? 2, 1), 5) * 1000)
      const params = { command: 'STATUS', media_id: mediaId }
      const statusUrl = `${base}?command=STATUS&media_id=${mediaId}`
      const st = await call(deps, statusUrl, { method: 'GET', headers: { Authorization: signed(cfg, 'GET', base, params) } })
      info = (st.body.data as { processing_info?: { state?: string; check_after_secs?: number } } | undefined)?.processing_info
    }
    if (info && info.state !== 'succeeded') return { ok: false, error: 'X is still processing the video; try again later' }

    const r = await call(deps, X_TWEETS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: signed(cfg, 'POST', X_TWEETS) },
      body: JSON.stringify({ text: input.text, media: { media_ids: [mediaId] } }),
    })
    const id = (r.body.data as { id?: string } | undefined)?.id
    if (r.status >= 200 && r.status < 300 && id) return { ok: true, ref: id }
    return { ok: false, error: xError(r) }
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
    const r = await call(deps, graph(all, `${cfg.pageId}/feed`), { method: 'POST', ...f }, FACEBOOK_TIMEOUT_MS)
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
