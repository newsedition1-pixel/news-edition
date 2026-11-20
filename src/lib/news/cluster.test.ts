import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStories, filterByHint, isRewriteWorthy, looksLikeExplainer, matchTrend, titleSimilarity, type StoryItem } from './cluster'

const NOW = new Date('2026-11-20T12:00:00Z').getTime()
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString()

function item(title: string, publisherKey: string, hoursAgo: number, summary = 'A summary of the story.'): StoryItem {
  return { title, link: `https://${publisherKey}.example/${encodeURIComponent(title)}`, summary, publishedAt: iso(hoursAgo), publisherKey, publisherName: publisherKey.toUpperCase() }
}

test('same story from different publishers is one cluster; a different story is not', () => {
  const stories = buildStories([
    item('RBI keeps repo rate unchanged at 6.5 per cent', 'hindu', 2),
    item('RBI holds repo rate steady at 6.5 per cent, flags inflation', 'ie', 3),
    item('Heavy rain lashes Chennai, schools shut on Friday', 'ht', 1),
  ], { now: NOW })
  assert.equal(stories.length, 2)
  const rbi = stories.find((s) => s.lead.title.includes('RBI'))!
  assert.equal(rbi.publisherCount, 2)
})

test('the same publisher repeating a story does not count as confirmation', () => {
  const stories = buildStories([
    item('RBI keeps repo rate unchanged at 6.5 per cent', 'hindu', 2),
    item('RBI keeps repo rate unchanged at 6.5 per cent today', 'hindu', 1),
  ], { now: NOW })
  assert.equal(stories.length, 2)
  assert.ok(stories.every((s) => s.publisherCount === 1))
})

test('confirmed, fresh, trending stories rank first', () => {
  const stories = buildStories([
    item('Local civic body repairs road near market after complaints', 'hindu', 1),
    item('RBI keeps repo rate unchanged at 6.5 per cent', 'ie', 6),
    item('RBI holds repo rate steady at 6.5 per cent, flags inflation', 'ht', 7),
    item('Reserve Bank repo rate decision: RBI keeps 6.5 per cent', 'ndtv', 8),
  ], { now: NOW, trendTerms: ['rbi repo rate'] })
  assert.match(stories[0].lead.title, /RBI|Reserve/)
  assert.equal(stories[0].publisherCount, 3)
  assert.equal(stories[0].trendMatch, 'rbi repo rate')
})

test('old stories and live blogs are dropped', () => {
  const stories = buildStories([
    item('Cricket live updates: India vs Australia first Test day one', 'hindu', 1),
    item('A very old story about a long finished event in the past', 'ie', 90),
  ], { now: NOW })
  assert.equal(stories.length, 0)
  assert.equal(isRewriteWorthy({ title: 'Short' }), false)
})

test('explainer headlines get a boost flag', () => {
  assert.equal(looksLikeExplainer('Explained: what the new RBI rule means for borrowers'), true)
  assert.equal(looksLikeExplainer('Minister inaugurates bridge'), false)
})

test('matchTrend needs all words of a multi-word term, ignores weak single words', () => {
  assert.equal(matchTrend(['RBI keeps repo rate steady'], ['repo rate', 'weather']), 'repo rate')
  assert.equal(matchTrend(['Weather turns cold in Delhi'], ['weather']), null)
  assert.equal(matchTrend(['Shreyas Iyer named captain'], ['shreyas iyer']), 'shreyas iyer')
})

test('titleSimilarity is high for rewordings and low for unrelated headlines', () => {
  assert.ok(titleSimilarity('RBI keeps repo rate unchanged at 6.5 per cent', 'RBI holds repo rate steady at 6.5 per cent') >= 0.55)
  assert.ok(titleSimilarity('RBI keeps repo rate unchanged', 'Chennai rain: schools shut') < 0.2)
})

test('filterByHint requires every hint word', () => {
  const stories = buildStories([
    item('RBI keeps repo rate unchanged at 6.5 per cent', 'hindu', 2),
    item('Haryana cabinet approves new housing policy for urban areas', 'ie', 2),
  ], { now: NOW })
  assert.equal(filterByHint(stories, 'haryana housing').length, 1)
  assert.equal(filterByHint(stories, 'haryana rbi').length, 0)
  assert.equal(filterByHint(stories, '').length, 2)
})
