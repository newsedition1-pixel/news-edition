import test from 'node:test'
import assert from 'node:assert/strict'
import { getMe, getMentions, parseDeskTweets, parseMentions, postReply, searchRecent } from './xread'
import type { FetchFn } from './channels'

const cfg = { consumerKey: 'ck', consumerSecret: 'cs', token: 'at', tokenSecret: 'ats' }
interface Call { url: string; method: string; auth: string; body: string }

function fake(handler: (c: Call) => { status?: number; json: unknown }): { fetch: FetchFn; calls: Call[] } {
  const calls: Call[] = []
  const f: FetchFn = async (url, init) => {
    const c: Call = { url, method: init?.method ?? 'GET', auth: String((init?.headers as Record<string, string>)?.Authorization ?? ''), body: String(init?.body ?? '') }
    calls.push(c)
    const r = handler(c)
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 })
  }
  return { fetch: f, calls }
}

const mentionsBody = {
  data: [
    { id: '2', text: '@NewsEdition_1 Second one', author_id: 'u2', created_at: '2026-11-22T12:10:00.000Z', referenced_tweets: [{ type: 'replied_to', id: 'p1' }] },
    { id: '1', text: '@NewsEdition_1 Will EMIs change?', author_id: 'u1', created_at: '2026-11-22T12:00:00.000Z', referenced_tweets: [{ type: 'replied_to', id: 'p1' }] },
    { id: '3', text: 'no author known', author_id: 'u9', created_at: '2026-11-22T12:20:00.000Z' },
  ],
  includes: {
    users: [{ id: 'u1', username: 'reader1', created_at: '2020-01-01T00:00:00.000Z', public_metrics: { followers_count: 50 } }, { id: 'u2', username: 'reader2' }],
    tweets: [{ id: 'p1', text: '@x RBI keeps the repo rate at 5.5%', author_id: 'me' }],
  },
  meta: { newest_id: '3' },
}

test('mentions are read oldest first with our post and the author', () => {
  const { mentions, newestId } = parseMentions(mentionsBody, 'me')
  assert.deepEqual(mentions.map((m) => m.id), ['1', '2'])
  assert.equal(mentions[0].username, 'reader1')
  assert.equal(mentions[0].parentText, 'RBI keeps the repo rate at 5.5%')
  assert.equal(mentions[0].followers, 50)
  assert.equal(newestId, '3')
  // A parent post that is not ours is not given to the writer as "our post".
  assert.equal(parseMentions(mentionsBody, 'someone-else').mentions[0].parentText, null)
})

test('the account id, the mentions and the search are signed GET calls with exact query strings', async () => {
  const f = fake((c) => {
    if (c.url.endsWith('/users/me')) return { json: { data: { id: 'me', username: 'NewsEdition_1' } } }
    if (c.url.includes('/mentions')) return { json: mentionsBody }
    return { json: { data: [{ id: '10', text: 'RBI keeps the repo rate unchanged', author_id: 'u1', created_at: '2026-11-22T12:00:00.000Z', public_metrics: { like_count: 5, reply_count: 2 } }], includes: { users: [{ id: 'u1', username: 'RBI', name: 'RBI', public_metrics: { followers_count: 9 } }] } } }
  })
  assert.deepEqual(await getMe(cfg, f), { id: 'me', username: 'NewsEdition_1' })
  const m = await getMentions(cfg, f, 'me', '100')
  assert.ok(typeof m !== 'string' && m.mentions.length === 2)
  assert.ok(f.calls[1].url.startsWith('https://api.x.com/2/users/me/mentions?'))
  assert.match(f.calls[1].url, /since_id=100/)
  assert.match(f.calls[1].url, /max_results=20/)
  const d = await searchRecent(cfg, f, '(from:RBI) -is:reply')
  assert.ok(typeof d !== 'string')
  assert.equal(d[0].username, 'RBI')
  assert.match(f.calls[2].url, /query=%28from%3ARBI%29%20-is%3Areply/)
  assert.ok(f.calls.every((c) => c.auth.startsWith('OAuth ') && c.method === 'GET'))
})

test('a failed read is a reason, not an exception', async () => {
  const credits = fake(() => ({ status: 402, json: { title: 'CreditsDepleted' } }))
  assert.match((await getMentions(cfg, credits, 'me')) as string, /credits are used up/)
  const boom: { fetch: FetchFn } = { fetch: async () => { throw new Error('ETIMEDOUT') } }
  assert.match((await searchRecent(cfg, boom, 'q')) as string, /ETIMEDOUT/)
  assert.match((await getMe(cfg, boom)) as string, /ETIMEDOUT/)
})

test('desk posts keep the author, the numbers and the time', () => {
  const t = parseDeskTweets({ data: [{ id: '1', text: 't', author_id: 'u', created_at: '2026-11-22T12:00:00.000Z', public_metrics: { like_count: 7, reply_count: 1 } }, { id: '2', text: 'x', author_id: 'zz', created_at: '2026-11-22T12:00:00.000Z' }], includes: { users: [{ id: 'u', username: 'ANI', name: 'ANI News', public_metrics: { followers_count: 5 } }] } })
  assert.deepEqual(t, [{ id: '1', username: 'ANI', name: 'ANI News', text: 't', createdAt: '2026-11-22T12:00:00.000Z', likes: 7, replies: 1, followers: 5 }])
})

test('a reply is a tweet that names the post it answers', async () => {
  const f = fake(() => ({ status: 201, json: { data: { id: '55' } } }))
  assert.deepEqual(await postReply(cfg, f, 'Thanks for asking.', '1'), { ok: true, ref: '55' })
  assert.deepEqual(JSON.parse(f.calls[0].body), { text: 'Thanks for asking.', reply: { in_reply_to_tweet_id: '1' } })
  const refused = fake(() => ({ status: 403, json: { detail: 'Reply to this conversation is not allowed because you have not been mentioned or otherwise engaged by the author of the post you are replying to.' } }))
  const r = await postReply(cfg, refused, 'x', '1')
  assert.equal(r.ok, false)
  assert.match(r.error ?? '', /403/)
})
