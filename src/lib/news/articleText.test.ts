import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countWords, extractArticle } from './articleText'

const para = (n: number) => `<p>${Array.from({ length: 30 }, (_, i) => `word${n}x${i}`).join(' ')}.</p>`
const PAGE = `<html><head>
<meta property="og:image" content="/img/cover.jpg"><meta property="og:description" content="Desc &amp; more">
<script type="application/ld+json">{"@type":"NewsArticle","headline":"x"}</script></head><body>
<nav><p>Home news sports business entertainment and many other links here for the site menu</p></nav>
<article>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(para).join('')}
<p>Also read: something else entirely that should be dropped as boilerplate text</p>
<p>See <a href="https://www.rbi.org.in/doc">the RBI statement</a> for details of the committee decision made on Friday.</p></article>
<aside><p>Subscribe to our newsletter for the latest news delivered to your inbox every morning please</p></aside>
</body></html>`

test('extracts article paragraphs, image, description and links', () => {
  const a = extractArticle(PAGE, 'https://www.thehindu.com/news/x.ece')
  assert.ok(a.wordCount >= 420)
  assert.equal(a.imageUrl, 'https://www.thehindu.com/img/cover.jpg')
  assert.equal(a.description, 'Desc & more')
  assert.ok(!a.text.includes('Also read'))
  assert.ok(!a.text.includes('Subscribe to our newsletter'))
  assert.ok(a.links.some((l) => l.url === 'https://www.rbi.org.in/doc'))
  assert.equal(a.paywalled, false)
})

test('uses JSON-LD articleBody when present', () => {
  const body = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} says something specific and useful about the story.`).join(' ')
  const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'NewsArticle', articleBody: body }] })}</script>`
  const a = extractArticle(html, 'https://www.bbc.com/news/1')
  assert.ok(a.wordCount > 300)
})

test('a short gated page is flagged as paywalled', () => {
  const html = `<article><p>${'Teaser sentence that goes on for a while to be long enough. '.repeat(3)}</p></article><div>Subscribe to continue reading this story</div>`
  const a = extractArticle(html, 'https://www.thehindu.com/x')
  assert.equal(a.paywalled, true)
  assert.ok(a.wordCount < 400)
})

test('countWords ignores markup', () => {
  assert.equal(countWords('<p>one two <b>three</b></p>'), 3)
  assert.equal(countWords(''), 0)
})
