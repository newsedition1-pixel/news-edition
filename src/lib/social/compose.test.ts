import test from 'node:test'
import assert from 'node:assert/strict'
import { cloudinaryVariant, composeAll, cutAtWord, hasAiCover, INSTAGRAM_CAPTION_LIMIT, INSTAGRAM_IMAGE, keywordsOf, plain, summaryOf, weightedLength, webhookPayload, X_LIMIT, X_URL_WEIGHT, type ArticleForSocial } from './compose'

const IMG = 'https://res.cloudinary.com/demo/image/upload/v1700000000/newsedition/covers/abc.jpg'

const article: ArticleForSocial = {
  title: 'Karnataka, Tamil Nadu clash over Cauvery water release as Supreme Court hearing nears',
  excerpt: 'Karnataka has said it cannot release more water this month. Tamil Nadu wants the Cauvery Water Management Authority to step in before the Supreme Court hears the matter on Monday. Farmers on both sides are waiting.',
  url: 'https://newsedition.in/article/cauvery-water-release',
  tags: ['Cauvery water dispute', 'Karnataka', 'Tamil Nadu', 'Supreme Court', 'News'],
  categorySlug: 'state',
  categoryName: 'State',
  imageUrl: IMG,
  content: '<p>Body</p>',
}

const withLink = (s: string, url: string) => weightedLength(s.split(url).join('x'.repeat(X_URL_WEIGHT)))

test('plain text drops markup and entities', () => {
  assert.equal(plain('<p>Tom &amp; Jerry&nbsp;<b>win</b></p>'), 'Tom & Jerry win')
})

test('long text is cut at a word with an ellipsis', () => {
  assert.equal(cutAtWord('short', 20), 'short')
  const cut = cutAtWord('Karnataka has said it cannot release more water this month', 30)
  assert.ok(cut.endsWith('…') && cut.length <= 30, cut)
  assert.ok(!cut.includes('mo…'))
})

test('the summary is made of whole sentences that fit', () => {
  assert.equal(summaryOf(article.excerpt, 70), 'Karnataka has said it cannot release more water this month.')
  assert.equal(summaryOf(article.excerpt, 20), '')
  assert.ok(summaryOf('One very long sentence with no full stop that just keeps going and going and going on', 50).endsWith('…'))
})

test('Telegram: bold headline, summary, link, tags, inside the caption limit', () => {
  const { telegram } = composeAll(article, { xLink: true })
  assert.ok(telegram.text.startsWith('<b>Karnataka, Tamil Nadu clash'))
  assert.ok(telegram.text.includes(`<a href="${article.url}">`))
  assert.ok(telegram.text.includes('#NewsEdition'))
  const visible = telegram.text.replace(/<[^>]+>/g, '')
  assert.ok(visible.length <= 1024, String(visible.length))
  assert.ok(telegram.imageUrl?.includes('/upload/c_limit,w_1280,f_jpg,q_auto/'))
})

test('Telegram: markup in a headline is escaped', () => {
  const { telegram } = composeAll({ ...article, title: 'Tom & Jerry <script>alert(1)</script> hit' }, { xLink: false })
  assert.ok(!telegram.text.includes('<script>'))
  assert.ok(telegram.text.includes('Tom &amp; Jerry'))
})

test('X with the link: link, tags, never over 280', () => {
  const { x } = composeAll(article, { xLink: true })
  assert.ok(x.text.includes(article.url))
  assert.ok(x.text.includes('#CauveryWaterDispute'))
  assert.ok(withLink(x.text, article.url) <= X_LIMIT, String(withLink(x.text, article.url)))
})

test('X without the link has no address in it at all (a link makes the post cost far more)', () => {
  const { x } = composeAll(article, { xLink: false })
  assert.ok(!/https?:|newsedition\.in/i.test(x.text), x.text)
  assert.ok(weightedLength(x.text) <= X_LIMIT)
  assert.ok(x.text.includes('Karnataka has said it cannot release more water this month.'))
})

test('X: a very long headline is cut to fit', () => {
  const long = { ...article, title: 'Word '.repeat(120).trim() }
  for (const xLink of [true, false]) {
    const { x } = composeAll(long, { xLink })
    assert.ok(withLink(x.text, article.url) <= X_LIMIT)
  }
})

test('Facebook: headline, summary, two tags and the link for the card', () => {
  const { facebook } = composeAll(article, { xLink: false })
  assert.equal(facebook.link, article.url)
  assert.equal(facebook.hashtags.length, 2)
  assert.ok(facebook.text.startsWith(plain(article.title)))
})

test('Instagram: keywords in the caption, five tags at most, a padded 4:5 picture (Cloudinary image padding, not the video-only blur)', () => {
  const { instagram, keywords } = composeAll(article, { xLink: false })
  assert.deepEqual(keywords, ['Cauvery water dispute', 'Karnataka', 'Tamil Nadu', 'Supreme Court'])
  assert.ok(instagram.text.includes('Topics: Cauvery water dispute · Karnataka · Tamil Nadu · Supreme Court'))
  assert.ok(instagram.text.includes('More on newsedition.in (link in bio)'))
  assert.ok(!instagram.text.includes('http'))
  assert.ok(instagram.hashtags.length <= 5)
  assert.ok(instagram.text.length <= INSTAGRAM_CAPTION_LIMIT)
  assert.equal(instagram.imageUrl, `https://res.cloudinary.com/demo/image/upload/${INSTAGRAM_IMAGE}/v1700000000/newsedition/covers/abc.jpg`)
})

test('only Cloudinary pictures are rewritten', () => {
  assert.equal(cloudinaryVariant('https://example.com/a.jpg', 'c_limit,w_100'), 'https://example.com/a.jpg')
  assert.equal(cloudinaryVariant(null, 'c_limit,w_100'), null)
})

test('a labelled AI illustration cover is recognised', () => {
  assert.equal(hasAiCover('<p><em>Cover image: AI-generated illustration, not a photograph of the event.</em></p>'), true)
  assert.equal(hasAiCover('<p>Cover image: Wikimedia Commons</p>'), false)
  assert.equal(composeAll({ ...article, content: '<em>AI-generated illustration</em>' }, { xLink: false }).aiCover, true)
})

test('keywords skip generic words and repeats', () => {
  assert.deepEqual(keywordsOf(['News', 'GST council', 'gst council', 'Breaking news', 'Delhi']), ['GST council', 'Delhi'])
})

test('the webhook gets every platform text and the top-story flag', () => {
  const set = composeAll(article, { xLink: false })
  const p = webhookPayload(article, set, { feed: true })
  assert.equal(p.feed, true)
  assert.equal(p.url, article.url)
  assert.equal(p.posts.x, set.x.text)
  assert.equal(p.instagramImageUrl, set.instagram.imageUrl)
})

test('a bare article (no excerpt, no tags, no image) still gives a post everywhere', () => {
  const bare: ArticleForSocial = { title: 'Short headline', excerpt: null, url: article.url, tags: [], categorySlug: null, categoryName: null, imageUrl: null }
  const set = composeAll(bare, { xLink: true })
  for (const p of [set.telegram, set.x, set.facebook, set.instagram]) assert.ok(p.text.includes('Short headline'))
  assert.ok(set.x.text.includes('#NewsEdition'))
  assert.equal(set.instagram.imageUrl, null)
})
