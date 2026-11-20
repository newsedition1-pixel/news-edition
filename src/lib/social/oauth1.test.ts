import test from 'node:test'
import assert from 'node:assert/strict'
import { oauthHeader, percentEncode } from './oauth1'

test('percent-encoding follows RFC 3986', () => {
  assert.equal(percentEncode("Ladies + Gentlemen!*'()"), 'Ladies%20%2B%20Gentlemen%21%2A%27%28%29')
  assert.equal(percentEncode('a-b_c.d~e'), 'a-b_c.d~e')
})

// The worked example in X's documentation ("Creating a signature").
test('the signature matches the documented example', () => {
  const header = oauthHeader({
    method: 'POST',
    url: 'https://api.twitter.com/1.1/statuses/update.json',
    params: { include_entities: 'true', status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
    consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
    consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
    token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
    tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
    nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
    timestamp: '1318622958',
  })
  assert.ok(header.startsWith('OAuth '))
  assert.ok(header.includes('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"'))
})

test('a fresh nonce and timestamp are used when none are given', () => {
  const keys = { method: 'POST', url: 'https://api.x.com/2/tweets', consumerKey: 'k', consumerSecret: 's', token: 't', tokenSecret: 'ts' }
  assert.notEqual(oauthHeader(keys), oauthHeader(keys))
})
