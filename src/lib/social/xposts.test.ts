import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanPostText, isBreakingPost, parsePostState, POST_READ_GAP_MS, POST_SOURCES_DEFAULT, postCandidates, postQuery, postSources, QUERY_MAX, readTooSoon } from './xposts'
import type { DeskTweet } from './xreplies'

const NOW = new Date('2026-11-28T12:00:00Z')
const tweet = (over: Partial<DeskTweet> = {}): DeskTweet => ({
  id: '100', username: 'ANI', name: 'ANI', text: 'BREAKING: Explosion near Red Fort in Delhi, several injured https://t.co/abc', createdAt: '2026-11-28T11:50:00Z', likes: 0, replies: 0, followers: 1000, ...over,
})

test('the source list: default, cleaned, capped', () => {
  assert.deepEqual(postSources(undefined), POST_SOURCES_DEFAULT)
  assert.deepEqual(postSources(''), POST_SOURCES_DEFAULT)
  assert.deepEqual(postSources('@ANI, PTI_News ani bad-handle!'), ['ANI', 'PTI_News'])
  assert.equal(postSources(Array.from({ length: 30 }, (_, i) => `h${i}`).join(',')).length, 12)
})

test('the search query: handles, words, filters, always inside the limit', () => {
  const q = postQuery(['ANI', 'PTI_News'])
  assert.match(q, /^\(from:ANI OR from:PTI_News\) \(BREAKING OR "JUST IN"/)
  assert.match(q, /-is:retweet -is:reply -is:quote lang:en$/)
  const long = postQuery(Array.from({ length: 12 }, (_, i) => `LongHandleName${i}`))
  assert.ok(long.length <= QUERY_MAX, String(long.length))
  assert.ok(long.startsWith('(from:LongHandleName0'))
  assert.ok(postQuery(POST_SOURCES_DEFAULT).length <= QUERY_MAX)
})

test('the post as plain words', () => {
  assert.equal(cleanPostText('BREAKING: Explosion near Red Fort in Delhi, several injured https://t.co/abc'), 'Explosion near Red Fort in Delhi, several injured')
  assert.equal(cleanPostText('🚨 JUST IN | 7 killed in blast in Kabul #Afghanistan @ANI (ANI)'), '7 killed in blast in Kabul Afghanistan')
  assert.equal(cleanPostText('Fire at mumbai mall - Reuters'), 'Fire at mumbai mall')
})

test('which posts count as breaking', () => {
  assert.equal(isBreakingPost('BREAKING: Prime Minister to address the nation at 8 pm'), true)
  assert.equal(isBreakingPost('🚨 Just in: RBI announces a surprise policy statement'), true)
  assert.equal(isBreakingPost('Eight killed as bus falls into gorge in Uttarakhand'), true)
  assert.equal(isBreakingPost('Good morning! Here is the weather outlook for the weekend'), false)
  assert.equal(isBreakingPost('Watch our special show on Sunday at 9 pm'), false)
})

test('candidates: allowed handle, fresh, breaking, newest first, no repeats', () => {
  const tweets = [
    tweet(),
    tweet({ id: '101', username: 'ani', text: 'Seven killed in landslide in Kerala', createdAt: '2026-11-28T11:55:00Z' }),
    tweet({ id: '102', username: 'RandomUser', text: 'BREAKING: aliens land in Delhi' }),
    tweet({ id: '103', createdAt: '2026-11-28T10:00:00Z' }), // too old
    tweet({ id: '104', text: 'Good morning India' }),
    tweet({ id: '105', text: 'BREAKING: ok' }), // too short once cleaned
    tweet(), // same id again
  ]
  const out = postCandidates(tweets, NOW, ['ANI', 'PTI_News'])
  assert.deepEqual(out.map((p) => p.id), ['101', '100'])
  assert.equal(out[1].text, 'Explosion near Red Fort in Delhi, several injured')
})

test('the cursor: parsed safely, reads are spaced', () => {
  assert.deepEqual(parsePostState(null), {})
  assert.deepEqual(parsePostState('junk'), {})
  assert.deepEqual(parsePostState(JSON.stringify({ sinceId: '12345', readAt: '2026-11-28T11:59:30Z' })), { sinceId: '12345', readAt: '2026-11-28T11:59:30Z' })
  assert.deepEqual(parsePostState(JSON.stringify({ sinceId: 'abc' })), {})
  assert.equal(readTooSoon({ readAt: new Date(NOW.getTime() - POST_READ_GAP_MS + 5000).toISOString() }, NOW), true)
  assert.equal(readTooSoon({ readAt: new Date(NOW.getTime() - POST_READ_GAP_MS - 5000).toISOString() }, NOW), false)
  assert.equal(readTooSoon({}, NOW), false)
})
