import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aiPhraseHits, analysisPoints, assessArticle, copiedPassages, copyStats, extractFigures, extractQuotes, repetitionIssues, sanitizeArticleHtml, sentenceOverlap, ungroundedProperNouns } from './quality'

const SOURCE = `The Reserve Bank of India kept the repo rate unchanged at 6.5 per cent on Friday, Governor Sanjay Malhotra said after the three day meeting of the monetary policy committee in Mumbai. Retail inflation stood at 4.2 per cent in October, up from 3.7 per cent a month earlier, according to government data. "We will remain watchful on food prices," Malhotra told reporters. The committee voted 5 to 1 to hold rates. Economists at several banks expect no cut before February. Home loan borrowers will see no change in their monthly instalments for now, and the central bank also left the cash reserve ratio at 4 per cent. The bank projected growth of 6.8 per cent for the year.`

// Deterministic filler prose that shares no 8-word runs with SOURCE.
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
  for (let i = 0; i < out.length; i += 14) {
    const s = out.slice(i, i + 14 + (i % 3) * 3).join(' ')
    sentences.push(s.charAt(0).toUpperCase() + s.slice(1) + '.')
  }
  return sentences.join(' ')
}

function goodHtml(extra = ''): string {
  const paras = Array.from({ length: 9 }, (_, i) => `<p>${filler(75, i + 3)}</p>`)
  paras[0] = `<p>The Reserve Bank of India kept its repo rate at 6.5 per cent on Friday, according to The Hindu, leaving home loan instalments unchanged. ${filler(40, 99)}</p>`
  return `${paras.slice(0, 4).join('')}<h2>What it means for borrowers</h2>${paras.slice(4, 6).join('')}<h2>Analysis: why the timing matters</h2>${paras.slice(6, 8).join('')}<h2>What comes next</h2>${paras.slice(8).join('')}${extra}`
}

const base = {
  title: 'RBI holds repo rate at 6.5%: what borrowers should expect',
  sourceText: SOURCE,
  focusKeyword: 'repo rate',
  seoTitle: 'RBI holds repo rate at 6.5%: what it means',
  seoDescription: 'The RBI left the repo rate unchanged at 6.5 per cent on Friday. Here is what that means for home loan borrowers and savers.',
  publisherNames: ['The Hindu'],
  currentYear: 2026,
}

test('a long, original, grounded article passes', () => {
  const r = assessArticle({ ...base, contentHtml: goodHtml() })
  assert.deepEqual(r.blocking, [])
  assert.ok(r.ok)
  assert.ok(r.wordCount >= 600, `wordCount ${r.wordCount}`)
})

test('an article under the minimum length is blocked', () => {
  const r = assessArticle({ ...base, contentHtml: `<p>The Reserve Bank of India kept its repo rate at 6.5 per cent according to The Hindu. ${filler(100, 1)}</p>` })
  assert.equal(r.ok, false)
  assert.match(r.blocking.join(' '), /at least 600/)
})

test('copied runs from the source are blocked', () => {
  const copied = 'Retail inflation stood at 4.2 per cent in October, up from 3.7 per cent a month earlier, according to government data.'
  const r = assessArticle({ ...base, contentHtml: goodHtml(`<p>${copied}</p>`) })
  assert.equal(r.ok, false)
  assert.ok(r.longestCopiedRun >= 12)
  assert.match(r.blocking.join(' '), /copied/)
})

test('figures that are not in the source are blocked, grounded ones are fine', () => {
  const bad = assessArticle({ ...base, contentHtml: goodHtml('<p>Home loan rates may fall by 0.75 per cent and 2,500 branches will close.</p>') })
  assert.equal(bad.ok, false)
  assert.ok(bad.ungroundedNumbers.includes('0.75'))
  assert.ok(bad.ungroundedNumbers.includes('2500'))
  const good = assessArticle({ ...base, contentHtml: goodHtml('<p>Growth is projected at 6.8 per cent and inflation was 4.2 per cent.</p>') })
  assert.deepEqual(good.ungroundedNumbers, [])
})

test('quotes must be word for word in the source', () => {
  const bad = assessArticle({ ...base, contentHtml: goodHtml('<p>Malhotra said, "Inflation is firmly under control and rate cuts are coming soon."</p>') })
  assert.equal(bad.ok, false)
  assert.equal(bad.unsupportedQuotes.length, 1)
  const good = assessArticle({ ...base, contentHtml: goodHtml('<p>Malhotra said, "We will remain watchful on food prices," while taking questions.</p>') })
  assert.deepEqual(good.unsupportedQuotes, [])
})

test('stock AI phrases are blocked at two hits, warned at one', () => {
  const two = assessArticle({ ...base, contentHtml: goodHtml('<p>In conclusion, only time will tell.</p>') })
  assert.equal(two.ok, false)
  const one = assessArticle({ ...base, contentHtml: goodHtml('<p>This story remains to be seen by many.</p>') })
  assert.equal(one.ok, true)
  assert.ok(one.warnings.some((w) => /Stock phrase/.test(w)))
  assert.deepEqual(aiPhraseHits('Plain direct reporting of the rate decision.'), [])
})

test('the publisher must be named near the top', () => {
  const html = goodHtml().replace('according to The Hindu, ', '')
  const r = assessArticle({ ...base, contentHtml: html })
  assert.equal(r.ok, false)
  assert.match(r.blocking.join(' '), /named in the first three paragraphs/)
})

test('weak, clickbait or all-caps headlines are blocked', () => {
  assert.equal(assessArticle({ ...base, title: 'Rate news', contentHtml: goodHtml() }).ok, false)
  assert.equal(assessArticle({ ...base, title: "You won't believe what the RBI did to your home loan today", contentHtml: goodHtml() }).ok, false)
  assert.equal(assessArticle({ ...base, title: 'RBI HOLDS REPO RATE AT 6.5% AS INFLATION RISES', contentHtml: goodHtml() }).ok, false)
})

test('focus keyword placement produces warnings, not blocks', () => {
  const r = assessArticle({ ...base, focusKeyword: 'monetary stance', contentHtml: goodHtml() })
  assert.equal(r.ok, true)
  assert.ok(r.warnings.some((w) => /headline/.test(w)))
})

test('helpers: figures, quotes, copy stats, proper nouns', () => {
  assert.deepEqual(extractFigures('3 reasons, 45 people, 6.5% and ₹1,200 crore'), ['45', '6.5', '1200'])
  assert.deepEqual(extractQuotes('He said "we will hold rates for now" and "no".'), ['we will hold rates for now'])
  assert.equal(copyStats('a b c', 'x y z').longestRun, 0)
  assert.deepEqual(ungroundedProperNouns('The rate was set by Governor Malhotra and Nirmala Zorander in Mumbai.', SOURCE), ['Nirmala', 'Zorander'])
})

test('sanitizeArticleHtml removes scripts, handlers, links and unknown tags', () => {
  const dirty = '<h1>Title</h1><p onclick="x()">Hello <a href="https://evil.example">click</a> <script>alert(1)</script><b>bold</b></p><iframe src="x"></iframe><img src=x onerror=alert(1)><div>kept text</div><h4>sub</h4>'
  const clean = sanitizeArticleHtml(dirty)
  assert.ok(!/script|onclick|onerror|iframe|href|<img|<div|<a\b/i.test(clean), clean)
  assert.ok(clean.includes('<h2>Title</h2>'))
  assert.ok(clean.includes('<strong>bold</strong>'))
  assert.ok(clean.includes('<h3>sub</h3>'))
  assert.ok(clean.includes('kept text'))
})

test('possessives, spelled-out abbreviations and allowed publisher names are not invented names', () => {
  assert.deepEqual(ungroundedProperNouns("The camp at Cox's Bazar is crowded. Karnataka's appeal failed.", 'The camp at Cox’s Bazar is crowded. Karnataka’s appeal failed.'), [])
  assert.deepEqual(ungroundedProperNouns('The United Nations court ruled.', 'The UN court ruled.'), [])
  assert.deepEqual(ungroundedProperNouns('According to The Hindu, the court ruled.', 'The court ruled.', ['The Hindu']), [])
  assert.deepEqual(ungroundedProperNouns('The rate was set by Zorander.', 'The rate was set by the bank.'), ['Zorander'])
})

test('copied passages are shown so the model knows what to rebuild', () => {
  const source = 'The Supreme Court on Friday dismissed the appeal filed by the Karnataka government against the order of the High Court on bike taxis.'
  const output = 'Officials said little. The Supreme Court on Friday dismissed the appeal filed by the Karnataka government against the order, and work continues.'
  const passages = copiedPassages(source, output)
  assert.equal(passages.length, 1)
  assert.match(passages[0], /^the supreme court on friday dismissed the appeal filed by the karnataka government against the order/)
  assert.deepEqual(copiedPassages(source, 'A completely different sentence about something else entirely, with many words in it.'), [])
})

test('headings in Title Case do not count as invented names; the copy message names the passages', () => {
  const sourceText = 'The tribunal heard the plea on Friday. The ministry said the scheme will continue for two more years and thousands of families will benefit from the new rules announced this week by officials in the capital city.'
  const body = '<p>According to The Hindu, the tribunal heard the plea on Friday.</p><h2>What The Findings Mean For Families</h2><p>The ministry said the scheme will continue for two more years and thousands of families will benefit from the new rules announced this week by officials in the capital city.</p>'
  const report = assessArticle({ title: 'Tribunal hears the plea as the ministry extends the scheme', contentHtml: body, faqs: [], sourceText, focusKeyword: 'tribunal plea', seoTitle: 'Tribunal plea', seoDescription: 'x', minWords: 5, publisherNames: ['The Hindu'] })
  assert.equal(report.ungroundedNames.includes('Findings'), false)
  assert.equal(report.ungroundedNames.includes('Hindu'), false)
  assert.ok(report.blocking.some((b) => /copied/.test(b) && /rebuild each one/.test(b)))
})

test('an article without an Analysis section is blocked, one with a thin section only warns', () => {
  const none = assessArticle({ ...base, contentHtml: goodHtml().replace('<h2>Analysis: why the timing matters</h2>', '<h2>Why the timing matters</h2>') })
  assert.equal(none.ok, false)
  assert.match(none.blocking.join(' '), /no analysis section/)
  const thin = assessArticle({ ...base, contentHtml: goodHtml().replace(/(<h2>Analysis: why the timing matters<\/h2>)<p>[\s\S]*?<\/p><p>[\s\S]*?<\/p>/, '$1<p>One point only.</p>') })
  assert.match(thin.warnings.join(' '), /analysis section has 1 point/)
  assert.ok(!thin.blocking.join(' ').includes('no analysis section'))
})

test('analysisPoints counts paragraphs and list items under the Analysis heading only', () => {
  assert.equal(analysisPoints('<p>a</p><h2>Analysis: x</h2><p>one</p><ul><li>two</li><li>three</li></ul><h2>Next</h2><p>four</p>'), 3)
  assert.equal(analysisPoints('<h2>Overview</h2><p>a</p>'), null)
  assert.equal(analysisPoints('<h2>Analysis</h2>'), 0)
})

test('sentences that start the same way in a row, and stock connectors, are flagged', () => {
  const same = 'The ministry issued the order on Friday morning. The order covers every district in the state. The officials said the rule applies from Monday. The court will hear the plea next week.'
  assert.match(repetitionIssues(same).warnings.join(' '), /4 sentences in a row begin with "the"/)
  const five = `${same} The petitioners say the order is unfair to small traders.`
  assert.match(repetitionIssues(five).blocking.join(' '), /5 sentences in a row/)
  const connectors = 'Moreover, the order covers every district in the state. Furthermore, the officials said the rule applies from Monday. Additionally, the court will hear the plea next week. Overall, traders are worried about the cost.'
  assert.match(repetitionIssues(connectors).warnings.join(' '), /stock connectors/)
  assert.deepEqual(repetitionIssues('Traders fear higher costs after the order. Officials say the rule starts on Monday. A hearing is set for next week in the High Court. Several associations have already written to the minister about it.'), { blocking: [], warnings: [] })
})

test('repeated information: one near-duplicate pair warns, two block', () => {
  const a = 'The central bank kept the repo rate unchanged at 6.5 per cent after the three day meeting in Mumbai.'
  const a2 = 'After the three day meeting in Mumbai the central bank kept the repo rate unchanged at 6.5 per cent.'
  const b = 'Retail inflation stood at 4.2 per cent in October according to government data released this week.'
  const b2 = 'Government data released this week showed retail inflation at 4.2 per cent in October.'
  assert.ok(sentenceOverlap(a, a2) >= 0.7)
  assert.equal(repetitionIssues(`${a} Borrowers see no change in monthly instalments. ${a2}`).warnings.length, 1)
  assert.match(repetitionIssues(`${a} ${b} Borrowers see no change in monthly instalments. ${a2} ${b2}`).blocking.join(' '), /repeated in different sentences/)
})

test('FAQ answers that only restate the article are flagged', () => {
  const body = 'The central bank kept the repo rate unchanged at 6.5 per cent after the three day meeting in Mumbai. Home loan borrowers will see no change in their monthly instalments for now.'
  const faqs = [
    { question: 'Did the repo rate change?', answer: 'The central bank kept the repo rate unchanged at 6.5 per cent after the three day meeting in Mumbai.' },
    { question: 'Will my EMI change?', answer: 'No. Home loan borrowers will see no change in their monthly instalments for now.' },
  ]
  assert.match(repetitionIssues(body, faqs).warnings.join(' '), /2 FAQ answers repeat/)
  assert.deepEqual(repetitionIssues(body, [{ question: 'Will my EMI change?', answer: 'No, not yet. Instalments stay as they are until the next review.' }]).warnings, [])
})
