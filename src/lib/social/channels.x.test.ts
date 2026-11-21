import test from 'node:test'
import assert from 'node:assert/strict'
import { sendX, sendXVideo, type FetchFn } from './channels'
import type { ComposedPost } from './compose'

const cfg = { consumerKey: 'ck', consumerSecret: 'cs', token: 'at', tokenSecret: 'ats' }
const IMG = 'https://res.cloudinary.com/demo/image/upload/c_limit,w_1600/v1/cover.jpg'
const VIDEO = 'https://res.cloudinary.com/demo/video/upload/reel.mp4'

interface Call { url: string; method: string; headers: Record<string, string>; body: unknown }
interface Reply { status?: number; json?: unknown; bytes?: Uint8Array; type?: string }

function fake(handler: (c: Call, n: number) => Reply): { fetch: FetchFn; calls: Call[] } {
  const calls: Call[] = []
  const f: FetchFn = async (url, init) => {
    const c: Call = { url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body }
    calls.push(c)
    const r = handler(c, calls.length)
    const body = r.status === 204 ? null : (r.bytes ?? JSON.stringify(r.json ?? {}))
    return new Response(body as BodyInit | null, { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'application/json' } })
  }
  return { fetch: f, calls }
}

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const tweet = (c: Call) => JSON.parse(String(c.body)) as Record<string, unknown>
const post = (over: Partial<ComposedPost> = {}): ComposedPost => ({ text: 'Hook\n\nFact', hashtags: [], link: null, imageUrl: IMG, poll: null, ...over })

test('a picture is downloaded, uploaded to X and attached to the tweet', async () => {
  const f = fake((c) => {
    if (c.url === IMG) return { bytes: jpeg, type: 'image/jpeg' }
    if (c.url === 'https://api.x.com/2/media/upload') return { json: { data: { id: 'm1' } } }
    return { json: { data: { id: '77' } } }
  })
  const r = await sendX(cfg, post(), { fetch: f.fetch })
  assert.deepEqual(r, { ok: true, ref: '77' })
  assert.deepEqual(f.calls.map((c) => c.url), [IMG, 'https://api.x.com/2/media/upload', 'https://api.x.com/2/tweets'])
  const form = f.calls[1].body as FormData
  assert.equal(form.get('media_category'), 'tweet_image')
  assert.ok(form.get('media') instanceof Blob)
  assert.ok(f.calls[1].headers.Authorization.startsWith('OAuth '))
  assert.equal(f.calls[1].headers['Content-Type'], undefined)
  assert.deepEqual(tweet(f.calls[2]), { text: 'Hook\n\nFact', media: { media_ids: ['m1'] } })
})

test('when the new upload endpoint refuses, the old one is tried', async () => {
  const f = fake((c) => {
    if (c.url === IMG) return { bytes: jpeg, type: 'image/jpeg' }
    if (c.url === 'https://api.x.com/2/media/upload') return { status: 403, json: { title: 'Forbidden' } }
    if (c.url.startsWith('https://upload.twitter.com/1.1/media/upload.json')) return { json: { media_id_string: '555' } }
    return { json: { data: { id: '78' } } }
  })
  const r = await sendX(cfg, post(), { fetch: f.fetch })
  assert.deepEqual(r, { ok: true, ref: '78' })
  assert.deepEqual(tweet(f.calls[3]).media, { media_ids: ['555'] })
})

test('when no upload works the story goes out as text, and says so', async () => {
  const f = fake((c) => {
    if (c.url === IMG) return { bytes: jpeg, type: 'image/jpeg' }
    if (c.url.includes('media/upload')) return { status: 401, json: { title: 'Unauthorized' } }
    return { json: { data: { id: '79' } } }
  })
  const r = await sendX(cfg, post(), { fetch: f.fetch })
  assert.equal(r.ok, true)
  assert.equal(r.ref, '79')
  assert.match(r.note ?? '', /without the picture.*401/)
  assert.deepEqual(tweet(f.calls[f.calls.length - 1]), { text: 'Hook\n\nFact' })
})

test('a picture that is not an image, or too large, is not uploaded', async () => {
  const html = fake((c) => (c.url === IMG ? { bytes: new TextEncoder().encode('<html>'), type: 'text/html' } : { json: { data: { id: '1' } } }))
  const a = await sendX(cfg, post(), { fetch: html.fetch })
  assert.match(a.note ?? '', /text\/html/)
  assert.equal(html.calls.length, 2)
  const big = fake((c) => (c.url === IMG ? { bytes: new Uint8Array(5 * 1024 * 1024 + 1), type: 'image/png' } : { json: { data: { id: '1' } } }))
  const b = await sendX(cfg, post(), { fetch: big.fetch })
  assert.match(b.note ?? '', /larger than 5 MB/)
})

test('if X refuses the tweet because of the attachment, it is sent again as text', async () => {
  let tweets = 0
  const f = fake((c) => {
    if (c.url === IMG) return { bytes: jpeg, type: 'image/jpeg' }
    if (c.url === 'https://api.x.com/2/media/upload') return { json: { data: { id: 'm1' } } }
    tweets++
    return tweets === 1 ? { status: 400, json: { detail: 'Invalid media' } } : { json: { data: { id: '80' } } }
  })
  const r = await sendX(cfg, post(), { fetch: f.fetch })
  assert.equal(r.ok, true)
  assert.match(r.note ?? '', /Invalid media/)
  assert.equal(tweets, 2)
})

test('a poll tweet carries the options and the duration, and never a picture', async () => {
  const f = fake(() => ({ json: { data: { id: '81' } } }))
  const r = await sendX(cfg, post({ poll: { options: ['Right call', 'Wrong call', 'Not sure'], durationMinutes: 1440 } }), { fetch: f.fetch })
  assert.deepEqual(r, { ok: true, ref: '81' })
  assert.equal(f.calls.length, 1)
  assert.deepEqual(tweet(f.calls[0]), { text: 'Hook\n\nFact', poll: { options: ['Right call', 'Wrong call', 'Not sure'], duration_minutes: 1440 } })
})

test('a failed tweet is an error, not a retry', async () => {
  const f = fake((c) => (c.url.endsWith('/2/tweets') ? { status: 429, json: { title: 'Too Many Requests' } } : { bytes: jpeg, type: 'image/jpeg' }))
  const r = await sendX(cfg, post({ imageUrl: null }), { fetch: f.fetch })
  assert.equal(r.ok, false)
  assert.match(r.error ?? '', /429/)
  assert.equal(f.calls.length, 1)
})

test('a video is uploaded in chunks, processed, then tweeted', async () => {
  const mp4 = new Uint8Array(4 * 1024 * 1024 + 10)
  let statuses = 0
  const f = fake((c) => {
    if (c.url === VIDEO) return { bytes: mp4, type: 'video/mp4' }
    if (c.url.endsWith('/initialize')) return { json: { data: { id: 'v1' } } }
    if (c.url.endsWith('/append')) return { status: 204 }
    if (c.url.endsWith('/finalize')) return { json: { data: { id: 'v1', processing_info: { state: 'pending', check_after_secs: 1 } } } }
    if (c.url.includes('command=STATUS')) return { json: { data: { id: 'v1', processing_info: { state: ++statuses < 2 ? 'in_progress' : 'succeeded', check_after_secs: 1 } } } }
    return { json: { data: { id: '90' } } }
  })
  const waits: number[] = []
  const r = await sendXVideo(cfg, { text: 'Reel of the day', videoUrl: VIDEO }, { fetch: f.fetch, sleep: async (ms) => { waits.push(ms) } })
  assert.deepEqual(r, { ok: true, ref: '90' })
  const urls = f.calls.map((c) => c.url)
  assert.equal(urls.filter((u) => u.endsWith('/append')).length, 2)
  assert.deepEqual(JSON.parse(String(f.calls[1].body)), { media_type: 'video/mp4', total_bytes: mp4.byteLength, media_category: 'tweet_video' })
  assert.deepEqual((f.calls[2].body as FormData).get('segment_index'), '0')
  assert.deepEqual((f.calls[3].body as FormData).get('segment_index'), '1')
  assert.deepEqual(tweet(f.calls[f.calls.length - 1]), { text: 'Reel of the day', media: { media_ids: ['v1'] } })
  assert.equal(waits.length, 2)
})

test('a video that is not an mp4, or that X cannot process, is an error', async () => {
  const wrong = fake(() => ({ bytes: jpeg, type: 'image/jpeg' }))
  assert.match((await sendXVideo(cfg, { text: 't', videoUrl: VIDEO }, { fetch: wrong.fetch })).error ?? '', /image\/jpeg/)
  const failed = fake((c) => {
    if (c.url === VIDEO) return { bytes: new Uint8Array(10), type: 'video/mp4' }
    if (c.url.endsWith('/initialize')) return { json: { data: { id: 'v2' } } }
    if (c.url.endsWith('/append')) return { status: 204 }
    return { json: { data: { processing_info: { state: 'failed' } } } }
  })
  const r = await sendXVideo(cfg, { text: 't', videoUrl: VIDEO }, { fetch: failed.fetch, sleep: async () => {} })
  assert.equal(r.ok, false)
  assert.match(r.error ?? '', /could not process/)
})
