import { test } from 'node:test'
import assert from 'node:assert/strict'
import { finalizeSeo, finalizeTags, rankInternalCandidates, slugFromTitle } from './meta'

test('tags: focus keyword first, lowercase, unique, max 8', () => {
  const tags = finalizeTags(['RBI', 'repo rate', 'Home Loans', 'x', 'monetary policy', 'inflation', 'savings', 'emi', 'banks', 'economy'], 'Repo Rate')
  assert.equal(tags[0], 'repo rate')
  assert.equal(new Set(tags).size, tags.length)
  assert.ok(tags.length <= 8)
  assert.ok(!tags.includes('x'))
})

test('seo fields are trimmed on word boundaries', () => {
  const r = finalizeSeo({ title: 'T', seoTitle: 'RBI holds the repo rate at 6.5 per cent as food inflation worries persist', seoDescription: 'word '.repeat(60), excerpt: 'e '.repeat(150) })
  assert.ok(r.seoTitle.length <= 60)
  assert.ok(!/\s$/.test(r.seoTitle))
  assert.ok(r.seoDescription.length <= 156)
  assert.ok(r.excerpt.length <= 200)
})

test('slug is capped at a word boundary', () => {
  const slug = slugFromTitle('RBI holds the repo rate at 6.5 per cent: what it means for home loan borrowers, savers and the rupee this winter')
  assert.ok(slug.length <= 80)
  assert.ok(!slug.endsWith('-'))
  assert.equal(slugFromTitle('Short title'), 'short-title')
})

test('one shared word (a section label or a single place name) is not enough for a link', () => {
  const rows = [
    { title: 'Global divisions surface amid UN Secretary-General race', slug: 'un', tags: ['state politics', 'united nations'], categoryId: 11 },
    { title: 'RSS advocates diversion of Indus river water to support north Indian farmers', slug: 'indus', tags: ['water management', 'indus river'], categoryId: 11 },
    { title: 'BJP secures three seats in Karnataka Legislative Council elections', slug: 'council', tags: ['karnataka', 'bjp'], categoryId: 11 },
    { title: 'Karnataka reservoirs fill as Cauvery inflow rises', slug: 'inflow', tags: ['cauvery water dispute', 'karnataka'], categoryId: 11 },
  ]
  const out = rankInternalCandidates(
    { title: 'Supreme Court turns down Tamil Nadu request for more Cauvery water', tags: ['cauvery water dispute', 'karnataka', 'cauvery water management authority', 'state politics'], categoryId: 11 },
    rows
  )
  assert.deepEqual(out.map((o) => o.slug), ['inflow'])
})

test('related articles share distinctive words, not just "india"', () => {
  const rows = [
    { title: 'How repo rate changes move your EMI', slug: 'emi', tags: ['repo rate'], categoryId: 1 },
    { title: 'India government minister announces scheme', slug: 'generic', tags: ['india'], categoryId: 1 },
    { title: 'Cricket: India win the toss', slug: 'cricket', tags: ['cricket'], categoryId: 2 },
  ]
  const out = rankInternalCandidates({ title: 'RBI holds repo rate at 6.5%', tags: ['repo rate', 'india'], categoryId: 1 }, rows)
  assert.deepEqual(out.map((o) => o.slug), ['emi'])
})
