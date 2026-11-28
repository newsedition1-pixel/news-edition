import test from 'node:test'
import assert from 'node:assert/strict'
import type { Story, StoryItem } from './cluster'
import { BREAKING_EXTRA_DEFAULT, breakingCandidates, isBreakingStory, parseBreakingExtra } from './breaking'

const NOW = Date.parse('2026-11-28T10:00:00Z')

function item(title: string, key: string, minutesAgo: number): StoryItem {
  return { title, link: `https://example.com/${key}/${title.length}`, summary: '', publishedAt: new Date(NOW - minutesAgo * 60_000).toISOString(), publisherKey: key, publisherName: key }
}

function story(titles: string[], minutesAgo = 20, opts: Partial<Story> = {}): Story {
  const items = titles.map((t, i) => item(t, `p${i}`, minutesAgo + i))
  return {
    id: titles[0],
    lead: items[0],
    items,
    publishers: items.map((i) => ({ key: i.publisherKey, name: i.publisherName, url: i.link, title: i.title })),
    publisherCount: items.length,
    score: items.length * 3,
    trendMatch: null,
    isExplainer: false,
    newestAt: items[0].publishedAt,
    ...opts,
  }
}

test('a fresh story with 2+ publishers and an urgent headline is breaking', () => {
  assert.equal(isBreakingStory(story(['7 killed in blast at school in Afghanistan', 'Blast at Afghan school kills seven']), NOW), true)
})

test('one publisher, a calm headline, an explainer or an old story is not breaking', () => {
  assert.equal(isBreakingStory(story(['7 killed in blast at school in Afghanistan']), NOW), false)
  assert.equal(isBreakingStory(story(['RBI keeps repo rate unchanged', 'RBI holds rates steady']), NOW), false)
  assert.equal(isBreakingStory(story(['Why the blast in Kabul matters', 'Explained: the blast in Kabul'], 20, { isExplainer: true }), NOW), false)
  assert.equal(isBreakingStory(story(['Quake hits coast', 'Strong quake strikes coast'], 7 * 60), NOW), false)
  assert.equal(isBreakingStory(story(['Quake hits coast', 'Strong quake strikes coast'], 20, { newestAt: null }), NOW), false)
})

test('any publisher headline of the story may carry the urgent word', () => {
  assert.equal(isBreakingStory(story(['Kabul school incident: latest', 'Dozens dead after Kabul school blast']), NOW), true)
})

test('candidates: most widely carried first, then newest', () => {
  const two = story(['Quake hits coast', 'Strong quake strikes coast'], 10)
  const three = story(['Gunman opens fire at mall', 'Mall shooting leaves many hurt', 'Shooting at mall: police'], 90)
  const twoOlder = story(['Train derails near Lucknow', 'Lucknow train derailment'], 60)
  const calm = story(['Budget talks begin', 'Budget talks start'], 5)
  const out = breakingCandidates([twoOlder, calm, two, three], NOW)
  assert.deepEqual(out, [three, two, twoOlder])
})

test('minimum publishers can be raised', () => {
  const two = story(['Quake hits coast', 'Strong quake strikes coast'])
  assert.equal(breakingCandidates([two], NOW, 3).length, 0)
  assert.equal(breakingCandidates([two], NOW, 2).length, 1)
})

test('NEWS_BREAKING_EXTRA: 0..24, default 8', () => {
  assert.equal(parseBreakingExtra(undefined), BREAKING_EXTRA_DEFAULT)
  assert.equal(parseBreakingExtra(''), BREAKING_EXTRA_DEFAULT)
  assert.equal(parseBreakingExtra('0'), 0)
  assert.equal(parseBreakingExtra(' 12 '), 12)
  assert.equal(parseBreakingExtra('24'), 24)
  assert.equal(parseBreakingExtra('25'), BREAKING_EXTRA_DEFAULT)
  assert.equal(parseBreakingExtra('-1'), BREAKING_EXTRA_DEFAULT)
  assert.equal(parseBreakingExtra('many'), BREAKING_EXTRA_DEFAULT)
  assert.equal(parseBreakingExtra('3.5'), BREAKING_EXTRA_DEFAULT)
})

test('the alert watches a shorter window: a story older than 2 hours is no alert, the fast lane still takes it', () => {
  const old = story(['7 killed in blast at school in Afghanistan', 'Blast at Afghan school kills seven'], 3 * 60)
  assert.equal(isBreakingStory(old, NOW), true)
  assert.equal(isBreakingStory(old, NOW, 2, 2), false)
  const fresh = story(['7 killed in blast at school in Afghanistan', 'Blast at Afghan school kills seven'], 30)
  assert.equal(isBreakingStory(fresh, NOW, 2, 2), true)
  assert.deepEqual(breakingCandidates([old, fresh], NOW, 2, 2), [fresh])
  assert.deepEqual(breakingCandidates([old, fresh], NOW, 2).length, 2)
})
