import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanPostText, confirmPost, isBreakingPost, orgOfHandle, orgOfPublisher, parsePostState, POST_READ_GAP_MS, POST_SOURCES_DEFAULT, postCandidates, postQuery, postSources,
  QUERY_MAX, readTooSoon, sameEvent, stillPending, type PostCandidate,
} from './xposts'
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
  assert.deepEqual(parsePostState(null), { pending: [] })
  assert.deepEqual(parsePostState('junk'), { pending: [] })
  const p: PostCandidate = { id: '1', username: 'ANI', text: 'Explosion near Red Fort in Delhi', createdAt: '2026-11-28T11:50:00Z' }
  assert.deepEqual(parsePostState(JSON.stringify({ sinceId: '12345', readAt: '2026-11-28T11:59:30Z', pending: [p, { id: 5 }] })), { sinceId: '12345', readAt: '2026-11-28T11:59:30Z', pending: [p] })
  assert.deepEqual(parsePostState(JSON.stringify({ sinceId: 'abc' })), { pending: [] })
  assert.equal(readTooSoon({ readAt: new Date(NOW.getTime() - POST_READ_GAP_MS + 5000).toISOString() }, NOW), true)
  assert.equal(readTooSoon({ readAt: new Date(NOW.getTime() - POST_READ_GAP_MS - 5000).toISOString() }, NOW), false)
  assert.equal(readTooSoon({}, NOW), false)
})

// ── the second source ───────────────────────────────────────────────────────

const post = (id: string, username: string, text: string, createdAt = '2026-11-28T11:50:00Z'): PostCandidate => ({ id, username, text, createdAt })
const BLAST = 'Explosion near Red Fort in Delhi, 8 injured'

test('an account and the website of the same outlet are one organisation', () => {
  assert.equal(orgOfHandle('ndtv'), orgOfPublisher('ndtv'))
  assert.equal(orgOfHandle('the_hindu'), orgOfPublisher('the-hindu'))
  assert.equal(orgOfHandle('htTweets'), orgOfPublisher('hindustan-times'))
  assert.equal(orgOfHandle('BBCBreaking'), orgOfPublisher('bbc'))
  assert.equal(orgOfHandle('AJEnglish'), orgOfPublisher('al-jazeera'))
  assert.equal(orgOfPublisher('the-hindu-businessline'), orgOfPublisher('the-hindu'))
  assert.notEqual(orgOfHandle('ANI'), orgOfHandle('PTI_News'))
})

test('the same event, by headline', () => {
  assert.equal(sameEvent(BLAST, 'Blast near Red Fort in Delhi leaves eight hurt'), true)
  assert.equal(sameEvent(BLAST, 'RBI keeps repo rate unchanged at 6.5%'), false)
})

test('one post alone is not confirmed', () => {
  assert.equal(confirmPost(post('1', 'ANI', BLAST), [], []), null)
  // the same account twice, or its own website, is still one organisation
  assert.equal(confirmPost(post('1', 'ndtv', BLAST), [post('2', 'ndtv', 'Blast near Red Fort in Delhi leaves eight hurt')], []), null)
  assert.equal(confirmPost(post('1', 'ndtv', BLAST), [], [{ publisherKey: 'ndtv', title: 'Blast near Red Fort in Delhi leaves eight hurt', summary: 'x' }]), null)
  // a different event is no confirmation
  assert.equal(confirmPost(post('1', 'ANI', BLAST), [post('2', 'PTI_News', 'Fire at Mumbai mall, three rescued')], [{ publisherKey: 'bbc', title: 'Floods hit Kerala, thousands move to camps', summary: '' }]), null)
})

test('a second account confirms; the post comes first, one report per organisation', () => {
  const ev = confirmPost(post('1', 'ANI', BLAST), [post('2', 'PTI_News', 'Blast near Red Fort in Delhi leaves eight hurt'), post('3', 'pti_news', 'Eight injured in blast at Red Fort, Delhi')], [])
  assert.ok(ev)
  assert.deepEqual(ev.map((e) => e.org), ['ani', 'pti'])
  assert.equal(ev[0].title, BLAST)
})

test('a trusted publisher\'s story confirms, with its summary', () => {
  const ev = confirmPost(post('1', 'ANI', BLAST), [], [{ publisherKey: 'the-hindu', title: 'Blast near Red Fort in Delhi leaves eight hurt', summary: 'Eight people were injured on Saturday.' }])
  assert.ok(ev)
  assert.deepEqual(ev.map((e) => [e.kind, e.org]), [['post', 'ani'], ['feed', 'the-hindu']])
  assert.equal(ev[1].summary, 'Eight people were injured on Saturday.')
})

test('waiting posts: kept while fresh, newest first, then dropped', () => {
  const posts = [post('1', 'ANI', BLAST, '2026-11-28T11:40:00Z'), post('2', 'PTI_News', 'Another thing happened today in India', '2026-11-28T11:55:00Z'), post('3', 'ANI', 'Old thing that happened this morning', '2026-11-28T10:00:00Z')]
  assert.deepEqual(stillPending(posts, NOW).map((p) => p.id), ['2', '1'])
})
