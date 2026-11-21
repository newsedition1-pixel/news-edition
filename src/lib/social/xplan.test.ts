import test from 'node:test'
import assert from 'node:assert/strict'
import { X_DAILY_CAP_DEFAULT, X_LINK_DAILY_CAP, planX, xDailyCap, xDay, xModeOf, type XDay, type XPlanInput } from './xplan'
import type { ShareEntry } from './log'

/** 18:00 IST on 22 Nov 2026. */
const EVENING = new Date('2026-11-22T12:30:00Z')
const none: XDay = { posts: 0, links: 0, polls: 0, videos: 0, lastAt: null }

function input(over: Partial<XPlanInput> = {}): XPlanInput {
  return { now: EVENING, today: none, top: true, strength: 3, linkMode: 'top', dailyCap: 10, hasImage: true, aiCover: false, pollSafe: false, ...over }
}

test('a confirmed top story is a post with its picture and the link', () => {
  const p = planX(input())
  assert.deepEqual({ format: p.format, link: p.link, image: p.image }, { format: 'post', link: true, image: true })
})

test('the link is kept for top stories, for the daily link budget, and off when the mode says never', () => {
  assert.equal(planX(input({ top: false, strength: 2 })).link, false)
  assert.equal(planX(input({ today: { ...none, links: X_LINK_DAILY_CAP } })).link, false)
  assert.equal(planX(input({ linkMode: 'never' })).link, false)
  assert.equal(planX(input({ top: false, strength: 2, linkMode: 'always' })).link, true)
})

test('an AI illustration or a missing cover goes out without a picture', () => {
  assert.equal(planX(input({ aiCover: true })).image, false)
  assert.equal(planX(input({ hasImage: false })).image, false)
})

test('single-source stories stay off X, unless the feed rules made them top after a quiet stretch', () => {
  assert.equal(planX(input({ top: false, strength: 1 })).format, 'skip')
  assert.equal(planX(input({ top: true, strength: 1 })).format, 'post')
})

test('nothing goes out at night, except an editor\'s own article', () => {
  const night = new Date('2026-11-21T21:30:00Z') // 03:00 IST
  assert.equal(planX(input({ now: night })).format, 'skip')
  assert.equal(planX(input({ now: night, strength: undefined })).format, 'post')
})

test('the daily limit holds for everyone', () => {
  assert.equal(planX(input({ today: { ...none, posts: 10 } })).format, 'skip')
  assert.equal(planX(input({ today: { ...none, posts: 10 }, strength: undefined })).format, 'skip')
})

test('posts are spread over the day and kept apart', () => {
  const morning = new Date('2026-11-22T02:30:00Z') // 08:00 IST: one post allowed so far
  assert.equal(planX(input({ now: morning, today: { ...none, posts: 1 } })).format, 'skip')
  const recent = { ...none, posts: 2, lastAt: new Date(EVENING.getTime() - 10 * 60 * 1000) }
  assert.match(planX(input({ today: recent })).reason, /too soon/)
  assert.equal(planX(input({ today: { ...recent, lastAt: new Date(EVENING.getTime() - 60 * 60 * 1000) } })).format, 'post')
})

test('one poll a day, in the evening, on a safe story, without link or picture', () => {
  const p = planX(input({ pollSafe: true }))
  assert.deepEqual({ format: p.format, link: p.link, image: p.image }, { format: 'poll', link: false, image: false })
  assert.equal(planX(input({ pollSafe: true, today: { ...none, polls: 1 } })).format, 'post')
  assert.equal(planX(input({ pollSafe: false })).format, 'post')
  const morning = new Date('2026-11-22T04:30:00Z') // 10:00 IST
  assert.equal(planX(input({ now: morning, pollSafe: true })).format, 'post')
  assert.equal(planX(input({ pollSafe: true, strength: undefined })).format, 'post')
})

function entry(at: string, over: Partial<ShareEntry> = {}): ShareEntry {
  return { id: 1, title: 't', at, dry: false, top: false, reason: '', results: { x: { ok: true, ref: '1' } }, ...over }
}

test('the day counts posts, links and polls of the Indian calendar day only', () => {
  const log = [
    entry('2026-11-22T12:00:00Z', { x: { format: 'post', link: true, image: true, reason: '' } }),
    entry('2026-11-22T06:00:00Z', { id: 2, x: { format: 'poll', link: false, image: false, reason: '' } }),
    entry('2026-11-22T03:00:00Z', { id: 3, results: { x: { ok: false, error: 'boom' } } }),
    entry('2026-11-21T10:00:00Z', { id: 4 }),
    entry('2026-11-22T11:00:00Z', { id: 5, dry: true, x: { format: 'post', link: false, image: true, reason: '' } }),
    entry('2026-11-22T10:00:00Z', { id: -6, x: { format: 'video', link: true, image: false, reason: '' } }),
  ]
  const d = xDay(log, EVENING)
  assert.equal(d.posts, 3)
  assert.equal(d.videos, 1)
  assert.equal(d.links, 2)
  assert.equal(d.polls, 1)
  assert.equal(d.lastAt?.toISOString(), '2026-11-22T12:00:00.000Z')
  assert.equal(xDay(log, EVENING, true).posts, 1)
})

test('settings from the environment', () => {
  assert.equal(xDailyCap(undefined), X_DAILY_CAP_DEFAULT)
  assert.equal(xDailyCap('6'), 6)
  assert.equal(xDailyCap('0'), X_DAILY_CAP_DEFAULT)
  assert.equal(xDailyCap('500'), 40)
  assert.equal(xModeOf('legacy'), 'legacy')
  assert.equal(xModeOf(undefined), 'growth')
})
