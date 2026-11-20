import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAuditSystemPrompt, buildAuditUserPrompt, parseAuditJson } from './auditPrompt'

test('the audit prompt forbids outside knowledge, invented facts and claims about authorship', () => {
  const p = buildAuditSystemPrompt()
  assert.match(p, /Never use outside knowledge/)
  assert.match(p, /Never invent a fact, a figure, a name, a quotation or a source/)
  assert.match(p, /Do not guess who or what wrote the article/)
  assert.match(p, /word for word/)
  assert.match(p, /Do not rewrite the article/)
})

test('the user prompt carries the article, the faqs and every report', () => {
  const p = buildAuditUserPrompt({
    title: 'T', articleText: 'Body text.', faqs: [{ question: 'Why?', answer: 'Because.' }],
    reports: [{ publisherName: 'The Hindu', text: 'Report one.' }, { publisherName: 'NDTV', text: 'Report two.' }],
    seoTitle: 's', seoDescription: 'd', focusKeyword: 'kw',
  })
  for (const part of ['Body text.', 'Q: Why?', 'REPORT 1: The Hindu', 'REPORT 2: NDTV', 'Report two.', 'FOCUS KEYWORD: kw']) assert.ok(p.includes(part), part)
})

test('parseAuditJson reads good output and drops malformed items', () => {
  const out = parseAuditJson(JSON.stringify({
    claims: [
      { claim: 'a', snippet: 'The rate stayed at 6.5 per cent', status: 'Supported' },
      { claim: 'b', snippet: 'x', status: 'maybe' },
      { claim: 'c', snippet: '', status: 'supported' },
      { claim: 'd', snippet: 'Inflation was 4.2 per cent', status: 'contradicted', evidence: 'inflation stood at 4.1 per cent' },
    ],
    aiStyle: [{ signal: 'stock phrase', snippet: 'in the wake of' }, { signal: '', snippet: 'x' }],
    weak: [{ snippet: 'Some paragraph', problem: 'vague', fix: 'name the bank' }, { snippet: 'p', problem: '' }],
    originality: ['Explain what the repo rate is', 3],
    seo: { title: 'RBI holds repo rate at 6.5%', description: 'A description of enough length.' },
  }))
  assert.ok(out)
  assert.equal(out.claims.length, 2)
  assert.equal(out.claims[0].status, 'supported')
  assert.equal(out.claims[1].evidence, 'inflation stood at 4.1 per cent')
  assert.equal(out.aiStyle.length, 1)
  assert.equal(out.weak.length, 1)
  assert.deepEqual(out.originality, ['Explain what the repo rate is'])
  assert.ok(out.seo)
})

test('parseAuditJson returns null for text that is not JSON, and empty findings for an empty object', () => {
  assert.equal(parseAuditJson('not json'), null)
  assert.equal(parseAuditJson('"text"'), null)
  const empty = parseAuditJson('{}')
  assert.deepEqual(empty, { claims: [], aiStyle: [], weak: [], originality: [], seo: null })
})
