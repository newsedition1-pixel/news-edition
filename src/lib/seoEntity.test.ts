import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanName, newsArticleJsonLd, DEFAULT_OG_IMAGE } from './seo'

test('cleanName: an all-capitals name becomes a normal name (live byline "GAURAV", 24 Nov 2026)', () => {
  assert.equal(cleanName('GAURAV'), 'Gaurav')
  assert.equal(cleanName('AMIT GAUTAM'), 'Amit Gautam')
  assert.equal(cleanName('NEWS EDITION DESK'), 'News Edition Desk')
})

test('cleanName: initials in an all-capitals name, mixed-case and lower-case names', () => {
  assert.equal(cleanName('MS DHONI'), 'MS Dhoni')
  assert.equal(cleanName('PK'), 'PK')
  assert.equal(cleanName('Amit Gautam'), 'Amit Gautam')
  assert.equal(cleanName('NewsEdition Desk'), 'NewsEdition Desk')
  assert.equal(cleanName('amit gautam'), 'Amit Gautam')
  assert.equal(cleanName(''), '')
  assert.equal(cleanName(null), '')
})

test('NewsArticle JSON-LD: the author name is clean while the @id keeps the URL slug of the raw name', () => {
  const ld = newsArticleJsonLd({ slug: 's', title: 'T', author: { id: 'abc', name: 'GAURAV' } })
  const a = (ld.author as Array<Record<string, unknown>>)[0]
  assert.equal(a.name, 'Gaurav')
  assert.equal(a['@id'], 'https://newsedition.in/author/abc/gaurav#person')
})

test('DEFAULT_OG_IMAGE: absolute URL of the sitewide 1200x630 share image', () => {
  assert.equal(DEFAULT_OG_IMAGE.url, 'https://newsedition.in/opengraph-image')
  assert.equal(DEFAULT_OG_IMAGE.width, 1200)
  assert.equal(DEFAULT_OG_IMAGE.height, 630)
})
