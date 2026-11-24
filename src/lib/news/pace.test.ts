import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allowedSoFar, istDayStart, parseDailyCap, DEFAULT_DAILY_CAP } from './pace'

test('cap from the environment', () => {
  assert.equal(parseDailyCap(undefined), DEFAULT_DAILY_CAP)
  assert.equal(DEFAULT_DAILY_CAP, 20)
  assert.equal(parseDailyCap('15'), 15)
  assert.equal(parseDailyCap(' 30 '), 30)
  for (const bad of ['', '0', '-3', '49', '12.5', 'twenty']) assert.equal(parseDailyCap(bad), 20, bad)
})

test('IST day starts at 18:30 UTC the day before', () => {
  assert.equal(istDayStart(new Date('2026-11-25T00:15:00Z')).toISOString(), '2026-11-24T18:30:00.000Z')
  assert.equal(istDayStart(new Date('2026-11-24T18:29:00Z')).toISOString(), '2026-11-23T18:30:00.000Z')
  assert.equal(istDayStart(new Date('2026-11-24T18:30:00Z')).toISOString(), '2026-11-24T18:30:00.000Z')
})

test('the cap is spread over the day', () => {
  // 00:02 IST
  assert.equal(allowedSoFar(new Date('2026-11-24T18:32:00Z'), 20), 1)
  // 06:00 IST: a quarter of the day
  assert.equal(allowedSoFar(new Date('2026-11-25T00:30:00Z'), 20), 6)
  // 12:00 IST
  assert.equal(allowedSoFar(new Date('2026-11-25T06:30:00Z'), 20), 11)
  // 23:59 IST
  assert.equal(allowedSoFar(new Date('2026-11-25T18:29:00Z'), 20), 20)
  assert.equal(allowedSoFar(new Date('2026-11-25T18:29:00Z'), 40), 40)
})
