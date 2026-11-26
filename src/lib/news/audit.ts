/**
 * Pre-publication audit. Pure: no network, no database, no clock.
 *
 * Two kinds of evidence go in:
 *  - checks the code can make by itself (copying against the reports, stock phrases, rhythm,
 *    headline and SEO rules, grammar signals, links), and
 *  - findings from a second model pass (claim by claim against the reports). Those are only
 *    accepted after they are verified here: a quoted snippet must really be in the article, and a
 *    "contradicted" or "misattributed" verdict must carry evidence that really is in the reports,
 *    otherwise it is downgraded to "unsupported". The model can never add a fact, a quotation or a
 *    source to the article through the audit.
 *
 * Honest limits, repeated in the result so the admin screen never over-claims:
 *  - facts are checked against the publisher reports the article was written from, not the wider web;
 *  - similarity is measured against those reports only (`webWide` is always "Unverified");
 *  - the AI-style level is a writing-style indicator, never a statement about who wrote the text.
 */
import {
  aiPhraseHits,
  analysisPoints,
  CLICKBAIT_RE,
  contentWords,
  copiedPassages,
  extractFigures,
  extractQuotes,
  figureSet,
  htmlToText,
  repetitionIssues,
  sentenceLengthSpread,
  sentencesOf,
  wordsOf,
  type QualityReport,
} from './quality'

export type Level = 'Low' | 'Medium' | 'High'
export type Decision = 'PUBLISH' | 'IMPROVE' | 'HOLD'
export type ClaimStatus = 'supported' | 'unsupported' | 'contradicted' | 'misattributed'

export interface LlmClaim {
  /** The claim in plain words. */
  claim: string
  /** Exact words from the article that make the claim (must be found in the article). */
  snippet: string
  status: ClaimStatus
  /** Exact words from the reports that settle it (required for contradicted / misattributed). */
  evidence?: string
}

export interface LlmFindings {
  claims: LlmClaim[]
  aiStyle: { signal: string; snippet: string }[]
  weak: { snippet: string; problem: string; fix: string }[]
  /** Ways to add reader value that only use facts from the reports. */
  originality: string[]
  seo: { title: string; description: string } | null
}

/** Weights of the overall score (sum 100). */
export const WEIGHTS = { facts: 30, plagiarism: 15, aiStyle: 15, seo: 10, discover: 10, eeat: 10, grammar: 5, originality: 5 } as const

export const OVERALL_IMPROVE_BELOW = 65

export interface AuditInput {
  title: string
  contentHtml: string
  faqs?: { question: string; answer: string }[]
  /** Full text of the reports the article was written from. */
  sourceText: string
  publisherNames: string[]
  seoTitle?: string
  seoDescription?: string
  focusKeyword?: string
  /** What the quality check found (figures, quotations and names not in the reports). */
  quality: Pick<QualityReport, 'ungroundedNumbers' | 'unsupportedQuotes' | 'ungroundedNames' | 'copiedRatio' | 'longestCopiedRun'>
  /** Verified model findings, or null when the model pass did not run or failed. */
  llm: LlmFindings | null
  /** Known only after the article is assembled. */
  links?: { internal: number; external: number; documents: number }
  /** Known only after the cover is chosen. */
  cover?: { kind: 'commons' | 'publisher' | 'generated' | 'none'; alt?: string | null }
  author?: { name: string; hasBio: boolean }
}

export interface Check {
  id: string
  label: string
  pass: boolean
  weight: number
  /** Not known yet (for example links before the article is assembled): left out of the score. */
  applicable: boolean
}

export interface AuditResult {
  score: number
  decision: Decision
  /** Why the decision is not PUBLISH. */
  reasons: string[]
  aiStyle: { level: Level; signals: string[]; note: string }
  plagiarism: { level: Level; scope: string; longestRun: number; copiedRatio: number; passages: string[]; webWide: 'Unverified' }
  facts: {
    assessment: string
    llmChecked: boolean
    supported: number
    unsupported: LlmClaim[]
    contradicted: LlmClaim[]
    misattributed: LlmClaim[]
    scope: string
  }
  seo: { score: number; issues: string[]; improved: { title: string; description: string } | null }
  discover: { score: number; readiness: 'Ready' | 'Needs work' | 'Not ready' | 'Pending'; issues: string[] }
  eeat: { score: number; issues: string[] }
  grammar: { score: number; issues: string[] }
  originality: { score: number; issues: string[]; ideas: string[] }
  /** Paragraphs that need work, with the problem and (when the model gave one that passed the checks) a fix. */
  paragraphs: { snippet: string; problem: string; fix?: string }[]
  corrections: string[]
  /** Points earned per part of the score. */
  breakdown: Record<keyof typeof WEIGHTS, { points: number; max: number }>
  /** Checks that could not be made (model pass failed, cover or links not known yet, ...). */
  partial: string[]
}

// ---------------------------------------------------------------------------------------------
// Verifying what the model said

function norm(text: string): string {
  return wordsOf(text).join(' ')
}

function contains(haystackNorm: string, needle: string): boolean {
  const n = norm(needle)
  return n.length >= 8 && haystackNorm.includes(n)
}

/** Share of the content words of `text` that occur in the reports (0 to 1). */
function sourceCoverage(text: string, sourceWords: Set<string>): number {
  const words = [...contentWords(text)]
  if (words.length === 0) return 0
  return words.filter((w) => sourceWords.has(w)).length / words.length
}

/**
 * Keeps only what can be checked. A snippet that is not in the article is dropped (the model made it
 * up or misquoted). Contradicted and misattributed verdicts need evidence that is in the reports.
 * An "unsupported" claim whose words and figures are all in the reports is treated as supported:
 * the model only failed to match it.
 */
export function verifyFindings(raw: LlmFindings | null, articleText: string, sourceText: string): LlmFindings | null {
  if (!raw) return null
  const articleNorm = norm(articleText)
  const sourceNorm = norm(sourceText)
  const sourceWords = new Set(wordsOf(sourceText))
  const sourceFigures = figureSet(sourceText)
  const articleFigures = figureSet(articleText)

  const claims: LlmClaim[] = []
  for (const c of raw.claims) {
    if (!contains(articleNorm, c.snippet)) continue
    let status = c.status
    if ((status === 'contradicted' || status === 'misattributed') && !(c.evidence && contains(sourceNorm, c.evidence))) status = 'unsupported'
    if (status === 'unsupported') {
      const figs = extractFigures(c.snippet)
      if (figs.every((f) => sourceFigures.has(f)) && sourceCoverage(c.snippet, sourceWords) >= 0.9) status = 'supported'
    }
    claims.push({ ...c, status })
  }

  const aiStyle = raw.aiStyle.filter((s) => contains(articleNorm, s.snippet))
  const weak = raw.weak
    .filter((w) => contains(articleNorm, w.snippet))
    // A suggested fix may not bring in a figure that is in neither the reports nor the article.
    .map((w) => (extractFigures(w.fix).every((f) => sourceFigures.has(f) || articleFigures.has(f)) ? w : { ...w, fix: '' }))
  const originality = raw.originality.filter((o) => extractFigures(o).every((f) => sourceFigures.has(f) || articleFigures.has(f))).slice(0, 4)

  let seo = raw.seo
  if (seo) {
    const figs = extractFigures(`${seo.title} ${seo.description}`)
    const ok = figs.every((f) => sourceFigures.has(f) || articleFigures.has(f))
    seo = ok && seo.title.length >= 20 && seo.title.length <= 65 && seo.description.length >= 100 && seo.description.length <= 160 ? seo : null
  }
  return { claims, aiStyle, weak, originality, seo }
}

// ---------------------------------------------------------------------------------------------
// Individual checks

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return shared / (a.size + b.size - shared)
}

/** Article sentences that stay very close to one sentence of the reports (same content words, different order). */
export function closeParaphrases(articleText: string, sourceText: string, threshold = 0.7): string[] {
  const src = sentencesOf(sourceText).map(contentWords).filter((s) => s.size >= 6)
  const found: string[] = []
  for (const sentence of sentencesOf(articleText)) {
    const words = contentWords(sentence)
    if (words.size < 6) continue
    if (src.some((s) => jaccard(words, s) >= threshold)) found.push(sentence)
  }
  return found
}

function snippetOf(text: string, words = 14): string {
  const w = text.split(/\s+/)
  return w.length > words ? `${w.slice(0, words).join(' ')} …` : text
}

function paragraphsOf(html: string): string[] {
  return (html.match(/<p\b[\s\S]*?<\/p>/gi) || []).map((p) => htmlToText(p)).filter(Boolean)
}

function assessPlagiarism(articleText: string, sourceText: string, quality: AuditInput['quality']): AuditResult['plagiarism'] & { close: string[] } {
  const close = closeParaphrases(articleText, sourceText)
  const { longestCopiedRun: run, copiedRatio: ratio } = quality
  let level: Level = 'Low'
  if (run >= 14 || ratio >= 0.12) level = 'High'
  else if (run >= 9 || ratio >= 0.05 || close.length >= 3) level = 'Medium'
  const passages = [...copiedPassages(sourceText, articleText, 3), ...close.slice(0, 3).map((s) => snippetOf(s, 16))].slice(0, 5)
  return {
    level,
    scope: 'Compared only with the publisher reports the article was written from; the wider web was not searched.',
    longestRun: run,
    copiedRatio: ratio,
    passages,
    webWide: 'Unverified',
    close,
  }
}

function assessAiStyle(bodyText: string, html: string, llm: LlmFindings | null): AuditResult['aiStyle'] {
  const signals: string[] = []
  let points = 0
  const phrases = aiPhraseHits(bodyText)
  if (phrases.length) {
    points += phrases.length * 2
    signals.push(`Stock phrases: ${phrases.join('; ')}.`)
  }
  const rep = repetitionIssues(bodyText)
  for (const w of rep.warnings) {
    points += 1
    signals.push(w)
  }
  for (const b of rep.blocking) {
    points += 3
    signals.push(b)
  }
  const spread = sentenceLengthSpread(bodyText)
  if (spread < 4) {
    points += 2
    signals.push('Sentence lengths are almost uniform.')
  } else if (spread < 5) {
    points += 1
    signals.push('Sentence lengths vary little.')
  }
  const lens = paragraphsOf(html).map((p) => wordsOf(p).length)
  if (lens.length >= 6) {
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length)
    if (mean > 0 && sd / mean < 0.15) {
      points += 1
      signals.push('Paragraphs are all nearly the same length.')
    }
  }
  const modelSignals = llm?.aiStyle ?? []
  for (const s of modelSignals.slice(0, 3)) {
    points += 1
    signals.push(`${s.signal} ("${snippetOf(s.snippet, 10)}")`)
  }
  const level: Level = points >= 6 ? 'High' : points >= 3 ? 'Medium' : 'Low'
  return { level, signals, note: 'A writing-style indicator only. It says nothing about who or what wrote the text.' }
}

function assessGrammar(bodyText: string, html: string): { score: number; issues: string[] } {
  const issues: string[] = []
  let score = 100
  const sentences = bodyText.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean)
  const lens = sentences.map((s) => wordsOf(s).length).filter((n) => n > 0)
  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0
  if (avg > 35) {
    score -= 20
    issues.push(`Sentences average ${avg.toFixed(0)} words; aim for 18 to 24.`)
  } else if (avg > 28) {
    score -= 10
    issues.push(`Sentences average ${avg.toFixed(0)} words; aim for 18 to 24.`)
  }
  const long = sentences.filter((s) => wordsOf(s).length > 55)
  if (long.length) {
    score -= Math.min(20, long.length * 5)
    issues.push(`${long.length} sentence(s) longer than 55 words, for example "${snippetOf(long[0], 10)}".`)
  }
  const bigParas = paragraphsOf(html).filter((p) => wordsOf(p).length > 130)
  if (bigParas.length) {
    score -= Math.min(15, bigParas.length * 5)
    issues.push(`${bigParas.length} paragraph(s) longer than 130 words; split them.`)
  }
  const stray = bodyText.match(/,,|\.\.(?!\.)|\s[,.;:](?=\s|$)/g) || []
  if (stray.length) {
    score -= Math.min(10, stray.length * 5)
    issues.push('Stray punctuation or spacing.')
  }
  const repeated = [...bodyText.matchAll(/\b([A-Za-z]{2,})\s+\1\b/gi)].filter((m) => !/^(had|that|is)$/i.test(m[1]))
  if (repeated.length) {
    score -= Math.min(15, repeated.length * 5)
    issues.push(`A word is doubled: "${repeated[0][0]}".`)
  }
  const quoteMarks = (bodyText.match(/["“”]/g) || []).length
  if (quoteMarks % 2 === 1) {
    score -= 10
    issues.push('A quotation mark is not closed.')
  }
  const lower = sentences.filter((s) => /^[a-z]/.test(s))
  if (lower.length) {
    score -= Math.min(10, lower.length * 5)
    issues.push(`A sentence starts with a lower-case letter: "${snippetOf(lower[0], 8)}".`)
  }
  return { score: Math.max(0, score), issues }
}

function scoreChecks(checks: Check[]): number {
  const live = checks.filter((c) => c.applicable)
  const possible = live.reduce((n, c) => n + c.weight, 0)
  if (possible === 0) return 0
  return Math.round((100 * live.filter((c) => c.pass).reduce((n, c) => n + c.weight, 0)) / possible)
}

function assessSeo(input: AuditInput, wordCount: number, faqs: number): { score: number; issues: string[] } {
  const kw = (input.focusKeyword || '').trim().toLowerCase()
  const title = input.title.trim()
  const seoTitle = (input.seoTitle || '').trim()
  const desc = (input.seoDescription || '').trim()
  const firstPara = (paragraphsOf(input.contentHtml)[0] || '').toLowerCase()
  const h2s = (input.contentHtml.match(/<h2\b/gi) || []).length
  const checks: Check[] = [
    { id: 'headline-length', label: 'Headline is 40 to 70 characters', pass: title.length >= 40 && title.length <= 70, weight: 10, applicable: true },
    { id: 'kw-title', label: 'Focus keyword is in the headline', pass: !!kw && title.toLowerCase().includes(kw), weight: 10, applicable: true },
    { id: 'seo-title', label: 'SEO title is 60 characters or fewer and has the keyword', pass: !!seoTitle && seoTitle.length <= 60 && (!kw || seoTitle.toLowerCase().includes(kw)), weight: 15, applicable: true },
    { id: 'meta', label: 'Meta description is 120 to 160 characters and has the keyword', pass: desc.length >= 120 && desc.length <= 160 && (!kw || desc.toLowerCase().includes(kw)), weight: 15, applicable: true },
    { id: 'kw-first', label: 'Focus keyword is in the first paragraph', pass: !!kw && firstPara.includes(kw), weight: 10, applicable: true },
    { id: 'headings', label: 'At least two subheadings', pass: h2s >= 2, weight: 10, applicable: true },
    { id: 'length', label: 'Body of 600 words or more', pass: wordCount >= 600, weight: 5, applicable: true },
    { id: 'faq', label: 'At least two FAQs', pass: faqs >= 2, weight: 10, applicable: true },
    { id: 'internal', label: 'Links to related articles on the site', pass: (input.links?.internal ?? 0) >= 1, weight: 10, applicable: !!input.links },
    { id: 'external', label: 'Links to the publishers', pass: (input.links?.external ?? 0) >= 1, weight: 5, applicable: !!input.links },
    { id: 'alt', label: 'Cover image has alt text', pass: !!input.cover?.alt && input.cover.alt.trim().length > 5, weight: 5, applicable: !!input.cover },
  ]
  return { score: scoreChecks(checks), issues: checks.filter((c) => c.applicable && !c.pass).map((c) => c.label) }
}

function assessDiscover(input: AuditInput, wordCount: number, analysis: number | null): AuditResult['discover'] {
  const title = input.title.trim()
  const hasHook = /\d/.test(title) || /\b[A-Z][a-z]{2,}/.test(title.slice(1))
  const kind = input.cover?.kind
  const checks: Check[] = [
    { id: 'headline', label: 'Headline is clear and 40 to 80 characters', pass: title.length >= 40 && title.length <= 80, weight: 20, applicable: true },
    { id: 'hook', label: 'Headline names something concrete (a person, place, organisation or figure)', pass: hasHook, weight: 15, applicable: true },
    { id: 'no-bait', label: 'No clickbait wording', pass: !CLICKBAIT_RE.test(title) && !/^[A-Z0-9\s\W]+$/.test(title), weight: 10, applicable: true },
    { id: 'cover', label: 'The story has a cover image', pass: !!kind && kind !== 'none', weight: 8, applicable: !!input.cover },
    { id: 'photo', label: 'The cover is a real photograph, not an AI illustration', pass: kind === 'commons' || kind === 'publisher', weight: 17, applicable: !!input.cover },
    { id: 'alt', label: 'Cover has descriptive alt text', pass: !!input.cover?.alt && input.cover.alt.trim().length > 5, weight: 5, applicable: !!input.cover },
    { id: 'depth', label: 'At least 700 words', pass: wordCount >= 700, weight: 15, applicable: true },
    { id: 'analysis', label: 'Own analysis, not only a rewrite', pass: (analysis ?? 0) >= 2, weight: 10, applicable: true },
  ]
  const score = scoreChecks(checks)
  const readiness: AuditResult['discover']['readiness'] = !input.cover ? 'Pending' : score >= 75 ? 'Ready' : score >= 50 ? 'Needs work' : 'Not ready'
  return { score, readiness, issues: checks.filter((c) => c.applicable && !c.pass).map((c) => c.label) }
}

function assessEeat(input: AuditInput, articleText: string, quotes: number): { score: number; issues: string[] } {
  const lower = articleText.toLowerCase()
  const named = input.publisherNames.filter((n) => lower.includes(n.toLowerCase()))
  const attributions = (articleText.match(/\b(said|according to|told|reported|stated|announced|confirmed|wrote)\b/gi) || []).length
  const official = quotes >= 1 || /\b(in a statement|press release|official statement|said in a)\b/i.test(articleText)
  const checks: Check[] = [
    { id: 'publishers', label: 'Two or more trusted publishers are named', pass: named.length >= Math.min(2, Math.max(1, input.publisherNames.length)), weight: 25, applicable: true },
    { id: 'attribution', label: 'Key facts are attributed (said, according to, reported)', pass: attributions >= 3, weight: 15, applicable: true },
    { id: 'statement', label: 'Includes an official statement or a direct quotation', pass: official, weight: 15, applicable: true },
    { id: 'documents', label: 'Links to an official document or primary source', pass: (input.links?.documents ?? 0) >= 1, weight: 15, applicable: !!input.links },
    { id: 'sources', label: 'Sources are listed at the end with links', pass: (input.links?.external ?? 0) >= 1, weight: 15, applicable: !!input.links },
    { id: 'credit', label: 'The cover image is credited or labelled', pass: input.cover?.kind !== 'none', weight: 5, applicable: !!input.cover },
    { id: 'author', label: 'The author has a public profile with a bio', pass: !!input.author?.hasBio, weight: 10, applicable: !!input.author },
  ]
  return { score: scoreChecks(checks), issues: checks.filter((c) => c.applicable && !c.pass).map((c) => c.label) }
}

function assessOriginality(input: AuditInput, analysis: number | null, close: number, faqs: number, llm: LlmFindings | null): AuditResult['originality'] {
  const paras = paragraphsOf(input.contentHtml).length
  const h2s = (input.contentHtml.match(/<h2\b/gi) || []).length
  const repetitionInFaqs = repetitionIssues(htmlToText(input.contentHtml), input.faqs ?? []).warnings.some((w) => /FAQ/.test(w))
  const checks: Check[] = [
    { id: 'analysis', label: 'Has an analysis section with two or more points', pass: (analysis ?? 0) >= 2, weight: 40, applicable: true },
    { id: 'wording', label: 'Wording is the writer’s own (little overlap with the reports)', pass: input.quality.copiedRatio < 0.03, weight: 20, applicable: true },
    { id: 'context', label: 'Goes beyond the lead: several sections and paragraphs', pass: paras >= 6 && h2s >= 2, weight: 15, applicable: true },
    { id: 'faq', label: 'FAQs answer real questions without restating the article', pass: faqs >= 2 && !repetitionInFaqs, weight: 15, applicable: true },
    { id: 'paraphrase', label: 'Few sentences stay close to one report sentence', pass: close < 3, weight: 10, applicable: true },
  ]
  return { score: scoreChecks(checks), issues: checks.filter((c) => !c.pass).map((c) => c.label), ideas: llm?.originality ?? [] }
}

// ---------------------------------------------------------------------------------------------
// The audit

const AI_POINTS: Record<Level, number> = { Low: 100, Medium: 60, High: 20 }
const PLAGIARISM_POINTS: Record<Level, number> = { Low: 100, Medium: 55, High: 10 }

export function auditArticle(input: AuditInput): AuditResult {
  const bodyText = htmlToText(input.contentHtml)
  const faqs = input.faqs ?? []
  const faqText = faqs.map((f) => `${f.question} ${f.answer}`).join('\n')
  const articleText = `${bodyText}\n${faqText}`
  const wordCount = wordsOf(bodyText).length
  const analysis = analysisPoints(input.contentHtml)
  const quotes = extractQuotes(bodyText).length
  const llm = input.llm
  const partial: string[] = []
  const checked = !!llm && llm.claims.length > 0
  if (!checked) partial.push(llm ? 'The model check returned no claims to compare, so only the code checks were made.' : 'The claim-by-claim model check did not run, so only the code checks were made.')
  if (!input.links) partial.push('Links were not known yet.')
  if (!input.cover) partial.push('The cover image was not chosen yet.')

  // Facts ------------------------------------------------------------------------------------
  const claims = llm?.claims ?? []
  const unsupported = claims.filter((c) => c.status === 'unsupported')
  const contradicted = claims.filter((c) => c.status === 'contradicted')
  const misattributed = claims.filter((c) => c.status === 'misattributed')
  const supported = claims.filter((c) => c.status === 'supported').length
  const q = input.quality
  let facts = 100
  facts -= 25 * unsupported.length
  facts -= 50 * (contradicted.length + misattributed.length)
  facts -= 20 * (q.ungroundedNumbers.length + q.unsupportedQuotes.length)
  facts -= 8 * Math.max(0, q.ungroundedNames.length - 2)
  if (!checked) facts = Math.min(facts, 85)
  facts = Math.max(0, facts)
  const assessment =
    contradicted.length + misattributed.length > 0
      ? 'A claim is contradicted or wrongly attributed according to the reports.'
      : unsupported.length > 0
        ? `${unsupported.length} claim${unsupported.length > 1 ? 's' : ''} could not be matched to the reports.`
        : q.ungroundedNumbers.length + q.unsupportedQuotes.length > 0
          ? 'A figure or quotation is not in the reports.'
          : checked
            ? `All ${supported} checked claims match the reports.`
            : 'Figures, quotations and names match the reports; the claim-by-claim check was not available.'

  // The rest ---------------------------------------------------------------------------------
  const plag = assessPlagiarism(articleText, input.sourceText, q)
  const ai = assessAiStyle(bodyText, input.contentHtml, llm)
  const seo = assessSeo(input, wordCount, faqs.length)
  const discover = assessDiscover(input, wordCount, analysis)
  const eeat = assessEeat(input, articleText, quotes)
  const grammar = assessGrammar(bodyText, input.contentHtml)
  const originality = assessOriginality(input, analysis, plag.close.length, faqs.length, llm)

  const plagScore = plag.level === 'Low' ? Math.max(70, 100 - Math.round(plag.copiedRatio * 200)) : PLAGIARISM_POINTS[plag.level]
  const aiScore = ai.level === 'Low' ? Math.max(75, 100 - ai.signals.length * 5) : AI_POINTS[ai.level]
  const part = (score: number, key: keyof typeof WEIGHTS) => ({ points: Math.round((score * WEIGHTS[key]) / 100), max: WEIGHTS[key] })
  const breakdown = {
    facts: part(facts, 'facts'),
    plagiarism: part(plagScore, 'plagiarism'),
    aiStyle: part(aiScore, 'aiStyle'),
    seo: part(seo.score, 'seo'),
    discover: part(discover.score, 'discover'),
    eeat: part(eeat.score, 'eeat'),
    grammar: part(grammar.score, 'grammar'),
    originality: part(originality.score, 'originality'),
  }
  const score = Object.values(breakdown).reduce((n, b) => n + b.points, 0)

  // Decision ---------------------------------------------------------------------------------
  const hold: string[] = []
  const improve: string[] = []
  if (contradicted.length) hold.push(`The reports contradict: "${snippetOf(contradicted[0].snippet, 12)}".`)
  if (misattributed.length) hold.push(`Wrongly attributed according to the reports: "${snippetOf(misattributed[0].snippet, 12)}".`)
  if (unsupported.length >= 2) hold.push(`${unsupported.length} claims could not be matched to the reports (for example "${snippetOf(unsupported[0].snippet, 12)}").`)
  if (q.ungroundedNumbers.length + q.unsupportedQuotes.length > 0) hold.push('A figure or quotation is not in the reports.')
  if (plag.level === 'High') hold.push('Too much of the wording matches the reports.')
  if (unsupported.length === 1) improve.push(`One claim could not be matched to the reports: "${snippetOf(unsupported[0].snippet, 12)}".`)
  if (ai.level === 'High') improve.push('The writing shows many machine-like style signals.')
  if (plag.level === 'Medium') improve.push('Several passages stay close to the reports’ wording.')
  if (grammar.score < 60) improve.push('Grammar and readability need work.')
  if (score < OVERALL_IMPROVE_BELOW) improve.push(`The overall score is ${score}/100 (below ${OVERALL_IMPROVE_BELOW}).`)
  const decision: Decision = hold.length ? 'HOLD' : improve.length ? 'IMPROVE' : 'PUBLISH'

  // What to fix ------------------------------------------------------------------------------
  const paragraphs: AuditResult['paragraphs'] = [
    ...(llm?.weak ?? []).map((w) => ({ snippet: snippetOf(w.snippet, 14), problem: w.problem, fix: w.fix || undefined })),
    ...plag.close.slice(0, 2).map((s) => ({ snippet: snippetOf(s, 14), problem: 'Stays very close to one sentence of a report.' })),
  ].slice(0, 6)
  const corrections: string[] = [
    ...contradicted.map((c) => `Correct: "${snippetOf(c.snippet, 14)}". The reports say: "${snippetOf(c.evidence ?? '', 20)}".`),
    ...misattributed.map((c) => `Fix the attribution: "${snippetOf(c.snippet, 14)}". The reports say: "${snippetOf(c.evidence ?? '', 20)}".`),
    ...unsupported.map((c) => `Remove or restate only what the reports say: "${snippetOf(c.snippet, 14)}".`),
    ...ai.signals.slice(0, 4),
    ...grammar.issues,
    ...seo.issues.map((i) => `SEO: ${i}.`),
  ].slice(0, 12)

  return {
    score,
    decision,
    reasons: [...hold, ...improve],
    aiStyle: ai,
    plagiarism: { level: plag.level, scope: plag.scope, longestRun: plag.longestRun, copiedRatio: plag.copiedRatio, passages: plag.passages, webWide: plag.webWide },
    facts: { assessment, llmChecked: checked, supported, unsupported, contradicted, misattributed, scope: 'Checked against the publisher reports the article was written from, not independently against other sources.' },
    seo: { score: seo.score, issues: seo.issues, improved: llm?.seo ?? null },
    discover: { score: discover.score, readiness: discover.readiness, issues: discover.issues },
    eeat,
    grammar,
    originality,
    paragraphs,
    corrections,
    breakdown,
    partial,
  }
}

/** The problems to give the writer on a retry: specific, short, and only what the reports allow. */
export function retryIssues(audit: AuditResult): string[] {
  const out: string[] = []
  for (const c of audit.facts.contradicted) out.push(`The reports contradict this sentence: "${snippetOf(c.snippet, 25)}". The reports say: "${snippetOf(c.evidence ?? '', 30)}". Correct it.`)
  for (const c of audit.facts.misattributed) out.push(`Wrong attribution in: "${snippetOf(c.snippet, 25)}". The reports say: "${snippetOf(c.evidence ?? '', 30)}". Attribute it correctly.`)
  for (const c of audit.facts.unsupported) out.push(`Not in the reports: "${snippetOf(c.snippet, 25)}". Remove it, or say only what the reports say.`)
  if (audit.plagiarism.level !== 'Low' && audit.plagiarism.passages.length) out.push(`Too close to the reports’ wording: ${audit.plagiarism.passages.map((p) => `"${p}"`).join('; ')}. Rebuild these sentences from a different starting point.`)
  if (audit.aiStyle.level !== 'Low') out.push(...audit.aiStyle.signals.slice(0, 3).map((s) => `Style: ${s}`))
  for (const w of audit.paragraphs.slice(0, 3)) if (w.fix) out.push(`Improve "${w.snippet}": ${w.problem} ${w.fix}`)
  if (audit.grammar.score < 60) out.push(...audit.grammar.issues.slice(0, 2))
  return out.slice(0, 8)
}

export interface AuditSummary {
  score: number
  decision: Decision
  aiStyle: Level
  plagiarism: Level
  discover: AuditResult['discover']['readiness']
  seo: number
  facts: string
  reasons: string[]
  partial: string[]
}

export function summarizeAudit(a: AuditResult): AuditSummary {
  return {
    score: a.score,
    decision: a.decision,
    aiStyle: a.aiStyle.level,
    plagiarism: a.plagiarism.level,
    discover: a.discover.readiness,
    seo: a.seo.score,
    facts: a.facts.assessment,
    reasons: a.reasons.slice(0, 4),
    partial: a.partial,
  }
}

/** Better of two audits of the same story: a lower-risk decision wins, then the higher score. */
export function betterAudit(a: AuditResult, b: AuditResult): AuditResult {
  const rank: Record<Decision, number> = { PUBLISH: 0, IMPROVE: 1, HOLD: 2 }
  if (rank[a.decision] !== rank[b.decision]) return rank[a.decision] < rank[b.decision] ? a : b
  return a.score >= b.score ? a : b
}

// ---------------------------------------------------------------------------------------------
// Mode and SEO choice

/** `enforce`: a failed audit retries once and then holds the article as a draft (see `auditHoldReason` for which verdicts hold). `log`: audit and record, never block. `off`: no audit. */
export type AuditMode = 'enforce' | 'log' | 'off'

export function parseAuditMode(value: string | undefined | null): AuditMode {
  const v = (value ?? '').trim().toLowerCase()
  return v === 'log' || v === 'off' ? v : 'enforce'
}

/**
 * Why an audited draft goes to the drafts folder instead of being published (null = it goes live).
 *
 * Owner decision 26 Nov 2026: only a HOLD stops an article. On 26 Nov strict enforcement (every IMPROVE
 * held) kept 13 of 15 scheduled runs from publishing, almost all because "several passages stay close to
 * the reports' wording" (Medium copying risk); an IMPROVE has already been rewritten once with the audit's
 * fixes by the time this is asked, so the better draft is published. Two IMPROVE cases still hold, because
 * they are about whether the facts are right and not about style: a claim the reports do not contain, and
 * an overall score under `OVERALL_IMPROVE_BELOW`.
 */
export function auditHoldReason(audit: AuditResult | null, mode: AuditMode): string | null {
  if (!audit || mode !== 'enforce' || audit.decision === 'PUBLISH') return null
  const factDoubt = audit.facts.unsupported.length > 0
  const tooLow = audit.score < OVERALL_IMPROVE_BELOW
  if (audit.decision === 'IMPROVE' && !factDoubt && !tooLow) return null
  return `pre-publication audit ${audit.decision} (${audit.score}/100): ${audit.reasons.slice(0, 2).join(' ')}`
}

export function seoFieldsOk(seoTitle: string, seoDescription: string, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  const t = seoTitle.trim()
  const d = seoDescription.trim()
  return t.length > 0 && t.length <= 60 && d.length >= 120 && d.length <= 160 && (!kw || (t.toLowerCase().includes(kw) && d.toLowerCase().includes(kw)))
}

/**
 * The SEO title and description to store: the writer's own, unless they fail the rules and the
 * (already verified) improved pair passes them.
 */
export function chooseSeo(
  current: { seoTitle: string; seoDescription: string },
  improved: { title: string; description: string } | null | undefined,
  keyword: string,
): { seoTitle: string; seoDescription: string; replaced: boolean } {
  if (seoFieldsOk(current.seoTitle, current.seoDescription, keyword)) return { ...current, replaced: false }
  if (improved && seoFieldsOk(improved.title, improved.description, keyword)) return { seoTitle: improved.title, seoDescription: improved.description, replaced: true }
  return { ...current, replaced: false }
}
