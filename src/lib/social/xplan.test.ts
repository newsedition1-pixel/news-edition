import test from 'node:test'
import assert from 'node:assert/strict'
import { X_BREAKING_MIN_PUBLISHERS_DEFAULT, X_DAILY_CAP_DEFAULT, X_LINK_DAILY_CAP, X_MIN_GAP_MS, X_QUIET_GAP_MS, planBreaking, planX, xBreakingMinPublishers, xBreakingVerdict, xDailyCap, xDay, xModeOf, type BreakingPlanInput, type XDay, type XPlanInput } from './xplan'
import { isUrgentHeadline } from '../news/placement'
import type { ShareEntry } from './log'

/** 18:00 IST on 22 Nov 2026. */
const EVENING = new Date('2026-11-22T12:30:00Z')
const none: XDay = { posts: 0, links: 0, polls: 0, videos: 0, lastAt: null }

function input(over: Partial<XPlanInput> = {}): XPlanInput {
  return { now: EVENING, today: none, top: true, strength: 3, linkMode: 'top', dailyCap: X_DAILY_CAP_DEFAULT, hasImage: true, aiCover: false, pollSafe: false, ...over }
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

test('20 posts a day, at least 25 minutes apart', () => {
  assert.equal(X_DAILY_CAP_DEFAULT, 20)
  assert.equal(X_MIN_GAP_MS, 25 * 60 * 1000)
  assert.equal(X_QUIET_GAP_MS, X_MIN_GAP_MS) // every story is eligible: only spacing and the daily budget set the pace
})

test('an ordinary single-source story goes out once the gap since the last X post has passed', () => {
  const after = (min: number) => ({ ...none, posts: 2, lastAt: new Date(EVENING.getTime() - min * 60 * 1000) })
  const p = planX(input({ top: false, strength: 1, today: after(30) })) // the next scheduled article, 30 min later
  assert.deepEqual({ format: p.format, link: p.link, image: p.image }, { format: 'post', link: false, image: true })
  assert.match(p.reason, /one publisher/)
  assert.equal(planX(input({ top: false, strength: 1 })).format, 'post') // the first story of the day
  // spacing and the daily limit still hold
  assert.match(planX(input({ top: false, strength: 1, today: after(10) })).reason, /too soon/)
  assert.equal(planX(input({ top: false, strength: 1, today: { ...after(30), posts: X_DAILY_CAP_DEFAULT } })).format, 'skip')
})

test('the few paid links go to confirmed stories, not to every story the feed rules now accept', () => {
  assert.equal(planX(input({ top: true, strength: 1 })).link, false)
  assert.equal(planX(input({ top: true, strength: 2 })).link, true)
  assert.equal(planX(input({ top: true, strength: undefined })).link, true) // an editor's own article
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
  assert.equal(planX(input({ today: { ...none, posts: X_DAILY_CAP_DEFAULT } })).format, 'skip')
  assert.equal(planX(input({ today: { ...none, posts: X_DAILY_CAP_DEFAULT }, strength: undefined })).format, 'skip')
})

test('posts are spread over the day and kept apart', () => {
  const morning = new Date('2026-11-22T02:30:00Z') // 08:00 IST: two posts allowed so far
  assert.equal(planX(input({ now: morning, today: { ...none, posts: 1 } })).format, 'post')
  assert.equal(planX(input({ now: morning, today: { ...none, posts: 2 } })).format, 'skip')
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
  assert.equal(xModeOf(' Growth '), 'growth')
})

test('27 Nov 2026: breaking news only is the default mode, growth and legacy stay behind X_MODE', () => {
  assert.equal(xModeOf(undefined), 'breaking')
  assert.equal(xModeOf(''), 'breaking')
  assert.equal(xModeOf('breaking'), 'breaking')
  assert.equal(xModeOf('anything else'), 'breaking')
  assert.equal(xModeOf('growth'), 'growth')
  assert.equal(xModeOf('LEGACY'), 'legacy')
})

function breakingInput(over: Partial<BreakingPlanInput> = {}): BreakingPlanInput {
  return { breaking: true, today: none, linkMode: 'top', dailyCap: X_DAILY_CAP_DEFAULT, hasImage: true, aiCover: false, ...over }
}

test('breaking mode: an article without the breaking flag is never posted', () => {
  const p = planBreaking(breakingInput({ breaking: false }))
  assert.equal(p.format, 'skip')
  assert.match(p.reason, /breaking news only/)
  // a perfectly good ordinary story is still skipped, whatever the day looks like
  assert.equal(planBreaking(breakingInput({ breaking: false, today: { ...none, posts: 0 } })).format, 'skip')
})

test('breaking mode: a breaking article goes out at once, with the link and its photo', () => {
  const p = planBreaking(breakingInput())
  assert.deepEqual({ format: p.format, link: p.link, image: p.image, reason: p.reason }, { format: 'post', link: true, image: true, reason: 'breaking news' })
})

test('breaking mode: no waiting for the 07:00-23:00 window, the spacing or the poll slot', () => {
  // the planner has no clock input at all: the same plan at 03:00 IST and a post made a minute ago
  const justNow = { ...none, posts: 1, postsInWindow: 1, lastAt: new Date(EVENING.getTime() - 60_000) }
  assert.equal(planBreaking(breakingInput({ today: justNow })).format, 'post')
  assert.notEqual(planBreaking(breakingInput()).format, 'poll')
})

test('breaking mode: the link follows the link mode and the link budget, a labelled AI illustration is not attached', () => {
  assert.equal(planBreaking(breakingInput({ linkMode: 'never' })).link, false)
  assert.equal(planBreaking(breakingInput({ linkMode: 'always' })).link, true)
  assert.equal(planBreaking(breakingInput({ today: { ...none, links: X_LINK_DAILY_CAP } })).link, false)
  assert.equal(planBreaking(breakingInput({ aiCover: true })).image, false)
  assert.equal(planBreaking(breakingInput({ hasImage: false })).image, false)
})

test('breaking mode: the daily limit still holds as a guard', () => {
  const full = { ...none, posts: 3 }
  assert.equal(planBreaking(breakingInput({ today: full, dailyCap: 3 })).format, 'skip')
  assert.equal(planBreaking(breakingInput({ today: full, dailyCap: 4 })).format, 'post')
})

test('27 Nov 2026: X needs 2 publishers and an urgent headline, the site flag needs 3', () => {
  const min = X_BREAKING_MIN_PUBLISHERS_DEFAULT
  assert.equal(min, 2)
  const urgent = isUrgentHeadline('Six killed as bus falls into gorge in Himachal')
  assert.equal(urgent, true)
  // two publishers + urgent headline, no site flag: tweeted, and the log line says why
  const two = xBreakingVerdict({ flagged: false, publishers: 2, urgent, minPublishers: min })
  assert.equal(two.breaking, true)
  assert.match(two.reason, /2 publishers/)
  // one publisher, or a calm headline, is not breaking
  assert.equal(xBreakingVerdict({ flagged: false, publishers: 1, urgent, minPublishers: min }).breaking, false)
  assert.equal(xBreakingVerdict({ flagged: false, publishers: 4, urgent: false, minPublishers: min }).breaking, false)
  // the site flag always counts, with or without a publisher count (an editor's tick has none)
  assert.equal(xBreakingVerdict({ flagged: true, publishers: undefined, urgent: false, minPublishers: min }).breaking, true)
  assert.equal(xBreakingVerdict({ flagged: true, publishers: 1, urgent: false, minPublishers: min }).reason, 'breaking news')
  // an article an editor published by hand carries no publisher count: only the flag counts
  assert.equal(xBreakingVerdict({ flagged: false, publishers: undefined, urgent, minPublishers: min }).breaking, false)
})

test('X_BREAKING_MIN_PUBLISHERS: default 2, never below 2, capped at 10; 3 gives back the strict rule', () => {
  assert.equal(xBreakingMinPublishers(undefined), 2)
  assert.equal(xBreakingMinPublishers(''), 2)
  assert.equal(xBreakingMinPublishers('1'), 2)
  assert.equal(xBreakingMinPublishers('abc'), 2)
  assert.equal(xBreakingMinPublishers('3'), 3)
  assert.equal(xBreakingMinPublishers('99'), 10)
  // with 3, a two-publisher urgent story is no longer breaking for X
  assert.equal(xBreakingVerdict({ flagged: false, publishers: 2, urgent: true, minPublishers: xBreakingMinPublishers('3') }).breaking, false)
})

test('breaking mode: the reason of the verdict reaches the plan', () => {
  const v = xBreakingVerdict({ flagged: false, publishers: 3, urgent: true, minPublishers: 2 })
  assert.equal(planBreaking(breakingInput({ breaking: v.breaking, breakingReason: v.reason })).reason, 'breaking news: urgent story carried by 3 publishers')
  const no = xBreakingVerdict({ flagged: false, publishers: 1, urgent: true, minPublishers: 2 })
  assert.match(planBreaking(breakingInput({ breaking: no.breaking, breakingReason: no.reason })).reason, /breaking news only/)
})
