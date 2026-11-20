import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addFailed, FAILED_MAX, FAILED_TTL_MS, hasFailed, parseFailed } from './failed'

const NOW = 1_800_000_000_000

test('remembers failed stories for twelve hours, then forgets them', () => {
  const map = addFailed({}, ['https://a.example/1', 'https://b.example/1'], NOW)
  assert.equal(hasFailed(map, ['https://x.example', 'https://b.example/1']), true)
  assert.equal(hasFailed(map, ['https://c.example/1']), false)
  const stored = JSON.stringify(map)
  assert.equal(hasFailed(parseFailed(stored, NOW + FAILED_TTL_MS - 1), ['https://a.example/1']), true)
  assert.equal(hasFailed(parseFailed(stored, NOW + FAILED_TTL_MS + 1), ['https://a.example/1']), false)
})

test('tolerates junk and keeps the list bounded', () => {
  assert.deepEqual(parseFailed(null, NOW), {})
  assert.deepEqual(parseFailed('not json', NOW), {})
  assert.deepEqual(parseFailed('[1,2]', NOW), {})
  assert.deepEqual(parseFailed('{"u":"x","v":null}', NOW), {})
  let map = {}
  for (let i = 0; i < FAILED_MAX + 50; i++) map = addFailed(map, [`https://a.example/${i}`], NOW + i)
  assert.equal(Object.keys(map).length, FAILED_MAX)
  assert.equal(hasFailed(map, ['https://a.example/0']), false)
  assert.equal(hasFailed(map, [`https://a.example/${FAILED_MAX + 49}`]), true)
})
