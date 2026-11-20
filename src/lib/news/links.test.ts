import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assembleArticleHtml, furtherReadingBlock, insertInternalLinks, linkSourceMentions, primaryDocumentLinks, relatedArticlesBlock, type InternalCandidate } from './links'

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

test('publisher mentions link once to the publisher report', () => {
  const html = '<p>According to The Hindu, rates held. The Hindu also noted inflation.</p>'
  const out = linkSourceMentions(html, [{ name: 'The Hindu', url: 'https://www.thehindu.com/a.ece' }])
  assert.equal((out.match(/<a /g) || []).length, 1)
  assert.ok(out.includes('rel="noopener noreferrer">The Hindu</a>'))
})

test('unsafe URLs are never linked', () => {
  const html = '<p>According to The Hindu, rates held.</p>'
  assert.equal(linkSourceMentions(html, [{ name: 'The Hindu', url: 'javascript:alert(1)' }]), html)
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

test('assembled article ends with credit and the standard Source line, and counts links', () => {
  const body = '<p>According to The Hindu, the repo rate was held.</p><p>Borrowers watch the repo rate and the monsoon.</p>'
  const out = assembleArticleHtml({
    bodyHtml: body,
    internal: cands,
    primary: { name: 'The Hindu', url: 'https://www.thehindu.com/a.ece' },
    others: [{ name: 'Indian Express', url: 'https://indianexpress.com/b', title: 'Rate held' }],
    documents: [],
    imageCreditHtml: '<p><em>Cover image: test.</em></p>',
  })
  assert.ok(out.html.trimEnd().endsWith('</a></p>\n</div>'))
  assert.match(out.html, /<div class="article-sources">/)
  assert.match(out.html, /<p><strong>Source:<\/strong> <a href="https:\/\/www\.thehindu\.com\/a\.ece"/)
  assert.ok(out.html.indexOf('article-sources') > out.html.indexOf('Borrowers watch'))
  assert.ok(out.html.indexOf('Cover image') < out.html.indexOf('Source:'))
  assert.ok(out.internalLinks >= 1)
  assert.ok(out.externalLinks >= 3)
})
