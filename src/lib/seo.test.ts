import test from 'node:test'
import assert from 'node:assert/strict'
import { newsArticleJsonLd, organizationJsonLd, sourceCitations, wordCountOf } from './seo'

const sources = `
<h2>Further reading</h2><ul>
<li><a href="https://www.thehindu.com/news/a?x=1&amp;y=2">The Hindu: court story</a></li>
<li><a href="https://newsedition.in/article/other">Our earlier story</a></li>
<li><a href="https://www.bbc.com/news/b">BBC: background</a></li>
</ul>
<p><em>Cover image: courtesy <a href="https://commons.wikimedia.org/wiki/File:X.jpg">Wikimedia Commons</a>.</em></p>
<p><strong>Source:</strong> <a href="https://www.thehindu.com/news/a?x=1&amp;y=2">The Hindu</a>, <a href="https://www.ndtv.com/c">NDTV</a></p>`

test('sourceCitations: further reading and the Source line, deduped, no own-site or image-credit links', () => {
  const out = sourceCitations(sources)
  assert.deepEqual(out.map((c) => c.url), [
    'https://www.thehindu.com/news/a?x=1&y=2',
    'https://www.bbc.com/news/b',
    'https://www.ndtv.com/c',
  ])
  assert.equal(out[0].name, 'The Hindu: court story')
})

test('sourceCitations: empty or link-less input gives an empty list; max is respected', () => {
  assert.deepEqual(sourceCitations(''), [])
  assert.deepEqual(sourceCitations(null), [])
  assert.deepEqual(sourceCitations('<p><strong>Source:</strong> The Hindu</p>'), [])
  assert.equal(sourceCitations(sources, 2).length, 2)
})

test('wordCountOf counts words and ignores tags', () => {
  assert.equal(wordCountOf('<p>One two</p><h2>three  four&nbsp;five</h2>'), 5)
  assert.equal(wordCountOf(''), 0)
  assert.equal(wordCountOf(null), 0)
})

test('NewsArticle JSON-LD: author @id matches the author page, wordCount and citation present', () => {
  const ld = newsArticleJsonLd({
    slug: 's', title: 'T', excerpt: 'E',
    publishedAt: new Date('2026-11-24T10:00:00Z'),
    author: { id: 'abc', name: 'GAURAV' },
    wordCount: 640,
    citations: [{ url: 'https://www.bbc.com/news/b', name: 'BBC' }],
  })
  assert.equal((ld.author as Array<Record<string, unknown>>)[0]['@id'], 'https://newsedition.in/author/abc/gaurav#person')
  assert.equal(ld.wordCount, 640)
  assert.deepEqual(ld.citation, [{ '@type': 'CreativeWork', name: 'BBC', url: 'https://www.bbc.com/news/b' }])
})

test('NewsArticle JSON-LD: no wordCount / citation keys when there is nothing to say', () => {
  const ld = newsArticleJsonLd({ slug: 's', title: 'T' })
  assert.equal('wordCount' in ld, false)
  assert.equal('citation' in ld, false)
})

test('Organization JSON-LD: policies and contact point point at real pages', () => {
  const org = organizationJsonLd()
  assert.equal(org.ethicsPolicy, 'https://newsedition.in/editorial-policy')
  assert.equal(org.correctionsPolicy, 'https://newsedition.in/corrections')
  assert.equal(org.contactPoint.url, 'https://newsedition.in/contact')
  assert.equal(org.areaServed.name, 'India')
})
