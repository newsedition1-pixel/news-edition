import test from 'node:test'
import assert from 'node:assert/strict'
import { deskOf, hasRealUrgentWords, isQuietStory, isRealBreaking, isRealBreakingStory } from './realBreaking'
import { isUrgentHeadline } from './placement'
import type { Story, StoryItem } from './cluster'

const item = (title: string, key = 'ndtv', summary = ''): StoryItem => ({ title, link: `https://example.com/${key}`, summary, publishedAt: '2026-11-28T13:00:00.000Z', publisherKey: key, publisherName: key })
const story = (...items: StoryItem[]): Story => ({
  id: items[0].title, lead: items[0], items, publishers: [], publisherCount: items.length, score: 1, trendMatch: null, isExplainer: false, newestAt: '2026-11-28T13:00:00.000Z',
})

test('deaths, attacks, disasters and resignations are urgent', () => {
  for (const t of [
    'Israeli airstrike hits clinic in Gaza City',
    'Eight killed as bus falls into gorge in Uttarakhand',
    'Earthquake of magnitude 6.1 shakes Nepal',
    'Union minister resigns after the cabinet reshuffle',
    'Ceasefire announced between the two sides',
    'Blast at Kabul school leaves 7 dead',
  ]) assert.equal(hasRealUrgentWords(t), true, t)
})

test('routine court and crime words are not urgent for X, although the site list has them', () => {
  for (const t of ['Man arrested for cheating investors of Rs 3 crore', 'Court reserves verdict in the land case', 'Former clerk sentenced to five years in jail']) {
    assert.equal(hasRealUrgentWords(t), false, t)
    assert.equal(isRealBreaking({ titles: [t] }), false, t)
  }
  assert.equal(isUrgentHeadline('Man arrested for cheating investors of Rs 3 crore'), true) // the site's own rule is unchanged
})

test('a bomb threat, scare or hoax is not breaking, unless somebody was hurt', () => {
  assert.equal(hasRealUrgentWords('Diljit Dosanjh addresses bomb threats, thanks fans and police at Mumbai concert'), false)
  assert.equal(hasRealUrgentWords('School evacuated after a bomb threat call; hoax, say police'), false)
  assert.equal(hasRealUrgentWords('Bomb scare at the airport, flights delayed'), false)
  assert.equal(hasRealUrgentWords('Bomb threat turns real as a blast kills three outside the court'), true)
})

test('an entertainment or sports story is quiet unless something grave happened', () => {
  assert.equal(isRealBreaking({ titles: ['Diljit Dosanjh concert hit by bomb threat; show goes on'] }), false)
  assert.equal(isRealBreaking({ titles: ['Actor hospitalised after attack on film set'] }), false)
  assert.equal(isRealBreaking({ titles: ['India crash out of the World Cup after a dead rubber'] }), false)
  assert.equal(isRealBreaking({ titles: ['Cricket match abandoned as crowd attack the umpires'] }), false)
  assert.equal(isRealBreaking({ titles: ['Stampede at film premiere kills three, cinema in Hyderabad shut'] }), true)
  assert.equal(isRealBreaking({ titles: ['Veteran Bollywood actor dies at 82'] }), true)
  assert.equal(isRealBreaking({ titles: ['Blast near cricket stadium before the T20 final'] }), true)
})

test('other desks stay breaking, and a known category slug is trusted', () => {
  assert.equal(isRealBreaking({ titles: ['Israeli airstrike kills two Doctors Without Borders staff at Gaza City clinic'] }), true)
  assert.equal(isRealBreaking({ titles: ['Landslide buries village in Himachal'], categorySlug: 'india' }), true)
  assert.equal(isRealBreaking({ titles: ['Attack on the film set injures the crew'], categorySlug: 'entertainment' }), false)
  assert.equal(isQuietStory({ titles: ['Attack on the film set injures the crew'], categorySlug: 'entertainment' }), true)
  assert.equal(isQuietStory({ titles: ['Landslide buries village in Himachal'], categorySlug: 'india' }), false)
})

test('no desk keyword at all: nothing is guessed, the headline decides', () => {
  assert.equal(deskOf({ titles: ['Seven dead after tremor'] }), null)
  assert.equal(isRealBreaking({ titles: ['Seven dead after tremor'] }), true)
})

test('a clustered story: any publisher headline can carry the urgent word', () => {
  const quake = story(item('Quake rattles Nepal capital', 'bbc', 'A strong earthquake struck near Kathmandu.'), item('Earthquake of 6.1 jolts Kathmandu', 'hindu'))
  assert.equal(isRealBreakingStory(quake), true)
  const concert = story(item('Diljit Dosanjh addresses bomb threats at Mumbai concert', 'ndtv', 'The singer spoke to fans.'), item('Diljit thanks fans and police after bomb threat at concert', 'toi'))
  assert.equal(isRealBreakingStory(concert), false)
  const arrest = story(item('Businessman arrested in Rs 40 crore fraud case', 'ndtv'), item('ED arrests businessman in fraud case', 'hindu'))
  assert.equal(isRealBreakingStory(arrest), false)
})
