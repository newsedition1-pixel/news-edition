import test from 'node:test'
import assert from 'node:assert/strict'
import { addEntry, alreadyShared, chosenToday, lastChosenAt, parseLog, scrub, type ShareEntry } from './log'

const entry = (id: number, at: string, over: Partial<ShareEntry> = {}): ShareEntry => ({ id, title: `Story ${id}`, at, dry: false, top: false, reason: '', results: {}, ...over })

test('a damaged log reads as empty', () => {
  assert.deepEqual(parseLog(null), [])
  assert.deepEqual(parseLog('not json'), [])
  assert.deepEqual(parseLog('{"a":1}'), [])
  assert.equal(parseLog(JSON.stringify([entry(1, '2026-11-20T10:00:00Z'), { nope: true }])).length, 1)
})

test('newest first, capped, one live entry per article', () => {
  let log: ShareEntry[] = []
  for (let i = 1; i <= 5; i++) log = addEntry(log, entry(i, `2026-11-20T0${i}:00:00Z`), 3)
  assert.deepEqual(log.map((e) => e.id), [5, 4, 3])
  log = addEntry(log, entry(4, '2026-11-20T09:00:00Z'), 3)
  assert.deepEqual(log.map((e) => e.id), [4, 5, 3])
})

test('only a real send counts as shared', () => {
  const log = [entry(1, '2026-11-20T10:00:00Z', { dry: true }), entry(2, '2026-11-20T10:00:00Z')]
  assert.equal(alreadyShared(log, 1), false)
  assert.equal(alreadyShared(log, 2), true)
})

test('top stories are counted per Indian day, previews excluded', () => {
  const log = [
    entry(1, '2026-11-20T03:00:00Z', { top: true }), // 08:30 IST 20th
    entry(2, '2026-11-20T17:00:00Z', { top: true }), // 22:30 IST 20th
    entry(3, '2026-11-20T19:00:00Z', { top: true }), // 00:30 IST 21st
    entry(4, '2026-11-20T04:00:00Z', { top: true, dry: true }),
    entry(5, '2026-11-20T05:00:00Z', { top: false }),
  ]
  assert.equal(chosenToday(log, new Date('2026-11-20T10:00:00Z')), 2)
  assert.equal(chosenToday(log, new Date('2026-11-21T10:00:00Z')), 1)
  assert.equal(lastChosenAt(log)?.toISOString(), '2026-11-20T19:00:00.000Z')
  assert.equal(lastChosenAt([]), null)
})

test('secrets never reach the stored text', () => {
  const text = 'bad token SECRET-VALUE-123 at https://api.telegram.org/bot123456:ABC-def_ghi/sendPhoto and ?access_token=EAAB123&x=1'
  const out = scrub(text, ['SECRET-VALUE-123'])
  assert.ok(!out.includes('SECRET-VALUE-123'))
  assert.ok(!out.includes('ABC-def_ghi'))
  assert.ok(!out.includes('EAAB123'))
})
