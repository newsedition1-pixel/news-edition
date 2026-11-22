import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_IMAGE_MODELS, imageModelChain, modelUnavailable } from './imageModels'

test('the chain starts with the replacement for the retired gpt-image-1 and never lists it', () => {
  const chain = imageModelChain(undefined)
  assert.equal(chain[0], 'gpt-image-2.5-flare')
  assert.ok(!chain.includes('gpt-image-1'))
  assert.deepEqual(chain, [...DEFAULT_IMAGE_MODELS])
})

test('OPENAI_IMAGE_MODEL goes first, once, and blank means unset', () => {
  assert.deepEqual(imageModelChain('gpt-image-2.5-sunburst').slice(0, 2), ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'])
  const again = imageModelChain('gpt-image-2.5-flare')
  assert.equal(again.length, DEFAULT_IMAGE_MODELS.length)
  assert.equal(again[0], 'gpt-image-2.5-flare')
  assert.deepEqual(imageModelChain('  '), [...DEFAULT_IMAGE_MODELS])
})

test('a gone, unknown or closed model moves on to the next one', () => {
  // the real answer from 22 Nov 2026
  assert.equal(modelUnavailable(400, `{"error":{"message":"The model 'gpt-image-1' does not exist.","type":"image_generation_user_error","code":null}}`), true)
  assert.equal(modelUnavailable(404, 'not found'), true)
  assert.equal(modelUnavailable(403, 'Your organization must be verified to use the model gpt-image-2.5-flare.'), true)
  assert.equal(modelUnavailable(400, 'The model `x` is not supported for this endpoint'), true)
})

test('a refusal of the picture, a rate limit or a server error does not change the model', () => {
  assert.equal(modelUnavailable(400, 'Your request was rejected by the safety system. moderation_blocked'), false)
  assert.equal(modelUnavailable(400, `Invalid value: '1536x1024'. Supported sizes are 1024x1024`), false)
  assert.equal(modelUnavailable(429, 'rate limit for model gpt-image-2.5-flare'), false)
  assert.equal(modelUnavailable(500, 'the model does not exist'), false)
  assert.equal(modelUnavailable(401, 'Incorrect API key'), false)
})
