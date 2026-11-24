import test from 'node:test'
import assert from 'node:assert/strict'
import {
  newsArticleJsonLd, organizationJsonLd, sourceCitations, wordCountOf,
  articleTitleText, articleTitleField, seoTitleLooksCut, categoryDescription,
} from './seo'

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

test('sourceCitations: HTML entities in a link name become plain characters', () => {
  const html = '<p><strong>Source:</strong> <a href="https://a.example/x">India &amp; Canada &#39;very close&#39; &quot;talks&quot; &#x2019;s</a></p>'
  assert.equal(sourceCitations(html)[0].name, 'India & Canada \'very close\' "talks" \u2019s')
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

// Live cases of 24 Nov 2026: the pipeline trims SEO titles to 60 characters at a word, leaving titles that end mid-phrase.
test('seoTitleLooksCut: dangling last word, ellipsis, or a word the headline continues after', () => {
  assert.equal(seoTitleLooksCut('Vietnam hot pot blast leaves six dead, dozens injured in', 'Vietnam hot pot blast leaves six dead, dozens injured in Hanoi'), true)
  assert.equal(seoTitleLooksCut('Vaibhav Sooryavanshi record: fastest List A century and', 'Vaibhav Sooryavanshi sets fastest List A century and double century'), true)
  assert.equal(seoTitleLooksCut('Anthropic shares slip under $83 IPO price after historic', 'Anthropic shares slip under $83 IPO price just days after historic debut'), true)
  assert.equal(seoTitleLooksCut('Mahindra to provide discounts for replacement of old…', 'Mahindra to provide discounts for replacement of old trucks, buses'), true)
})

test('seoTitleLooksCut: complete SEO titles are kept', () => {
  assert.equal(seoTitleLooksCut('GSK launches Blenrep multiple myeloma therapy in India', 'GSK launches Blenrep, first BCMA-targeted therapy for relapsed multiple myeloma in India'), false)
  assert.equal(seoTitleLooksCut('Haryana CM Saini calls for stronger local governance', 'Haryana CM Saini urges stronger local governance for better services'), false)
  assert.equal(seoTitleLooksCut('Microsoft CEO on Human Control in AI Development', 'Microsoft CEO Highlights Importance of Human Oversight in Superintelligence'), false)
  assert.equal(seoTitleLooksCut("China's consumer spending push stumbles; know why?", "China's consumer spending push stumbles; know why?"), false)
  assert.equal(seoTitleLooksCut('', 'Anything'), false)
})

test('articleTitleText: a cut SEO title falls back to the full headline (up to 75 characters)', () => {
  assert.equal(
    articleTitleText('Vietnam hot pot blast leaves six dead, dozens injured in', 'Vietnam hot pot blast leaves six dead, dozens injured in Hanoi'),
    'Vietnam hot pot blast leaves six dead, dozens injured in Hanoi',
  )
  assert.equal(
    articleTitleText('Anthropic shares slip under $83 IPO price after historic', 'Anthropic shares slip under $83 IPO price just days after historic debut'),
    'Anthropic shares slip under $83 IPO price just days after historic debut',
  )
  assert.equal(
    articleTitleText('GSK launches Blenrep multiple myeloma therapy in India', 'GSK launches Blenrep, first BCMA-targeted therapy for relapsed multiple myeloma in India'),
    'GSK launches Blenrep multiple myeloma therapy in India',
  )
  // No SEO title: the headline itself, whole when it fits.
  assert.equal(articleTitleText(null, 'Mahindra to provide discounts for replacement of old trucks, buses'), 'Mahindra to provide discounts for replacement of old trucks, buses')
})

test('articleTitleText: a long headline is shortened at a word, never ending on "to" / "and", with an ellipsis', () => {
  const h = 'Tata Steel to Sell Tubes Business and Tata Steel Colors to APL Apollo for ₹28,000 Crore in a big deal'
  const t = articleTitleText('Tata Steel to Sell Tubes Business and Tata Steel Colors to', h)
  assert.ok(t.length <= 75, t)
  assert.ok(t.endsWith('…'), t)
  assert.doesNotMatch(t, /\s(to|and|for|in|of)…$/i)
  assert.ok(h.startsWith(t.slice(0, -1)), t)
})

test('articleTitleField: short titles keep the layout suffix, longer ones are absolute', () => {
  assert.equal(articleTitleField('Short headline here'), 'Short headline here')
  assert.deepEqual(articleTitleField('Vietnam hot pot blast leaves six dead, dozens injured in Hanoi'), { absolute: 'Vietnam hot pot blast leaves six dead, dozens injured in Hanoi' })
})

test('categoryDescription: no "News news" for a category whose name ends in News', () => {
  assert.equal(categoryDescription('Haryana News'), 'Latest Haryana News today: top stories, updates and analysis from NewsEdition.')
  assert.equal(categoryDescription('India'), 'Latest India news today: top stories, updates and analysis from NewsEdition.')
  assert.equal(categoryDescription('India', 'Own text.'), 'Own text.')
})
