import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLogoSystemPrompt, isImageDownloadError, logoCheckEnabled, parseLogoVerdict } from './logoPrompt'

test('a clean picture has no marks', () => {
  assert.deepEqual(parseLogoVerdict('{"marks":[],"brandedCard":false}'), { hasLogo: false, marks: [] })
})

test('an overlay logo makes the picture unusable and is named', () => {
  const v = parseLogoVerdict('{"marks":[{"brand":"NDTV","kind":"overlay","where":"top-left"}],"brandedCard":false}')
  assert.deepEqual(v, { hasLogo: true, marks: ['NDTV (top-left)'] })
  assert.equal(parseLogoVerdict('{"marks":[{"brand":"unknown","kind":"OVERLAY"}],"brandedCard":false}')?.hasLogo, true)
})

test('logos that are part of the scene (mic flags, signboards) do not reject the picture', () => {
  const v = parseLogoVerdict('{"marks":[{"brand":"Aaj Tak","kind":"in_scene","where":"microphone"},{"brand":"Pepsi","kind":"in_scene","where":"banner"}],"brandedCard":false}')
  assert.deepEqual(v, { hasLogo: false, marks: [] })
})

test('a branded news card rejects the picture', () => {
  assert.deepEqual(parseLogoVerdict('{"marks":[],"brandedCard":true}'), { hasLogo: true, marks: ['branded news card'] })
})

test('an answer that is not the expected JSON means "could not tell", never "clean"', () => {
  assert.equal(parseLogoVerdict(''), null)
  assert.equal(parseLogoVerdict(null), null)
  assert.equal(parseLogoVerdict('no logo here'), null)
  assert.equal(parseLogoVerdict('{"hasLogo":false}'), null)
  assert.equal(parseLogoVerdict('{"marks":"none"}'), null)
  assert.equal(parseLogoVerdict('[]'), null)
})

test('JSON wrapped in prose or a code fence is still read', () => {
  const v = parseLogoVerdict('Here you go:\n```json\n{"marks":[{"brand":"Getty Images","kind":"overlay","where":"bottom-right"}],"brandedCard":false}\n```')
  assert.deepEqual(v, { hasLogo: true, marks: ['Getty Images (bottom-right)'] })
})

test('odd fields cannot smuggle text into the notes', () => {
  const v = parseLogoVerdict(JSON.stringify({ marks: [{ brand: 'X'.repeat(300), kind: 'overlay', where: 'a\n\nb' }, null, 'str', { kind: 'overlay' }], brandedCard: 'yes' }))
  assert.equal(v?.hasLogo, true)
  assert.equal(v?.marks.length, 2)
  assert.ok(v!.marks[0].length <= 80)
  assert.equal(v!.marks[0].includes('\n'), false)
  assert.equal(v!.marks[1], 'unknown')
})

test('the check can be switched off, and is on by default', () => {
  assert.equal(logoCheckEnabled(undefined), true)
  assert.equal(logoCheckEnabled(''), true)
  assert.equal(logoCheckEnabled('enforce'), true)
  assert.equal(logoCheckEnabled('off'), false)
  assert.equal(logoCheckEnabled(' OFF '), false)
})

test('only a 400 about the image download falls back to sending the bytes', () => {
  assert.equal(isImageDownloadError(400, 'Error while downloading https://x/y.jpg.'), true)
  assert.equal(isImageDownloadError(400, '{"error":{"code":"invalid_image_url"}}'), true)
  assert.equal(isImageDownloadError(429, 'rate limit'), false)
  assert.equal(isImageDownloadError(500, 'download'), false)
  assert.equal(isImageDownloadError(400, 'model not found'), false)
})

test('the prompt names the outlets, the corners and the in-scene exception', () => {
  const p = buildLogoSystemPrompt()
  assert.match(p, /NDTV/)
  assert.match(p, /watermark/i)
  assert.match(p, /corner/i)
  assert.match(p, /in_scene/)
  assert.match(p, /JSON only/)
})
