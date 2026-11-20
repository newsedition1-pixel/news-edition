import test from 'node:test'
import assert from 'node:assert/strict'
import { decidePlacement, type PlacementContext, type PlacementInput } from './placement'

const open: PlacementContext = { breakingNow: 0, featuredToday: 0, featuredTodayInCategory: 0 }
const strong: PlacementInput = { publishers: 3, title: 'Policy review ordered after budget talks', wordCount: 820, cover: 'publisher', auditScore: 90 }

test('a story confirmed by several publishers with a real photo is featured, not breaking', () => {
  const p = decidePlacement(strong, open)
  assert.equal(p.featured, true)
  assert.equal(p.breaking, false)
})

test('breaking needs 3+ publishers AND an urgent headline', () => {
  assert.equal(decidePlacement({ ...strong, title: 'Eight killed as bus falls into gorge in Uttarakhand' }, open).breaking, true)
  assert.equal(decidePlacement({ ...strong, publishers: 2, title: 'Eight killed as bus falls into gorge' }, open).breaking, false)
  assert.equal(decidePlacement({ ...strong, title: 'Budget session begins with a debate on tax relief' }, open).breaking, false)
})

test('at most two breaking at a time', () => {
  const title = 'Ceasefire announced after weeks of fighting'
  assert.equal(decidePlacement({ ...strong, title }, { ...open, breakingNow: 1 }).breaking, true)
  const p = decidePlacement({ ...strong, title }, { ...open, breakingNow: 2 })
  assert.equal(p.breaking, false)
  assert.match(p.reason, /2 already breaking/)
})

test('single-publisher, illustrated, short or low-audit stories are not featured', () => {
  assert.equal(decidePlacement({ ...strong, publishers: 1 }, open).featured, false)
  assert.match(decidePlacement({ ...strong, cover: 'generated' }, open).reason, /AI illustration/)
  assert.equal(decidePlacement({ ...strong, cover: 'none' }, open).featured, false)
  assert.equal(decidePlacement({ ...strong, wordCount: 650 }, open).featured, false)
  assert.equal(decidePlacement({ ...strong, auditScore: 70 }, open).featured, false)
  assert.equal(decidePlacement({ ...strong, auditScore: null }, open).featured, true)
})

test('featured is capped per day and per category', () => {
  assert.equal(decidePlacement(strong, { ...open, featuredToday: 5 }).featured, true)
  assert.equal(decidePlacement(strong, { ...open, featuredToday: 6 }).featured, false)
  assert.equal(decidePlacement(strong, { ...open, featuredTodayInCategory: 1 }).featured, true)
  assert.match(decidePlacement(strong, { ...open, featuredTodayInCategory: 2 }).reason, /in this category/)
})

test('a story can be both breaking and featured', () => {
  const p = decidePlacement({ ...strong, title: 'Earthquake of magnitude 6 hits northern Pakistan, tremors in Delhi' }, open)
  assert.equal(p.breaking, true)
  assert.equal(p.featured, true)
})
