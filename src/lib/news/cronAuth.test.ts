import test from 'node:test'
import assert from 'node:assert/strict'
import { bearerToken, secretMatches } from './cronAuth'

const secret = 'a'.repeat(16) + 'b'.repeat(16)

test('bearer token is read from the header', () => {
  assert.equal(bearerToken('Bearer abc.def'), 'abc.def')
  assert.equal(bearerToken('bearer  abc '), 'abc')
  assert.equal(bearerToken('Basic abc'), '')
  assert.equal(bearerToken(null), '')
})

test('the secret must match exactly and be long enough', () => {
  assert.equal(secretMatches(secret, secret), true)
  assert.equal(secretMatches(secret + 'x', secret), false)
  assert.equal(secretMatches('', secret), false)
  assert.equal(secretMatches(secret, undefined), false)
  assert.equal(secretMatches('short', 'short'), false)
})
