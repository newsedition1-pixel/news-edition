import test from 'node:test'
import assert from 'node:assert/strict'
import { ALERT_MAX_TAGS, alertHashtags, BRAND_TAG, categoryHashtag, MAX_TAGS, pickHashtags, toHashtag, topicHashtags } from './hashtags'

test('a phrase becomes one CamelCase tag', () => {
  assert.equal(toHashtag('Cauvery water dispute'), '#CauveryWaterDispute')
  assert.equal(toHashtag("Karnataka's dams"), '#KarnatakasDams')
  assert.equal(toHashtag('GST council'), '#GSTCouncil')
  assert.equal(toHashtag('NEW DELHI'), '#NewDelhi')
})

test('generic, numeric, empty and over-long phrases give no tag', () => {
  assert.equal(toHashtag('News'), null)
  assert.equal(toHashtag('Breaking news'), null)
  assert.equal(toHashtag('India'), null)
  assert.equal(toHashtag('2026'), null)
  assert.equal(toHashtag('  '), null)
  assert.equal(toHashtag('one two three four five'), null)
  assert.equal(toHashtag('Extraordinarily long single tag word here'), null)
})

test('topic tags keep their order and drop duplicates', () => {
  assert.deepEqual(topicHashtags(['Karnataka', 'karnataka', 'Tamil Nadu', 'News', 'Cauvery']), ['#Karnataka', '#TamilNadu', '#Cauvery'])
})

test('the desk tag comes from the slug, else from the name', () => {
  assert.equal(categoryHashtag('business', 'Business'), '#BusinessNews')
  assert.equal(categoryHashtag('sports', 'Sports'), '#SportsNews')
  assert.equal(categoryHashtag(null, null), null)
})

const src = { tags: ['Cauvery water dispute', 'Karnataka', 'Tamil Nadu', 'Supreme Court', 'Dams'], categorySlug: 'state', categoryName: 'State' }

test('every platform stays inside its limit', () => {
  for (const ch of ['instagram', 'telegram', 'facebook', 'x'] as const) {
    const tags = pickHashtags(ch, src)
    assert.ok(tags.length >= 1 && tags.length <= MAX_TAGS[ch], `${ch}: ${tags.join(' ')}`)
    assert.ok(tags.includes(BRAND_TAG), `${ch} keeps the brand tag`)
  }
})

test('Instagram gets three topics, the desk tag and the brand tag', () => {
  assert.deepEqual(pickHashtags('instagram', src), ['#CauveryWaterDispute', '#Karnataka', '#TamilNadu', '#StateNews', '#NewsEdition'])
})

test('X and Facebook get the best topic and the brand tag only', () => {
  assert.deepEqual(pickHashtags('x', src), ['#CauveryWaterDispute', '#NewsEdition'])
  assert.deepEqual(pickHashtags('facebook', src), ['#CauveryWaterDispute', '#NewsEdition'])
})

test('with no usable topic the desk tag stands in', () => {
  const bare = { tags: ['News', 'Latest'], categorySlug: 'business', categoryName: 'Business' }
  assert.deepEqual(pickHashtags('x', bare), ['#BusinessNews', '#NewsEdition'])
  assert.deepEqual(pickHashtags('instagram', bare), ['#BusinessNews', '#NewsEdition'])
})

test('alert hashtags: two keywords and the brand, or one keyword, the desk tag and the brand', () => {
  assert.deepEqual(alertHashtags(['Gaza City', 'Doctors Without Borders'], 'world'), ['#GazaCity', '#DoctorsWithoutBorders', BRAND_TAG])
  assert.deepEqual(alertHashtags(['Gaza City'], 'world'), ['#GazaCity', '#WorldNews', BRAND_TAG])
  assert.deepEqual(alertHashtags([], 'world'), ['#WorldNews', BRAND_TAG])
  assert.deepEqual(alertHashtags([], null), [BRAND_TAG])
  assert.deepEqual(alertHashtags(['Kabul', 'kabul', 'News'], null), ['#Kabul', BRAND_TAG])
  assert.ok(alertHashtags(['A one', 'B two', 'C three', 'D four'], 'india').length <= ALERT_MAX_TAGS)
})
