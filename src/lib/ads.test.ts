import test from 'node:test'
import assert from 'node:assert/strict'
import { adsTxtBody, adsenseClient, adsenseScriptSrc, configuredPublisherId, normalisePublisherId } from './ads'

test('normalisePublisherId accepts pub- and ca-pub- forms and trims', () => {
  assert.equal(normalisePublisherId('pub-1234567890123456'), 'pub-1234567890123456')
  assert.equal(normalisePublisherId('ca-pub-1234567890123456'), 'pub-1234567890123456')
  assert.equal(normalisePublisherId('  "ca-pub-1234567890123456"  '), 'pub-1234567890123456')
  assert.equal(normalisePublisherId('CA-PUB-1234567890123456'), 'pub-1234567890123456')
})

test('normalisePublisherId rejects anything that is not 16 digits', () => {
  assert.equal(normalisePublisherId(undefined), null)
  assert.equal(normalisePublisherId(''), null)
  assert.equal(normalisePublisherId('pub-123'), null)
  assert.equal(normalisePublisherId('pub-12345678901234567'), null)
  assert.equal(normalisePublisherId('pub-123456789012345a'), null)
  assert.equal(normalisePublisherId('ca-app-pub-1234567890123456'), null)
  assert.equal(normalisePublisherId('pub-0000000000000000, DIRECT'), null)
})

test('ads.txt line has the exact AdSense format and ends with one newline', () => {
  const body = adsTxtBody('pub-1234567890123456')
  assert.equal(body, 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n')
  assert.ok(!body.includes('ca-'))
})

test('client and script URL use the ca- prefix', () => {
  assert.equal(adsenseClient('pub-1234567890123456'), 'ca-pub-1234567890123456')
  assert.equal(adsenseClient(null), null)
  assert.equal(
    adsenseScriptSrc('pub-1234567890123456'),
    'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456',
  )
})

test('configuredPublisherId reads ADSENSE_PUBLISHER_ID and ignores bad values', () => {
  assert.equal(configuredPublisherId({}), null)
  assert.equal(configuredPublisherId({ ADSENSE_PUBLISHER_ID: 'nope' }), null)
  assert.equal(configuredPublisherId({ ADSENSE_PUBLISHER_ID: 'ca-pub-1234567890123456' }), 'pub-1234567890123456')
})
