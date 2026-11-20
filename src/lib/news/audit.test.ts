import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditArticle, betterAudit, chooseSeo, closeParaphrases, OVERALL_IMPROVE_BELOW, parseAuditMode, retryIssues, summarizeAudit, verifyFindings, WEIGHTS, type AuditInput, type LlmFindings } from './audit'
import { assessArticle } from './quality'

const SOURCE = `The Reserve Bank of India kept the repo rate unchanged at 6.5 per cent on Friday, Governor Sanjay Malhotra said after the three day meeting of the monetary policy committee in Mumbai. Retail inflation stood at 4.2 per cent in October, up from 3.7 per cent a month earlier, according to government data. "We will remain watchful on food prices," Malhotra told reporters. The committee voted 5 to 1 to hold rates. Economists at several banks expect no cut before February. Home loan borrowers will see no change in their monthly instalments for now, and the central bank also left the cash reserve ratio at 4 per cent. The bank projected growth of 6.8 per cent for the year.`

const VOCAB = 'borrowers lenders savings deposits monthly instalments committee members analysts households prices vegetables pulses fuel transport rents wages spending demand credit growth factories exports imports currency markets bonds yields banks branches customers loans mortgages tenure repayment schedule review window meeting statement minutes outlook forecast pressure relief cushion buffer margin season harvest rainfall monsoon supply storage mandi retail wholesale index basket weights base effect data release month quarter year'.split(' ')
function filler(words: number, seed: number): string {
  const out: string[] = []
  let x = seed
  for (let i = 0; i < words; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    out.push(VOCAB[x % VOCAB.length])
    if (i % 11 === 10) out.push('and')
  }
  const sentences: string[] = []
  for (let i = 0, k = 0; i < out.length; i += 9 + (k % 4) * 5, k++) {
    const s = out.slice(i, i + 9 + (k % 4) * 5).join(' ')
    sentences.push(s.charAt(0).toUpperCase() + s.slice(1) + '.')
  }
  return sentences.join(' ')
}

function html(opts: { lead?: string; extra?: string } = {}): string {
  const sizes = [60, 95, 70, 110, 80, 65, 90, 75, 100]
  const paras = sizes.map((n, i) => `<p>${filler(n, i + 3)}</p>`)
  paras[0] = `<p>${opts.lead ?? 'The Reserve Bank of India kept its repo rate at 6.5 per cent on Friday, according to The Hindu, leaving home loan instalments unchanged, and NDTV reported the same.'} ${filler(30, 99)}</p>`
  return `${paras.slice(0, 4).join('')}<h2>What it means for borrowers</h2>${paras.slice(4, 6).join('')}<h2>Analysis: why the timing matters</h2><p>${filler(40, 41)}</p><p>${filler(45, 42)}</p><h2>What comes next</h2>${paras.slice(6).join('')}${opts.extra ?? ''}`
}

const FAQS = [
  { question: 'Will my loan instalment change?', answer: 'No. Lenders keep the monthly figure where it is until the committee moves the rate.' },
  { question: 'When could a cut come?', answer: 'Economists quoted in the reports expect nothing before February.' },
]

function input(over: Partial<AuditInput> = {}): AuditInput {
  const contentHtml = over.contentHtml ?? html()
  const base = {
    title: 'RBI holds repo rate at 6.5%: what borrowers should expect',
    contentHtml,
    faqs: FAQS,
    sourceText: SOURCE,
    publisherNames: ['The Hindu', 'NDTV'],
    seoTitle: 'RBI holds repo rate at 6.5%: what it means',
    seoDescription: 'The RBI left the repo rate unchanged at 6.5 per cent on Friday. Here is what that means for home loan borrowers and savers over the coming months.',
    focusKeyword: 'repo rate',
  }
  const report = assessArticle({ ...base, minWords: 600, currentYear: 2026 })
  return { ...base, quality: report, llm: { claims: [], aiStyle: [], weak: [], originality: [], seo: null }, ...over }
}

const noFindings: LlmFindings = { claims: [], aiStyle: [], weak: [], originality: [], seo: null }

test('the weights add up to 100', () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100)
})

test('verifyFindings drops snippets that are not in the article', () => {
  const text = 'The repo rate stayed at 6.5 per cent on Friday, the governor said.'
  const out = verifyFindings({ ...noFindings, claims: [
    { claim: 'a', snippet: 'The repo rate stayed at 6.5 per cent', status: 'unsupported' },
    { claim: 'b', snippet: 'The governor resigned on Friday morning', status: 'unsupported' },
  ], aiStyle: [{ signal: 'x', snippet: 'a line that is not there' }], weak: [{ snippet: 'invented words here', problem: 'p', fix: 'f' }] }, text, SOURCE)
  assert.ok(out)
  assert.deepEqual(out.claims.map((c) => c.claim), ['a'])
  assert.equal(out.aiStyle.length, 0)
  assert.equal(out.weak.length, 0)
  assert.equal(verifyFindings(null, text, SOURCE), null)
})

test('a contradicted or misattributed verdict needs evidence that is in the reports', () => {
  const text = 'Retail inflation stood at 4.3 per cent in October and Governor Malhotra said the tax cut was approved.'
  const out = verifyFindings({ ...noFindings, claims: [
    { claim: 'inflation', snippet: 'Retail inflation stood at 4.3 per cent in October', status: 'contradicted', evidence: 'Retail inflation stood at 4.2 per cent in October' },
    { claim: 'speaker', snippet: 'Governor Malhotra said the tax cut was approved', status: 'misattributed', evidence: 'the finance minister said so on Thursday' },
  ] }, text, SOURCE)
  assert.ok(out)
  assert.equal(out.claims[0].status, 'contradicted')
  assert.equal(out.claims[1].status, 'unsupported')
})

test('an "unsupported" claim whose words and figures are all in the reports counts as supported', () => {
  const text = 'The committee voted 5 to 1 to hold rates.'
  const out = verifyFindings({ ...noFindings, claims: [{ claim: 'vote', snippet: 'The committee voted 5 to 1 to hold rates', status: 'unsupported' }] }, text, SOURCE)
  assert.equal(out?.claims[0].status, 'supported')
})

test('suggested SEO text and fixes may not bring in figures that are in neither the reports nor the article', () => {
  const text = 'The repo rate stayed at 6.5 per cent on Friday, the governor said.'
  const bad = verifyFindings({ ...noFindings, seo: { title: 'RBI holds repo rate at 7.25% for months', description: 'x'.repeat(130) }, weak: [{ snippet: 'The repo rate stayed at 6.5 per cent', problem: 'vague', fix: 'Add that GDP grew 9.9 per cent.' }], originality: ['Compare with the 9.9 per cent figure'] }, text, SOURCE)
  assert.equal(bad?.seo, null)
  assert.equal(bad?.weak[0].fix, '')
  assert.deepEqual(bad?.originality, [])
  const good = verifyFindings({ ...noFindings, seo: { title: 'RBI keeps repo rate at 6.5%: what it means', description: 'The RBI kept the repo rate unchanged at 6.5 per cent on Friday. Here is what this means for home loan borrowers and savers across India.' } }, text, SOURCE)
  assert.ok(good?.seo)
})

test('a clean article is published', () => {
  const a = auditArticle(input())
  assert.equal(a.decision, 'PUBLISH', a.reasons.join(' | '))
  assert.ok(a.score >= OVERALL_IMPROVE_BELOW)
  assert.equal(Object.values(a.breakdown).reduce((n, b) => n + b.max, 0), 100)
  assert.equal(a.plagiarism.webWide, 'Unverified')
  assert.equal(a.plagiarism.level, 'Low')
  assert.match(a.aiStyle.note, /says nothing about who or what wrote the text/)
  assert.match(a.facts.scope, /not independently against other sources/)
})

test('without the model pass only code checks are made, and the audit says so', () => {
  const a = auditArticle(input({ llm: null }))
  assert.equal(a.facts.llmChecked, false)
  assert.ok(a.partial.some((p) => /claim-by-claim/.test(p)))
  assert.ok(a.breakdown.facts.points <= 26)
})

test('a verified contradiction holds the article and is quoted back to the writer', () => {
  const llm: LlmFindings = { ...noFindings, claims: [{ claim: 'x', snippet: 'kept its repo rate at 6.5 per cent', status: 'contradicted', evidence: 'Retail inflation stood at 4.2 per cent in October' }] }
  const a = auditArticle(input({ llm }))
  assert.equal(a.decision, 'HOLD')
  assert.match(a.reasons[0], /contradict/)
  assert.ok(a.breakdown.facts.points <= WEIGHTS.facts / 2)
  const issues = retryIssues(a)
  assert.match(issues[0], /Retail inflation stood at 4.2 per cent in October/)
})

test('one unsupported claim asks for improvement, two hold the article', () => {
  const one = auditArticle(input({ llm: { ...noFindings, claims: [{ claim: 'a', snippet: 'leaving home loan instalments unchanged', status: 'unsupported' }] } }))
  assert.equal(one.decision, 'IMPROVE')
  const two = auditArticle(input({ llm: { ...noFindings, claims: [
    { claim: 'a', snippet: 'leaving home loan instalments unchanged', status: 'unsupported' },
    { claim: 'b', snippet: 'and NDTV reported the same', status: 'unsupported' },
  ] } }))
  assert.equal(two.decision, 'HOLD')
})

test('close paraphrases of one report sentence are found, and several make the plagiarism risk Medium', () => {
  const text = 'In October, retail inflation stood at 4.2 per cent, up from 3.7 per cent a month earlier, according to government data.'
  assert.equal(closeParaphrases(text, SOURCE).length, 1)
  assert.equal(closeParaphrases('Borrowers pay what they paid last month after the meeting, lenders said on Saturday evening in Pune.', SOURCE).length, 0)
  const lead = [
    'In October, retail inflation stood at 4.2 per cent, up from 3.7 per cent a month earlier, according to government data.',
    'On Friday the repo rate was kept unchanged by the Reserve Bank of India at 6.5 per cent, said Governor Sanjay Malhotra after the monetary policy committee meeting in Mumbai lasting three days.',
    'Also the central bank left the cash reserve ratio at 4 per cent, and home loan borrowers will see no change in monthly instalments for now.',
  ].join(' ')
  const a = auditArticle(input({ contentHtml: html({ lead }) }))
  assert.ok(['Medium', 'High'].includes(a.plagiarism.level), a.plagiarism.level)
  assert.notEqual(a.decision, 'PUBLISH')
  assert.ok(a.plagiarism.passages.length > 0)
})

test('stock phrases and rhythm raise the AI-style level without claiming anything about authorship', () => {
  const stock = '<p>In conclusion, it is important to note that this plays a crucial role. Let us delve into the tapestry of the matter, which sheds light on the ever-evolving landscape.</p>'
  const a = auditArticle(input({ contentHtml: html({ extra: stock }) }))
  assert.ok(['Medium', 'High'].includes(a.aiStyle.level), a.aiStyle.level)
  assert.ok(a.aiStyle.signals.some((s) => /Stock phrases/.test(s)))
  const calm = auditArticle(input())
  assert.equal(calm.aiStyle.level, 'Low')
})

test('grammar issues are listed', () => {
  const messy = '<p>the rate was held. The the committee met,, and said "the rate stays.</p>'
  const a = auditArticle(input({ contentHtml: html({ extra: messy }) }))
  assert.ok(a.grammar.score < 100)
  const text = a.grammar.issues.join(' ')
  assert.match(text, /doubled/)
  assert.match(text, /quotation mark/)
  assert.match(text, /lower-case/)
})

test('Discover readiness waits for the cover, and a real photo scores above an AI illustration', () => {
  assert.equal(auditArticle(input()).discover.readiness, 'Pending')
  const photo = auditArticle(input({ cover: { kind: 'commons', alt: 'RBI headquarters in Mumbai' } }))
  const drawn = auditArticle(input({ cover: { kind: 'generated', alt: 'Illustration of a bank' } }))
  const none = auditArticle(input({ cover: { kind: 'none', alt: null } }))
  assert.ok(photo.discover.score > drawn.discover.score)
  assert.ok(drawn.discover.score > none.discover.score)
  assert.notEqual(photo.discover.readiness, 'Pending')
})

test('SEO and E-E-A-T use the links once they are known', () => {
  const before = auditArticle(input())
  const after = auditArticle(input({ links: { internal: 2, external: 2, documents: 1 }, cover: { kind: 'commons', alt: 'RBI headquarters' } }))
  assert.ok(after.seo.score >= before.seo.score)
  assert.ok(after.eeat.score > before.eeat.score - 1)
  const missing = auditArticle(input({ links: { internal: 0, external: 0, documents: 0 }, cover: { kind: 'commons', alt: 'RBI headquarters' } }))
  assert.ok(missing.seo.issues.some((i) => /related articles/.test(i)))
  assert.ok(missing.eeat.issues.some((i) => /official document/.test(i)))
})

test('chooseSeo keeps the writer’s text unless it fails the rules and the improved pair passes', () => {
  const ok = { seoTitle: 'RBI holds repo rate at 6.5%: what it means', seoDescription: 'The RBI left the repo rate unchanged at 6.5 per cent on Friday. Here is what that means for home loan borrowers and savers over the coming months.' }
  const better = { title: 'RBI keeps repo rate at 6.5%: what it means', description: 'The RBI kept the repo rate unchanged at 6.5 per cent on Friday. This is what it means for home loan borrowers, savers and lenders across India.' }
  assert.equal(chooseSeo(ok, better, 'repo rate').replaced, false)
  const weak = { seoTitle: 'RBI news', seoDescription: 'Short.' }
  const swapped = chooseSeo(weak, better, 'repo rate')
  assert.equal(swapped.replaced, true)
  assert.equal(swapped.seoTitle, better.title)
  assert.equal(chooseSeo(weak, { title: 'No keyword here at all in this title', description: better.description }, 'repo rate').replaced, false)
  assert.equal(chooseSeo(weak, null, 'repo rate').replaced, false)
})

test('parseAuditMode defaults to enforce', () => {
  assert.equal(parseAuditMode(undefined), 'enforce')
  assert.equal(parseAuditMode(''), 'enforce')
  assert.equal(parseAuditMode('LOG'), 'log')
  assert.equal(parseAuditMode(' off '), 'off')
  assert.equal(parseAuditMode('whatever'), 'enforce')
})

test('betterAudit prefers the lower-risk decision, then the higher score; summaries stay short', () => {
  const clean = auditArticle(input())
  const held = auditArticle(input({ llm: { ...noFindings, claims: [{ claim: 'x', snippet: 'kept its repo rate at 6.5 per cent', status: 'contradicted', evidence: 'Retail inflation stood at 4.2 per cent in October' }] } }))
  assert.equal(betterAudit(held, clean), clean)
  assert.equal(betterAudit(clean, held), clean)
  const s = summarizeAudit(held)
  assert.equal(s.decision, 'HOLD')
  assert.ok(s.reasons.length <= 4)
})
