import test from 'node:test'
import assert from 'node:assert/strict'
import { FACEBOOK_TIMEOUT_MS, configuredChannels, loadChannelConfig, secretsOf, sendFacebook, sendInstagram, sendTelegram, sendWebhook, sendX, type ChannelConfig, type FetchFn } from './channels'
import type { ComposedPost } from './compose'

interface Call { url: string; method: string; headers: Record<string, string>; body: string }

function fake(handler: (c: Call, n: number) => { status?: number; body: unknown }): { fetch: FetchFn; calls: Call[] } {
  const calls: Call[] = []
  const f: FetchFn = async (url, init) => {
    const call: Call = { url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: String(init?.body ?? '') }
    calls.push(call)
    const r = handler(call, calls.length)
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status ?? 200 })
  }
  return { fetch: f, calls }
}

const post: ComposedPost = { text: 'Headline #NewsEdition', hashtags: ['#NewsEdition'], link: 'https://newsedition.in/article/x', imageUrl: 'https://res.cloudinary.com/d/image/upload/p.jpg' }

const env = {
  TELEGRAM_BOT_TOKEN: '123456:ABC-secret', TELEGRAM_CHAT_ID: '@newsedition',
  X_API_KEY: 'ck', X_API_SECRET: 'cs', X_ACCESS_TOKEN: 'at', X_ACCESS_TOKEN_SECRET: 'ats',
  META_PAGE_ACCESS_TOKEN: 'EAAB-secret', FACEBOOK_PAGE_ID: '111', INSTAGRAM_ACCOUNT_ID: '222',
  SOCIAL_WEBHOOK_URL: 'https://hook.example.com/abc', SOCIAL_WEBHOOK_SECRET: 'whsec-123',
}

test('a platform is configured only when all its keys are present', () => {
  assert.deepEqual(configuredChannels(loadChannelConfig({})), [])
  assert.deepEqual(configuredChannels(loadChannelConfig(env)), ['telegram', 'x', 'facebook', 'instagram', 'webhook'])
  assert.deepEqual(configuredChannels(loadChannelConfig({ TELEGRAM_BOT_TOKEN: 't' })), [])
  assert.deepEqual(configuredChannels(loadChannelConfig({ META_PAGE_ACCESS_TOKEN: 't', FACEBOOK_PAGE_ID: '1' })), ['facebook'])
})

test('X links default to top stories only; a wrong value falls back', () => {
  assert.equal(loadChannelConfig({}).xLinkMode, 'top')
  assert.equal(loadChannelConfig({ X_LINK_MODE: 'always' }).xLinkMode, 'always')
  assert.equal(loadChannelConfig({ X_LINK_MODE: 'sometimes' }).xLinkMode, 'top')
  assert.equal(loadChannelConfig({}).graphVersion, 'v23.0')
})

test('every secret is listed so it can be scrubbed', () => {
  const s = secretsOf(loadChannelConfig(env))
  for (const v of ['123456:ABC-secret', 'cs', 'at', 'ats', 'EAAB-secret', 'whsec-123']) assert.ok(s.includes(v), v)
})

const cfg = loadChannelConfig(env) as Required<ChannelConfig>

test('Telegram sends the photo with the caption', async () => {
  const f = fake(() => ({ body: { ok: true, result: { message_id: 77 } } }))
  const r = await sendTelegram(cfg.telegram, post, { fetch: f.fetch })
  assert.deepEqual(r, { ok: true, ref: '77' })
  assert.equal(f.calls.length, 1)
  assert.ok(f.calls[0].url.endsWith('/sendPhoto'))
  const body = JSON.parse(f.calls[0].body)
  assert.equal(body.chat_id, '@newsedition')
  assert.equal(body.caption, post.text)
  assert.equal(body.parse_mode, 'HTML')
})

test('Telegram falls back to a text message when the photo is refused', async () => {
  const f = fake((c) => (c.url.endsWith('/sendPhoto') ? { status: 400, body: { ok: false, description: 'wrong file' } } : { body: { ok: true, result: { message_id: 8 } } }))
  const r = await sendTelegram(cfg.telegram, post, { fetch: f.fetch })
  assert.deepEqual(r, { ok: true, ref: '8' })
  assert.deepEqual(f.calls.map((c) => c.url.split('/').pop()), ['sendPhoto', 'sendMessage'])
})

test('Telegram reports why a message failed', async () => {
  const f = fake(() => ({ status: 403, body: { ok: false, description: 'Forbidden: bot is not a member of the channel chat' } }))
  const r = await sendTelegram(cfg.telegram, { ...post, imageUrl: null }, { fetch: f.fetch })
  assert.equal(r.ok, false)
  assert.match(r.error ?? '', /not a member of the channel/)
})

test('X posts the text with an OAuth header and returns the id', async () => {
  const f = fake(() => ({ status: 201, body: { data: { id: '1850', text: 'x' } } }))
  const r = await sendX(cfg.x, { ...post, imageUrl: null }, { fetch: f.fetch })
  assert.deepEqual(r, { ok: true, ref: '1850' })
  assert.equal(f.calls[0].url, 'https://api.x.com/2/tweets')
  assert.ok(f.calls[0].headers.Authorization.startsWith('OAuth '))
  assert.deepEqual(JSON.parse(f.calls[0].body), { text: post.text })
})

test('X says so when the credits are used up', async () => {
  const f = fake(() => ({ status: 402, body: { title: 'CreditsDepleted' } }))
  const r = await sendX(cfg.x, { ...post, imageUrl: null }, { fetch: f.fetch })
  assert.equal(r.ok, false)
  assert.match(r.error ?? '', /credits/)
})

test('Facebook posts the text with the link and the page token', async () => {
  const f = fake(() => ({ body: { id: '111_999' } }))
  const r = await sendFacebook(cfg, post, { fetch: f.fetch })
  assert.deepEqual(r, { ok: true, ref: '111_999' })
  assert.equal(f.calls[0].url, 'https://graph.facebook.com/v23.0/111/feed')
  const form = new URLSearchParams(f.calls[0].body)
  assert.equal(form.get('message'), post.text)
  assert.equal(form.get('link'), post.link)
  assert.equal(form.get('access_token'), 'EAAB-secret')
})

test('Facebook is given more time than the other senders for its link preview, and still gets an abort signal', async () => {
  assert.ok(FACEBOOK_TIMEOUT_MS >= 30_000 && FACEBOOK_TIMEOUT_MS <= 60_000)
  let signal: AbortSignal | undefined
  const f: FetchFn = async (_url, init) => {
    signal = init?.signal ?? undefined
    return new Response(JSON.stringify({ id: '111_222' }), { status: 200 })
  }
  const r = await sendFacebook(cfg, post, { fetch: f })
  assert.equal(r.ok, true)
  assert.ok(signal instanceof AbortSignal)
})

test('Facebook shows the platform error', async () => {
  const f = fake(() => ({ status: 400, body: { error: { message: 'Invalid OAuth access token.', code: 190 } } }))
  const r = await sendFacebook(cfg, post, { fetch: f.fetch })
  assert.equal(r.ok, false)
  assert.match(r.error ?? '', /Invalid OAuth access token.*190/)
})

test('Instagram creates the container, waits until it is ready, then publishes', async () => {
  const statuses = ['IN_PROGRESS', 'FINISHED']
  const f = fake((c) => {
    if (c.url.endsWith('/222/media')) return { body: { id: 'c1' } }
    if (c.url.includes('/c1?')) return { body: { status_code: statuses.shift() } }
    if (c.url.endsWith('/222/media_publish')) return { body: { id: 'm9' } }
    return { status: 404, body: {} }
  })
  const waits: number[] = []
  const r = await sendInstagram(cfg, post, { fetch: f.fetch, sleep: async (ms) => { waits.push(ms) } })
  assert.deepEqual(r, { ok: true, ref: 'm9' })
  assert.equal(new URLSearchParams(f.calls[0].body).get('image_url'), post.imageUrl)
  assert.equal(new URLSearchParams(f.calls[0].body).get('caption'), post.text)
  assert.equal(new URLSearchParams(f.calls.at(-1)!.body).get('creation_id'), 'c1')
  assert.equal(waits.length, 1)
})

test('Instagram does not publish a picture it rejected', async () => {
  const f = fake((c) => (c.url.endsWith('/media') ? { body: { id: 'c1' } } : { body: { status_code: 'ERROR' } }))
  const r = await sendInstagram(cfg, post, { fetch: f.fetch, sleep: async () => undefined })
  assert.equal(r.ok, false)
  assert.match(r.error ?? '', /ERROR/)
  assert.ok(!f.calls.some((c) => c.url.endsWith('media_publish')))
})

test('Instagram needs a picture', async () => {
  const f = fake(() => ({ body: {} }))
  const r = await sendInstagram(cfg, { ...post, imageUrl: null }, { fetch: f.fetch })
  assert.equal(r.ok, false)
  assert.equal(f.calls.length, 0)
})

test('the webhook gets the payload with the secret as a bearer token', async () => {
  const f = fake(() => ({ body: { accepted: true } }))
  const r = await sendWebhook(cfg.webhook, { event: 'article.published' }, { fetch: f.fetch })
  assert.equal(r.ok, true)
  assert.equal(f.calls[0].headers.Authorization, 'Bearer whsec-123')
  assert.deepEqual(JSON.parse(f.calls[0].body), { event: 'article.published' })
})

test('a network failure is an answer, not an exception', async () => {
  const boom: FetchFn = async () => { throw new Error('connect ETIMEDOUT') }
  for (const r of [
    await sendTelegram(cfg.telegram, post, { fetch: boom }),
    await sendX(cfg.x, post, { fetch: boom }),
    await sendFacebook(cfg, post, { fetch: boom }),
    await sendInstagram(cfg, post, { fetch: boom }),
    await sendWebhook(cfg.webhook, {}, { fetch: boom }),
  ]) {
    assert.equal(r.ok, false)
    assert.match(r.error ?? '', /ETIMEDOUT/)
  }
})
