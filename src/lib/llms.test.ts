import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLlmsTxt, FALLBACK_CATEGORIES } from './llms'

const cats = [
  { name: 'India', slug: 'india' },
  { name: 'Sports', slug: 'sports' },
  { name: 'Technology', slug: 'technology' },
  { name: 'Travel', slug: 'travel', description: 'Trips,   places and   routes' },
]

const recent = [
  { slug: 'a-1', title: 'Court [rules] on   bail', publishedAt: new Date('2026-11-24T10:00:00Z'), categoryName: 'India' },
  { slug: 'b-2', title: 'Chip export rules tighten', publishedAt: null, categoryName: null },
]

test('sections come from the database, so Sports and Technology are listed', () => {
  const out = buildLlmsTxt(cats, recent)
  assert.match(out, /\[Sports\]\(https:\/\/newsedition\.in\/sports\)/)
  assert.match(out, /\[Technology\]\(https:\/\/newsedition\.in\/technology\)/)
  assert.match(out, /It publishes news in English: India, Sports, Technology, Travel\./)
})

test('an unknown section uses its own description, tidied to one line', () => {
  const out = buildLlmsTxt(cats, [])
  assert.match(out, /\[Travel\]\(https:\/\/newsedition\.in\/travel\): Trips, places and routes/)
})

test('latest stories: brackets removed from link text, category and date shown when known', () => {
  const out = buildLlmsTxt(cats, recent)
  assert.match(out, /## Latest stories/)
  assert.match(out, /- \[Court rules on bail\]\(https:\/\/newsedition\.in\/article\/a-1\): India, 2026-11-24/)
  assert.match(out, /- \[Chip export rules tighten\]\(https:\/\/newsedition\.in\/article\/b-2\)\n/)
})

test('no stories: the Latest stories heading is left out', () => {
  assert.doesNotMatch(buildLlmsTxt(cats, []), /Latest stories/)
})

test('empty database: the fallback sections include Sports and Technology', () => {
  const out = buildLlmsTxt([], [])
  assert.equal(FALLBACK_CATEGORIES.some((c) => c.slug === 'sports'), true)
  assert.match(out, /\/sports\)/)
  assert.match(out, /\/technology\)/)
  assert.match(out, /\/haryana-news\)/)
})

test('publisher, policy and feed links are always there; no "undefined" leaks', () => {
  const out = buildLlmsTxt(cats, recent)
  for (const p of ['/about', '/editorial-policy', '/corrections', '/grievance', '/contact', '/feed.xml', '/sitemap.xml', '/news-sitemap.xml']) {
    assert.ok(out.includes(`https://newsedition.in${p}`), p)
  }
  assert.doesNotMatch(out, /undefined|null/)
})
