import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alternativeCategories, categoryScores, classifyStory, deskForSlug, lastActivity, normalizeName, pickAuthorId, rotationOrder, DESKS, SCHEDULE_SLUGS } from './desks'

test('every scheduled category has exactly one desk', () => {
  for (const slug of SCHEDULE_SLUGS) assert.ok(deskForSlug(slug), slug)
  const all = DESKS.flatMap((d) => d.slugs)
  assert.equal(new Set(all).size, all.length)
  assert.deepEqual([...all].sort(), [...SCHEDULE_SLUGS].sort())
})

test('owner decision: author per category', () => {
  assert.equal(deskForSlug('india')?.authorName, 'Amit Gautam')
  assert.equal(deskForSlug('business')?.authorName, 'Amit Gautam')
  assert.equal(deskForSlug('world')?.authorName, 'News Edition Desk')
  assert.equal(deskForSlug('politics')?.authorName, 'News Edition Desk')
  assert.equal(deskForSlug('state')?.authorName, 'Sanjay Kumar')
  assert.equal(deskForSlug('governance')?.authorName, 'Sanjay Kumar')
  assert.equal(deskForSlug('entertainment')?.authorName, 'Rinki Gautam')
  assert.equal(deskForSlug('sports'), null)
})

test('author lookup ignores case, prefers owner, never uses banned accounts', () => {
  const rows = [
    { id: 'new', name: 'Amit Gautam', role: 'user', banned: false, createdAt: '2026-02-01' },
    { id: 'old-admin', name: 'amit  gautam', role: 'admin', banned: false, createdAt: '2025-01-01' },
    { id: 'owner', name: 'Amit Gautam', role: 'owner', banned: false, createdAt: '2025-06-01' },
    { id: 'banned-owner', name: 'Amit Gautam', role: 'owner', banned: true, createdAt: '2024-01-01' },
    { id: 'desk', name: 'News Edition Desk', role: 'admin', banned: null, createdAt: '2025-01-01' },
  ]
  assert.equal(pickAuthorId(rows, 'Amit Gautam'), 'owner')
  assert.equal(pickAuthorId(rows, 'news edition desk'), 'desk')
  assert.equal(pickAuthorId(rows, 'Rinki Gautam'), null)
  assert.equal(normalizeName('  Sanjay   Kumar '), 'sanjay kumar')
  // Same role: the oldest account wins.
  assert.equal(
    pickAuthorId([{ id: 'b', name: 'X', role: 'user', banned: false, createdAt: '2026-01-01' }, { id: 'a', name: 'X', role: 'user', banned: false, createdAt: '2025-01-01' }], 'x'),
    'a'
  )
})

test('stories are sorted into categories', () => {
  assert.equal(classifyStory({ title: 'Sensex jumps 400 points as RBI holds rates', publisherKeys: ['the-hindu'] }), 'business')
  assert.equal(classifyStory({ title: 'Bollywood actor announces new film, trailer out tomorrow' }), 'entertainment')
  assert.equal(classifyStory({ title: 'Gurugram residents face waterlogging after heavy rain' }), 'haryana-news')
  assert.equal(classifyStory({ title: 'Cabinet approves new pension scheme guidelines', summary: 'The ministry issued a notification.' }), 'governance')
  assert.equal(classifyStory({ title: 'Opposition walks out of Lok Sabha over election bill', publisherKeys: ['ndtv'] }), 'politics')
  assert.equal(classifyStory({ title: 'Russia and Ukraine hold talks in Istanbul', publisherKeys: ['bbc', 'al-jazeera'] }), 'world')
  assert.equal(classifyStory({ title: 'Heavy rain lashes the region' }), 'india')
  assert.equal(classifyStory({ title: 'Quiet day in the capital', publisherKeys: ['bbc'] }), 'world')
  // A foreign-only story that mentions the market is still world news.
  assert.equal(classifyStory({ title: 'Wall Street markets slide as investors fear tariffs', publisherKeys: ['bbc'] }), 'world')
})

test('rotation: never-published first, then oldest, ties in fixed order', () => {
  const order = rotationOrder({ india: 300, business: null, world: 100, politics: 100, entertainment: null })
  assert.deepEqual(order, ['business', 'entertainment', 'world', 'politics', 'india'])
  assert.deepEqual(rotationOrder({ india: 5, world: 1 }), ['world', 'india'])
  assert.deepEqual(rotationOrder({}), [])
})

test('a category that was only tried goes behind the ones that were not', () => {
  const published = { india: 100, business: null, world: 50, state: null }
  const tried = { state: 500, world: 20 }
  const last = lastActivity(published, tried)
  assert.deepEqual(last, { india: 100, business: null, world: 50, state: 500 })
  // business was never tried: first. Then world (50), india (100), and state (just tried) last.
  assert.deepEqual(rotationOrder(last), ['business', 'world', 'india', 'state'])
})

const HARYANA_STORY = { title: 'Gurugram residents protest as waterlogging returns', summary: 'The Haryana government has asked the district collector for a report.' }

test('categoryScores ranks every category with a keyword hit, best first', () => {
  const scores = categoryScores(HARYANA_STORY)
  assert.deepEqual(scores.map((x) => x.slug), ['haryana-news', 'state', 'governance'])
  assert.ok(scores.every((x) => x.score > 0))
  assert.deepEqual(categoryScores({ title: 'Quiet morning', summary: '' }), [])
})

test('alternativeCategories lists the other fitting categories, never the chosen one', () => {
  assert.equal(classifyStory(HARYANA_STORY), 'haryana-news')
  assert.deepEqual(alternativeCategories(HARYANA_STORY), ['state', 'governance'])
  assert.deepEqual(alternativeCategories(HARYANA_STORY, 1), ['state'])
  assert.deepEqual(alternativeCategories({ title: 'Quiet morning' }), [])
})
