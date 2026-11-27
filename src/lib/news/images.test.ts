import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildImageCredit, classifyLicense, coverNoteHtml, imageKey, isPublicHttpsUrl, isSiteDefaultImage, looksLikeLogoShape, looksLikePlaceholderImage, parseCommonsPages, relevantImages, safeCoverPrompt } from './images'

const meta = (license: string, artist = 'Jane <a href="x">Doe</a>', description = 'Narendra Modi addressing a rally in Hisar') => ({
  LicenseShortName: { value: license },
  UsageTerms: { value: license },
  LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
  Artist: { value: artist },
  ImageDescription: { value: description },
})
const page = (title: string, license: string, over: Record<string, unknown> = {}, description?: string) => ({
  title,
  imageinfo: [{ url: 'https://upload.wikimedia.org/a.jpg', thumburl: 'https://upload.wikimedia.org/thumb/a.jpg', thumbwidth: 1600, thumbheight: 900, width: 3000, height: 2000, mime: 'image/jpeg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:A.jpg', extmetadata: meta(license, undefined, description), ...over }],
})

test('licence classification', () => {
  assert.deepEqual(classifyLicense('CC BY-SA 4.0'), { ok: true, attribution: true })
  assert.deepEqual(classifyLicense('CC BY 2.0'), { ok: true, attribution: true })
  assert.deepEqual(classifyLicense('Public domain'), { ok: true, attribution: false })
  assert.deepEqual(classifyLicense('CC0'), { ok: true, attribution: false })
  assert.equal(classifyLicense('CC BY-NC 4.0').ok, false)
  assert.equal(classifyLicense('CC BY-ND 2.0').ok, false)
  assert.equal(classifyLicense('Fair use').ok, false)
  assert.equal(classifyLicense('').ok, false)
  assert.equal(classifyLicense('Some custom licence').ok, false)
})

test('only licensed, wide, large JPEG/PNG files are kept', () => {
  const kept = parseCommonsPages([
    page('File:Modi_Hisar_rally.jpg', 'CC BY-SA 4.0'),
    page('File:Nc_photo.jpg', 'CC BY-NC 4.0'),
    page('File:Tiny.jpg', 'CC BY 4.0', { width: 400, height: 300 }),
    page('File:Portrait.jpg', 'CC BY 4.0', { width: 1000, height: 1600 }),
    page('File:Diagram.svg', 'CC BY 4.0', { mime: 'image/svg+xml' }),
  ])
  assert.equal(kept.length, 1)
  assert.equal(kept[0].title, 'Modi Hisar rally')
  assert.equal(kept[0].author, 'Jane Doe')
  assert.equal(kept[0].attributionRequired, true)
})

test('an image must actually mention the story subject', () => {
  const images = parseCommonsPages([page('File:Modi_Hisar_rally.jpg', 'CC BY-SA 4.0'), page('File:Random_beach.jpg', 'CC BY 4.0', {}, 'Sunset over a quiet beach')])
  assert.equal(relevantImages(images, ['Narendra Modi', 'Hisar']).length, 1)
  assert.equal(relevantImages(images, ['Amitabh Bachchan']).length, 0)
  assert.equal(relevantImages(images, ['India']).length, 0)
})

test('credit line names the author, licence and Commons', () => {
  const [img] = parseCommonsPages([page('File:Modi_Hisar_rally.jpg', 'CC BY-SA 4.0')])
  const credit = buildImageCredit(img)
  assert.match(credit, /by Jane Doe/)
  assert.match(credit, /CC BY-SA 4\.0/)
  assert.match(credit, /via Wikimedia Commons/)
})

test('site logos, placeholders and vector/gif images are not news photos', () => {
  assert.equal(looksLikePlaceholderImage('https://www.thehindu.com/static/theme/default/base/img/thehindu-logo.png'), true)
  assert.equal(looksLikePlaceholderImage('https://example.com/images/default-og-image.jpg'), true)
  assert.equal(looksLikePlaceholderImage('https://example.com/a/b.svg?x=1'), true)
  assert.equal(looksLikePlaceholderImage(null), true)
  assert.equal(looksLikePlaceholderImage('https://th-i.thgim.com/public/incoming/abc123/article9999.ece/alternates/LANDSCAPE_1200/IMG_Rate.jpg'), false)
})

test('theme and static asset paths and share-image names are placeholders, real photo paths are not', () => {
  assert.equal(looksLikePlaceholderImage('https://th.thgim.com/static/theme/default/base/img/thehindu-share.png'), true)
  assert.equal(looksLikePlaceholderImage('https://www.example.com/theme/images/default.jpg'), true)
  assert.equal(looksLikePlaceholderImage('https://www.example.com/images/og-image.jpg'), true)
  assert.equal(looksLikePlaceholderImage('https://www.example.com/assets/masthead-1200.jpg'), true)
  assert.equal(looksLikePlaceholderImage('https://th.thgim.com/news/national/pm-modi/article12345.ece/alternates/LANDSCAPE_1200/Modi.jpg'), false)
  assert.equal(looksLikePlaceholderImage('https://images.scroll.in/large/static/uploads/2026/11/court.jpg'), false)
  assert.equal(looksLikePlaceholderImage('https://static.toiimg.com/thumb/msid-123/123.jpg'), false)
})

test('the publisher site-wide share image is recognised whatever its query string', () => {
  assert.equal(imageKey('https://www.thehindu.com/img/share.jpg?w=1200'), 'thehindu.com/img/share.jpg')
  assert.equal(isSiteDefaultImage('https://thehindu.com/img/share.jpg?x=1', 'https://www.thehindu.com/img/share.jpg'), true)
  assert.equal(isSiteDefaultImage('https://thehindu.com/img/story-photo.jpg', 'https://www.thehindu.com/img/share.jpg'), false)
  assert.equal(isSiteDefaultImage('https://thehindu.com/img/share.jpg', null), false)
  assert.equal(isSiteDefaultImage(null, 'https://www.thehindu.com/img/share.jpg'), false)
})

test('logo and banner shapes are rejected, news photo shapes are kept', () => {
  assert.equal(looksLikeLogoShape(1200, 675), false)
  assert.equal(looksLikeLogoShape(1200, 630), false)
  assert.equal(looksLikeLogoShape(800, 1000), false)
  assert.equal(looksLikeLogoShape(1600, 300 - 1), true)
  assert.equal(looksLikeLogoShape(2400, 600), true)
  assert.equal(looksLikeLogoShape(600, 1400), true)
  assert.equal(looksLikeLogoShape(null, null), false)
})

test('the neutral illustration prompt has no people, no text and names the desk', () => {
  const p = safeCoverPrompt('world-news')
  assert.match(p, /world news/)
  assert.match(p, /no people/)
  assert.match(p, /no text/)
  assert.match(safeCoverPrompt(null), /news story/)
})

test('only https URLs on a public host may be downloaded by the server', () => {
  assert.equal(isPublicHttpsUrl('https://th-i.thgim.com/public/a.jpg'), true)
  assert.equal(isPublicHttpsUrl('http://th-i.thgim.com/public/a.jpg'), false)
  assert.equal(isPublicHttpsUrl('https://localhost/a.jpg'), false)
  assert.equal(isPublicHttpsUrl('https://intranet/a.jpg'), false)
  assert.equal(isPublicHttpsUrl('https://127.0.0.1/a.jpg'), false)
  assert.equal(isPublicHttpsUrl('https://169.254.169.254/latest/meta-data'), false)
  assert.equal(isPublicHttpsUrl('https://[::1]/a.jpg'), false)
  assert.equal(isPublicHttpsUrl('https://user:pw@example.com/a.jpg'), false)
  assert.equal(isPublicHttpsUrl('https://example.com:8443/a.jpg'), false)
  assert.equal(isPublicHttpsUrl('https://printer.local/a.jpg'), false)
  assert.equal(isPublicHttpsUrl('not a url'), false)
  assert.equal(isPublicHttpsUrl(null), false)
})

test('photo covers get no credit line (28 Nov 2026), the AI illustration keeps its label', () => {
  assert.equal(coverNoteHtml('commons'), '')
  assert.equal(coverNoteHtml('publisher'), '')
  const label = coverNoteHtml('generated')
  assert.match(label, /AI-generated illustration, not a photograph/)
  assert.match(label, /^<p><em>Cover image:/)
})
