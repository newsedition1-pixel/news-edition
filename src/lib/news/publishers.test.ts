import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPrimarySourceUrl, isTrustedUrl, publisherForUrl } from './publishers'

test('trusted publishers match their host and subdomains only', () => {
  assert.equal(publisherForUrl('https://www.thehindu.com/news/national/x.ece')?.key, 'the-hindu')
  assert.equal(publisherForUrl('https://timesofindia.indiatimes.com/india/x/articleshow/1.cms')?.key, 'times-of-india')
  assert.equal(publisherForUrl('https://feeds.bbci.co.uk/news/world/rss.xml'), null)
  assert.equal(publisherForUrl('https://www.bbc.co.uk/news/articles/c1')?.key, 'bbc')
})

test('look-alike and non-http URLs are rejected', () => {
  assert.equal(isTrustedUrl('https://thehindu.com.evil.example/x'), false)
  assert.equal(isTrustedUrl('https://evilthehindu.com/x'), false)
  assert.equal(isTrustedUrl('https://news.google.com/rss/articles/abc'), false)
  assert.equal(isTrustedUrl('javascript:alert(1)'), false)
  assert.equal(isTrustedUrl('ftp://www.thehindu.com/x'), false)
  assert.equal(isTrustedUrl(null), false)
  assert.equal(isTrustedUrl('not a url'), false)
})

test('official document hosts are recognised', () => {
  assert.equal(isPrimarySourceUrl('https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=1'), true)
  assert.equal(isPrimarySourceUrl('https://pib.gov.in/PressReleasePage.aspx?PRID=1'), true)
  assert.equal(isPrimarySourceUrl('https://www.who.int/news/item/1'), true)
  assert.equal(isPrimarySourceUrl('https://example.com/gov.in'), false)
  assert.equal(isPrimarySourceUrl('https://notgov.in.example.com/'), false)
})
