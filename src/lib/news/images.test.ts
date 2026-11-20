import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildImageCredit, classifyLicense, parseCommonsPages, relevantImages } from './images'

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
