import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addAuditEntry, auditTotals, AUDIT_LOG_MAX, parseAuditLog, type AuditLogEntry } from './auditLog'

function entry(slug: string, decision: 'PUBLISH' | 'IMPROVE' | 'HOLD', score: number): AuditLogEntry {
  return {
    at: '2026-11-21T00:00:00.000Z', title: slug, slug, mode: 'enforce', attempts: 1, published: decision === 'PUBLISH', held: null,
    summary: { score, decision, aiStyle: 'Low', plagiarism: 'Low', discover: 'Ready', seo: 80, facts: 'ok', reasons: [], partial: [] },
  }
}

test('parseAuditLog tolerates empty, broken and foreign data', () => {
  assert.deepEqual(parseAuditLog(null), [])
  assert.deepEqual(parseAuditLog('nope'), [])
  assert.deepEqual(parseAuditLog('{"a":1}'), [])
  assert.deepEqual(parseAuditLog(JSON.stringify([{ at: 1 }, entry('a', 'PUBLISH', 90)])).map((e) => e.slug), ['a'])
})

test('addAuditEntry puts the newest first, keeps one entry per article and caps the log', () => {
  let log: AuditLogEntry[] = []
  log = addAuditEntry(log, entry('a', 'IMPROVE', 60))
  log = addAuditEntry(log, entry('b', 'PUBLISH', 90))
  log = addAuditEntry(log, entry('a', 'PUBLISH', 88))
  assert.deepEqual(log.map((e) => e.slug), ['a', 'b'])
  assert.equal(log[0].summary.score, 88)
  for (let i = 0; i < AUDIT_LOG_MAX + 5; i++) log = addAuditEntry(log, entry(`x${i}`, 'PUBLISH', 80))
  assert.equal(log.length, AUDIT_LOG_MAX)
})

test('auditTotals counts decisions and averages the score', () => {
  const t = auditTotals([entry('a', 'PUBLISH', 90), entry('b', 'IMPROVE', 60), entry('c', 'HOLD', 30), entry('d', 'PUBLISH', 80)])
  assert.deepEqual(t, { publish: 2, improve: 1, hold: 1, averageScore: 65 })
  assert.equal(auditTotals([]).averageScore, null)
})
