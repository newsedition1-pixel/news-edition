import test from 'node:test'
import assert from 'node:assert/strict'
import { X_DAILY_CAP_DEFAULT, X_LINK_DAILY_CAP, X_QUIET_GAP_MS, planX, xDailyCap, xDay, xModeOf, type XDay, type XPlanInput } from './xplan'
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

test('single-source stories wait for a quiet stretch on X, unless the feed rules made them top', () => {
  const recent = { ...none, posts: 2, lastAt: new Date(EVENING.getTime() - 60 * 60 * 1000) } // 60 min ago: not quiet yet
  assert.match(planX(input({ top: false, strength: 1, today: recent })).reason, /single-source/)
  assert.equal(planX(input({ top: true, strength: 1, today: recent })).format, 'post')
})

test('a quiet stretch lets a single-source story go out so the account is not silent', () => {
  const quiet = { ...none, posts: 2, lastAt: new Date(EVENING.getTime() - X_QUIET_GAP_MS - 60 * 1000) }
  const p = planX(input({ top: false, strength: 1, today: quiet }))
  assert.deepEqual({ format: p.format, link: p.link, image: p.image }, { format: 'post', link: false, image: true })
  assert.match(p.reason, /quiet stretch/)
  // the first story of the day (no X post yet) counts as a quiet stretch too
  assert.equal(planX(input({ top: false, strength: 1 })).format, 'post')
  // spacing, the 40 minute gap and the daily limit still hold
  const tooSoon = { ...none, posts: 2, lastAt: new Date(EVENING.getTime() - 10 * 60 * 1000) }
  assert.equal(planX(input({ top: false, strength: 1, today: tooSoon })).format, 'skip')
  assert.equal(planX(input({ top: false, strength: 1, today: { ...quiet, posts: 10 } })).format, 'skip')
})

test('22 Nov 2026 morning: a night post does not use up the first slot of the day, single-source stories go out when quiet', () => {
  // A tweet at 00:03 IST (legacy mode) is inside the day's count but outside the window.
  const log = [entry('2026-11-21T18:33:00Z', { id: 1 })]
  const at = (t: string) => new Date(t)
  const day = (now: Date) => xDay(log, now)
  assert.equal(day(at('2026-11-22T02:02:00Z')).posts, 1)
  assert.equal(day(at('2026-11-22T02:02:00Z')).postsInWindow, 0)
  const p = planX(input({ now: at('2026-11-22T02:02:00Z'), today: day(at('2026-11-22T02:02:00Z')), top: false, strength: 1 }))
  assert.equal(p.format, 'post') // 07:32 IST, last X post 7 hours ago
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
