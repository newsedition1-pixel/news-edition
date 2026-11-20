import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedSoFar, feedDecision, FEED_DAILY_CAP, istDay, istHours } from './policy'

// IST = UTC + 5:30
const ist = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 20, h - 5, m - 30))

test('India time is read correctly', () => {
  assert.equal(istDay(new Date('2026-11-20T19:00:00Z')), '2026-11-21') // 00:30 IST next day
  assert.equal(istHours(ist(9, 30)), 9.5)
})

test('the daily cap is spread over the window', () => {
  assert.equal(allowedSoFar(ist(7)), 1)
  assert.equal(allowedSoFar(ist(11)), 3)
  assert.equal(allowedSoFar(ist(15)), 5)
  assert.equal(allowedSoFar(ist(22, 59)), FEED_DAILY_CAP)
})

const base = { chosenToday: 0, lastChosenAt: null, strength: 3 }

test('nothing goes to the feeds at night', () => {
  assert.equal(feedDecision({ ...base, now: ist(3) }).top, false)
  assert.equal(feedDecision({ ...base, now: ist(23, 10) }).top, false)
})

test('a story carried by several publishers is a top story', () => {
  const d = feedDecision({ ...base, now: ist(10) })
  assert.equal(d.top, true)
  assert.match(d.reason, /3 sources/)
})

test('an ordinary story waits for a quiet stretch', () => {
  const now = ist(12)
  assert.equal(feedDecision({ now, chosenToday: 1, lastChosenAt: ist(11, 30), strength: 1 }).top, false)
  assert.equal(feedDecision({ now, chosenToday: 1, lastChosenAt: ist(9, 30), strength: 1 }).top, true)
  assert.equal(feedDecision({ now, chosenToday: 0, lastChosenAt: null, strength: 1 }).top, true)
})

test('two top stories are never closer than 45 minutes', () => {
  assert.equal(feedDecision({ now: ist(12), chosenToday: 1, lastChosenAt: ist(11, 30), strength: 4 }).top, false)
  assert.equal(feedDecision({ now: ist(12), chosenToday: 1, lastChosenAt: ist(11, 0), strength: 4 }).top, true)
})

test('the day is paced: strong stories early do not use up the whole budget', () => {
  assert.equal(feedDecision({ now: ist(8), chosenToday: 1, lastChosenAt: ist(7, 0), strength: 4 }).top, false)
  assert.equal(feedDecision({ now: ist(8), chosenToday: 1, lastChosenAt: ist(7, 0), strength: 4 }).reason, 'spacing the day out')
})

test('the daily cap is a hard limit', () => {
  const d = feedDecision({ now: ist(22, 30), chosenToday: FEED_DAILY_CAP, lastChosenAt: ist(20), strength: 5 })
  assert.equal(d.top, false)
  assert.match(d.reason, /daily limit/)
})

test('an editor-published article is welcome whenever the day allows', () => {
  assert.equal(feedDecision({ now: ist(10), chosenToday: 0, lastChosenAt: ist(9, 50), strength: undefined }).top, true)
  assert.equal(feedDecision({ now: ist(10), chosenToday: FEED_DAILY_CAP, lastChosenAt: null, strength: undefined }).top, false)
})
