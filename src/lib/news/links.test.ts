import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assembleArticleHtml, furtherReadingBlock, insertInternalLinks, primaryDocumentLinks, relatedArticlesBlock, type InternalCandidate } from './links'

const cands: InternalCandidate[] = [
  { title: 'How repo rate changes move your EMI', slug: 'repo-rate-emi', tags: ['repo rate', 'home loan emi'] },
  { title: 'Monsoon outlook for 2026', slug: 'monsoon-outlook', tags: ['monsoon', 'rainfall forecast'] },
]

test('internal links go on the first natural mention, never in the opening paragraph', () => {
  const html = '<p>The repo rate was held on Friday.</p><p>Borrowers watch the repo rate closely, and the rainfall forecast matters too.</p><h2>Repo rate</h2>'
  const { html: out, linked } = insertInternalLinks(html, cands, 3)
  assert.equal((out.match(/<a /g) || []).length, 1) // one link per paragraph
  assert.ok(out.startsWith('<p>The repo rate was held'))
  assert.ok(out.includes('<a href="/article/repo-rate-emi">repo rate</a>'))
  assert.equal(linked.length, 1)
  assert.ok(out.includes('<h2>Repo rate</h2>'))
})

test('existing anchors are not nested or altered', () => {
  const html = '<p>Intro.</p><p>See <a href="https://x.example">the repo rate note</a> for more.</p>'
  assert.equal(insertInternalLinks(html, cands, 3).html, html)
})

test('related and further-reading blocks escape text and skip empty input', () => {
  assert.equal(relatedArticlesBlock([]), '')
  assert.ok(relatedArticlesBlock([{ title: 'A <b>bold</b> claim', slug: 'a-claim', tags: null }]).includes('A &lt;b&gt;bold&lt;/b&gt; claim'))
  assert.equal(furtherReadingBlock([], []), '')
  const block = furtherReadingBlock([{ name: 'Indian Express', url: 'https://indianexpress.com/a', title: 'Rates held' }], [{ label: 'RBI statement', url: 'https://www.rbi.org.in/x' }])
  assert.ok(block.includes('Indian Express: Rates held'))
  assert.ok(block.includes('RBI statement'))
})

test('only official document links are picked from a report', () => {
  const docs = primaryDocumentLinks([
    { url: 'https://www.rbi.org.in/Scripts/x', text: 'Monetary policy statement' },
    { url: 'https://twitter.com/rbi', text: 'tweet' },
    { url: 'https://www.rbi.org.in/Scripts/x', text: 'dup' },
    { url: 'https://pib.gov.in/y', text: '' },
  ])
  assert.equal(docs.length, 2)
  assert.ok(docs[0].label.includes('rbi.org.in'))
})

test('assembled article ends with the official documents and the image credit, and has no Source line (28 Nov 2026)', () => {
  const body = '<p>The regulator held the repo rate.</p><p>Borrowers watch the repo rate and the monsoon.</p>'
  const out = assembleArticleHtml({
    bodyHtml: body,
    internal: cands,
    primary: { name: 'The Hindu', url: 'https://www.thehindu.com/a.ece' },
    others: [{ name: 'Indian Express', url: 'https://indianexpress.com/b', title: 'Rate held' }],
    documents: [{ label: 'RBI statement (rbi.org.in)', url: 'https://www.rbi.org.in/x' }],
    imageCreditHtml: '<p><em>Cover image: test.</em></p>',
  })
  assert.ok(out.html.trimEnd().endsWith('</em></p>\n</div>'))
  assert.match(out.html, /<div class="article-sources">/)
  assert.ok(out.html.indexOf('article-sources') > out.html.indexOf('Borrowers watch'))
  assert.ok(out.html.indexOf('RBI statement') < out.html.indexOf('Cover image'))
  assert.doesNotMatch(out.html, /Source:/)
  assert.doesNotMatch(out.html, /thehindu|indianexpress|The Hindu|Indian Express/)
  assert.ok(out.internalLinks >= 1)
  assert.equal(out.externalLinks, 1) // the official document only
})

test('an article with no document and no image credit has no sources block at all', () => {
  const out = assembleArticleHtml({
    bodyHtml: '<p>The regulator held the repo rate.</p>',
    internal: [],
    primary: { name: 'The Hindu', url: 'https://www.thehindu.com/a.ece' },
    others: [{ name: 'Indian Express', url: 'https://indianexpress.com/b', title: 'Rate held' }],
    documents: [],
  })
  assert.doesNotMatch(out.html, /article-sources/)
  assert.doesNotMatch(out.html, /<a /)
})
