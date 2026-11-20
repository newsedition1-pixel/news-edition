import test from 'node:test'
import assert from 'node:assert/strict'
import { splitSources, wrapSources } from './sourcesBlock'

const body = '<p>The court ruled on Friday.</p>\n<h2>What next</h2>\n<p>Both sides will respond.</p>'
const further = '<h2>Further reading</h2><ul><li><a href="https://a.example/x">A: story</a></li></ul>'
const credit = '<p><em>Cover image: courtesy <a href="https://a.example/x">A</a>.</em></p>'
const source = '<p><strong>Source:</strong> <a href="https://a.example/x">A</a></p>'

test('wrapSources joins the parts and skips empty ones', () => {
  assert.equal(wrapSources(['', '  ']), '')
  const out = wrapSources([further, '', credit, source])
  assert.ok(out.startsWith('<div class="article-sources">'))
  assert.ok(out.endsWith('</div>'))
  assert.ok(out.indexOf('Further reading') < out.indexOf('Cover image') && out.indexOf('Cover image') < out.indexOf('Source:'))
})

test('a marked block is lifted out of the body', () => {
  const html = `${body}\n<h2>Related reading on NewsEdition</h2><ul><li><a href="/article/x">X</a></li></ul>\n${wrapSources([further, credit, source])}`
  const { body: b, sources } = splitSources(html)
  assert.ok(b.includes('Related reading on NewsEdition'))
  assert.ok(!b.includes('Source:') && !b.includes('Cover image') && !b.includes('Further reading'))
  assert.ok(sources.includes('Source:') && sources.includes('Cover image') && sources.includes('Further reading'))
})

test('older articles: the tail pieces are lifted out, in their original order', () => {
  const { body: b, sources } = splitSources(`${body}\n${further}\n${credit}\n${source}`)
  assert.equal(b, body)
  assert.ok(sources.indexOf('Further reading') < sources.indexOf('Cover image') && sources.indexOf('Cover image') < sources.indexOf('Source:'))
})

test('older articles with only a Source line, or no credit', () => {
  assert.deepEqual(splitSources(`${body}\n${source}`), { body, sources: source })
  const r = splitSources(`${body}\n${further}\n${source}`)
  assert.equal(r.body, body)
  assert.ok(r.sources.includes('Further reading') && r.sources.includes('Source:'))
})

test('text that merely mentions a source is left alone', () => {
  const html = '<p>According to the report <strong>Source:</strong> inline in a longer paragraph.</p>\n<p>More text follows.</p>'
  assert.deepEqual(splitSources(html), { body: html, sources: '' })
  assert.deepEqual(splitSources(body), { body, sources: '' })
})
