import test from 'node:test'
import assert from 'node:assert/strict'
import { coverOf, isSlug, REEL_PHOTO, reelPhotoUrl } from './asset'

const PUBLISHER =
  '<p>Body</p><div class="article-sources"><p><em>Cover image: courtesy <a href="https://indianexpress.com/a" target="_blank">The Indian Express</a>.</em></p>\n<p><strong>Source:</strong> <a href="https://indianexpress.com/a">The Indian Express</a></p></div>'

test('a publisher photo credit is read as plain text', () => {
  assert.deepEqual(coverOf(PUBLISHER), { kind: 'photo', credit: 'Cover image: courtesy The Indian Express.' })
})

test('a Wikimedia credit keeps title, author and licence', () => {
  const html = '<p><em>Cover image: <a href="https://commons.wikimedia.org/wiki/File:X.jpg">File X</a> by Jane Doe, CC BY-SA 4.0, via Wikimedia Commons.</em></p>'
  const c = coverOf(html)
  assert.equal(c.kind, 'photo')
  assert.equal(c.credit, 'Cover image: File X by Jane Doe, CC BY-SA 4.0, via Wikimedia Commons.')
})

test('the labelled AI illustration is reported as ai', () => {
  const html = '<p>Body</p><p><em>Cover image: AI-generated illustration, not a photograph of the event.</em></p>'
  assert.equal(coverOf(html).kind, 'ai')
})

test('an article without a credit line has no usable cover', () => {
  assert.deepEqual(coverOf('<p>Old article</p>'), { kind: 'none', credit: null })
  assert.deepEqual(coverOf(null), { kind: 'none', credit: null })
})

test('the Cloudinary variant goes in front of the uploaded file', () => {
  const url = 'https://res.cloudinary.com/demo/image/upload/v1700000000/newsedition/articles/a.jpg'
  assert.equal(reelPhotoUrl(url), `https://res.cloudinary.com/demo/image/upload/${REEL_PHOTO}/v1700000000/newsedition/articles/a.jpg`)
})

test('a picture that is not a Cloudinary upload gives no variant (it is not fetched)', () => {
  assert.equal(reelPhotoUrl('https://example.com/a.jpg'), null)
  assert.equal(reelPhotoUrl(null), null)
})

test('slugs are lower-case words joined by hyphens', () => {
  assert.equal(isSlug('google-gives-iit-kharagpur-5-million'), true)
  assert.equal(isSlug('Has-Capitals'), false)
  assert.equal(isSlug('../etc/passwd'), false)
  assert.equal(isSlug(''), false)
  assert.equal(isSlug('a'.repeat(601)), false)
})
