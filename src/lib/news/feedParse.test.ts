import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeEntities, parseFeed, parseTrendTerms, stripTags } from './feedParse'

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item>
  <title><![CDATA[RBI keeps repo rate unchanged at 6.5% &amp; flags food prices]]></title>
  <link>https://www.thehindu.com/business/rbi-repo/article1.ece</link>
  <description><![CDATA[<p>The Reserve Bank held rates.</p><img src="x.jpg">]]></description>
  <pubDate>Fri, 20 Nov 2026 09:30:00 +0530</pubDate>
</item>
<item>
  <title>No link item</title>
</item>
<item>
  <title>Bad date item &#8211; still parsed</title>
  <link>https://indianexpress.com/article/india/x-1/</link>
  <pubDate>not a date</pubDate>
</item>
</channel></rss>`

test('parseFeed reads RSS items, decodes entities and strips markup', () => {
  const items = parseFeed(RSS)
  assert.equal(items.length, 2)
  assert.equal(items[0].title, 'RBI keeps repo rate unchanged at 6.5% & flags food prices')
  assert.equal(items[0].summary, 'The Reserve Bank held rates.')
  assert.equal(items[0].publishedAt, '2026-11-20T04:00:00.000Z')
  assert.equal(items[1].title, 'Bad date item – still parsed')
  assert.equal(items[1].publishedAt, null)
})

test('parseFeed reads Atom entries', () => {
  const atom = `<feed><entry><title>Atom story headline</title><link rel="alternate" href="https://www.bbc.com/news/world-1"/><updated>2026-11-20T01:00:00Z</updated><summary>Short</summary></entry></feed>`
  const items = parseFeed(atom)
  assert.equal(items.length, 1)
  assert.equal(items[0].link, 'https://www.bbc.com/news/world-1')
  assert.equal(items[0].publishedAt, '2026-11-20T01:00:00.000Z')
})

test('decodeEntities handles numeric, hex and unknown entities', () => {
  assert.equal(decodeEntities('&#8217;&#x2019;&bogus;'), '’’&bogus;')
  assert.equal(decodeEntities('&#99999999999;'), '&#99999999999;')
})

test('stripTags drops scripts and collapses whitespace', () => {
  assert.equal(stripTags('<p>Hello <script>alert(1)</script><b>world</b></p>'), 'Hello world')
})

test('parseTrendTerms returns the item titles', () => {
  const xml = `<rss><channel><item><title>ind vs aus</title><link>https://trends.google.com/x</link></item></channel></rss>`
  assert.deepEqual(parseTrendTerms(xml), ['ind vs aus'])
})
