/**
 * Quality and safety gates for AI-rewritten news articles. Pure (no network) and unit-tested.
 *
 * The model only ever sees the publishers' reports, so every checkable fact in its output must be
 * traceable to that text. These checks are deliberately mechanical so they do not depend on the
 * model grading itself:
 *   - length: at least `minWords` words in the body
 *   - copying: no long runs of words lifted from the source (the article must be in our own words)
 *   - grounding: figures and quotation marks must appear in the source text
 *   - style: stock "AI voice" phrases, flat sentence rhythm
 *   - SEO: title length, focus keyword placement
 * Issues are either `blocking` (the article is retried, then rejected) or `warnings`.
 */

export const MIN_WORDS_DEFAULT = 600

export interface QualityInput {
  title: string
  contentHtml: string
  faqs?: { question: string; answer: string }[]
  /** Concatenated full text of every source report the model was given. */
  sourceText: string
  focusKeyword?: string
  seoTitle?: string
  seoDescription?: string
  minWords?: number
  /** Current year, allowed in the text even when the source does not state it. */
  currentYear?: number
  /** Publishers the story came from; at least one must be named near the top of the article. */
  publisherNames?: string[]
}

export interface QualityReport {
  ok: boolean
  wordCount: number
  blocking: string[]
  warnings: string[]
  copiedRatio: number
  longestCopiedRun: number
  ungroundedNumbers: string[]
  unsupportedQuotes: string[]
  ungroundedNames: string[]
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|blockquote|div|ul|ol)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

export function wordCountOf(text: string): number {
  const t = text.trim()
  if (!t) return 0
  return t.split(/\s+/).filter((w) => /[A-Za-z0-9ऀ-ॿ]/.test(w)).length
}

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9ऀ-ॿ'\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

const QUOTE_RE = /[“"]([^“”"]{12,400})[”"]/g

/** Quoted passages of 4+ words (attributed speech). */
export function extractQuotes(text: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(QUOTE_RE.source, 'g')
  while ((m = re.exec(text))) {
    if (wordsOf(m[1]).length >= 4) out.push(m[1].trim())
  }
  return out
}

function withoutQuotes(text: string): string {
  return text.replace(new RegExp(QUOTE_RE.source, 'g'), ' ')
}

const NGRAM = 8

export function copyStats(sourceText: string, outputText: string): { copiedRatio: number; longestRun: number } {
  const src = wordsOf(sourceText)
  const out = wordsOf(withoutQuotes(outputText))
  if (out.length < NGRAM || src.length < NGRAM) return { copiedRatio: 0, longestRun: 0 }
  const grams = new Set<string>()
  for (let i = 0; i + NGRAM <= src.length; i++) grams.add(src.slice(i, i + NGRAM).join(' '))
  const covered = new Array<boolean>(out.length).fill(false)
  let longest = 0
  let run = 0
  for (let i = 0; i + NGRAM <= out.length; i++) {
    if (grams.has(out.slice(i, i + NGRAM).join(' '))) {
      for (let k = i; k < i + NGRAM; k++) covered[k] = true
      run++
      longest = Math.max(longest, run + NGRAM - 1)
    } else {
      run = 0
    }
  }
  const copied = covered.filter(Boolean).length
  return { copiedRatio: copied / out.length, longestRun: longest }
}

/** Figures worth verifying: 2+ digit numbers, decimals and percentages. Small plain counts (1-12) are ignored. */
export function extractFigures(text: string): string[] {
  const found = new Set<string>()
  const re = /(?:[$₹€£]\s?)?\d[\d,]*(?:\.\d+)?\s?%?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const raw = m[0]
    const pct = /%/.test(raw)
    const digits = raw.replace(/[^\d.]/g, '')
    if (!digits) continue
    const isDecimal = digits.includes('.')
    const int = parseFloat(digits)
    if (!pct && !isDecimal && int <= 12) continue
    found.add(digits.replace(/\.0+$/, ''))
  }
  return [...found]
}

function figureSet(text: string): Set<string> {
  const set = new Set<string>()
  const re = /\d[\d,]*(?:\.\d+)?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const n = m[0].replace(/,/g, '').replace(/\.0+$/, '')
    set.add(n)
  }
  return set
}

const MONTHS = new Set(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'])
const COMMON_CAPS = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'india', 'indian', 'indians', 'newsedition',
  'the', 'this', 'that', 'these', 'those', 'there', 'here', 'what', 'why', 'how', 'when', 'where', 'who', 'while', 'with',
  'for', 'and', 'but', 'its', 'his', 'her', 'their', 'our', 'after', 'before', 'during', 'also', 'still', 'yet', 'now',
  'if', 'as', 'at', 'in', 'on', 'of', 'to', 'by', 'from', 'both', 'each', 'some', 'many', 'most', 'one', 'two', 'three',
  'government', 'minister', 'court', 'police', 'party', 'state', 'centre', 'union', 'prime', 'chief', 'supreme', 'high',
  'english', 'hindi', 'faq', 'q', 'a', 'no', 'yes', 'not', 'however', 'meanwhile', 'instead', 'for',
])

/** Capitalised words in mid-sentence (names of people, places, organisations) that never appear in the source. */
export function ungroundedProperNouns(outputText: string, sourceText: string, extraAllowed: string[] = []): string[] {
  const srcWords = new Set(wordsOf(sourceText))
  const allowed = new Set([...extraAllowed.flatMap((s) => wordsOf(s))])
  const found = new Set<string>()
  const sentences = outputText.split(/(?<=[.!?])\s+|\n+/)
  for (const s of sentences) {
    const tokens = s.split(/\s+/)
    for (let i = 1; i < tokens.length; i++) {
      const w = tokens[i].replace(/^[("'“‘]+|[)"'”’.,;:!?]+$/g, '').replace(/['’]s$/, '')
      if (!/^[A-Z][a-zA-Z]{2,}$/.test(w)) continue
      const lw = w.toLowerCase()
      if (MONTHS.has(lw) || COMMON_CAPS.has(lw) || allowed.has(lw) || srcWords.has(lw)) continue
      found.add(w)
    }
  }
  return [...found]
}

export const AI_PHRASES: RegExp[] = [
  /\bin today'?s (fast[- ]paced|digital|ever[- ]changing|rapidly)/i,
  /\bit(?:'s| is) (important|worth|crucial) to (note|mention|remember)/i,
  /\bin (conclusion|summary|a nutshell)\b/i,
  /\bdelve[sd]?\b/i,
  /\btapestry\b/i,
  /\bat the end of the day\b/i,
  /\bnavigat(e|es|ing) the (complex|complexities|landscape|challenges)/i,
  /\b(game[- ]changer|paradigm shift|testament to|beacon of)\b/i,
  /\bunderscor(e|es|ing) the (importance|need|significance)/i,
  /\b(ever[- ]evolving|ever[- ]changing) (landscape|world|nature)/i,
  /\bin the realm of\b/i,
  /\bsheds? (new )?light on\b/i,
  /\bplays? a (crucial|pivotal|vital|significant) role\b/i,
  /\bonly time will tell\b/i,
  /\bremains to be seen\b/i,
  /\bas (an|a) (ai|language model)\b/i,
  /\bstay tuned\b/i,
  /\blet'?s (dive|delve|unpack|explore)\b/i,
  /\bwithout further ado\b/i,
  /\bthe (implications|ramifications) (of this|are)\b/i,
  /\bmultifaceted\b/i,
  /\bholistic approach\b/i,
  /\bin the wake of\b/i,
]

export function aiPhraseHits(text: string): string[] {
  const hits: string[] = []
  for (const re of AI_PHRASES) {
    const m = text.match(re)
    if (m) hits.push(m[0].toLowerCase())
  }
  return hits
}

const CLICKBAIT_RE = /(you won'?t believe|shocking|jaw[- ]dropping|mind[- ]blowing|goes viral|what happened next|this one (trick|thing)|gone wrong|!!+|\?\?+)/i

export function sentenceLengthSpread(text: string): number {
  const lens = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => wordsOf(s).length)
    .filter((n) => n > 0)
  if (lens.length < 5) return 99
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length
  const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length
  return Math.sqrt(variance)
}

export function assessArticle(input: QualityInput): QualityReport {
  const minWords = input.minWords ?? MIN_WORDS_DEFAULT
  const bodyText = htmlToText(input.contentHtml)
  const faqText = (input.faqs ?? []).map((f) => `${f.question} ${f.answer}`).join('\n')
  const fullText = `${input.title}\n${bodyText}\n${faqText}`
  const blocking: string[] = []
  const warnings: string[] = []

  const wordCount = wordsOf(bodyText).length
  if (wordCount < minWords) {
    blocking.push(`The article body has ${wordCount} words; it must have at least ${minWords}. Add more reporting, context and explanation drawn only from the source reports.`)
  }

  const { copiedRatio, longestRun } = copyStats(input.sourceText, `${bodyText}\n${faqText}`)
  if (longestRun >= 12 || copiedRatio > 0.1) {
    blocking.push(`Too much of the wording is copied from the source (longest copied run ${longestRun} words, ${(copiedRatio * 100).toFixed(0)}% overlap). Rewrite those parts completely in your own words and sentence structure.`)
  }

  const srcFigures = figureSet(input.sourceText)
  const year = input.currentYear ?? new Date().getFullYear()
  const ungroundedNumbers = extractFigures(fullText).filter((f) => !srcFigures.has(f) && f !== String(year))
  if (ungroundedNumbers.length > 0) {
    blocking.push(`These figures do not appear in the source reports: ${ungroundedNumbers.slice(0, 8).join(', ')}. Remove them or replace them with figures that are in the sources.`)
  }

  const srcNormalized = wordsOf(input.sourceText).join(' ')
  const unsupportedQuotes = extractQuotes(fullText).filter((q) => !srcNormalized.includes(wordsOf(q).join(' ')))
  if (unsupportedQuotes.length > 0) {
    blocking.push(`These quoted passages are not word-for-word in the source reports: ${unsupportedQuotes.slice(0, 3).map((q) => `"${q.slice(0, 60)}"`).join('; ')}. Use only exact quotes from the sources, or paraphrase without quotation marks.`)
  }

  const ungroundedNames = ungroundedProperNouns(fullText, input.sourceText)
  if (ungroundedNames.length >= 3) {
    warnings.push(`Names not found in the source reports: ${ungroundedNames.slice(0, 8).join(', ')}.`)
  }
  if (ungroundedNames.length >= 6) {
    blocking.push(`Too many names that do not appear in the source reports (${ungroundedNames.slice(0, 8).join(', ')}). Mention only people, places and organisations named in the sources.`)
  }

  const phrases = aiPhraseHits(`${input.title}\n${bodyText}\n${faqText}`)
  if (phrases.length >= 2) {
    blocking.push(`Stock phrases that read as machine-written: ${phrases.join('; ')}. Rewrite in plain, direct newsroom language.`)
  } else if (phrases.length === 1) {
    warnings.push(`Stock phrase: ${phrases[0]}.`)
  }

  if (input.publisherNames && input.publisherNames.length > 0) {
    const opening = (input.contentHtml.match(/<p\b[\s\S]*?<\/p>/gi) || []).slice(0, 3).map((p) => htmlToText(p)).join(' ').toLowerCase()
    if (!input.publisherNames.some((n) => opening.includes(n.toLowerCase()))) {
      blocking.push(`None of ${input.publisherNames.join(', ')} is named in the first three paragraphs. Attribute the main facts to the publisher by name, in plain words.`)
    }
  }

  const h2s = (input.contentHtml.match(/<h2\b/gi) || []).length
  const paras = (input.contentHtml.match(/<p\b/gi) || []).length
  if (paras < 6) warnings.push(`Only ${paras} paragraphs.`)
  if (h2s < 2) warnings.push(`Only ${h2s} subheadings (<h2>).`)

  const spread = sentenceLengthSpread(bodyText)
  if (spread < 5) warnings.push('Sentence lengths are too uniform; mix short and long sentences.')

  const title = input.title.trim()
  if (title.length < 30) blocking.push(`The headline is only ${title.length} characters; make it specific, 45 to 70 characters.`)
  if (title.length > 90) blocking.push(`The headline is ${title.length} characters; keep it under 70.`)
  else if (title.length > 70) warnings.push(`The headline is ${title.length} characters; 70 or fewer displays fully in search.`)
  if (CLICKBAIT_RE.test(title)) blocking.push('The headline uses clickbait wording. Make it compelling through a concrete fact, tension or consequence instead.')
  if (/^[A-Z0-9\s\W]+$/.test(title) && /[A-Z]{6,}/.test(title)) blocking.push('The headline is in all capitals.')

  const kw = (input.focusKeyword || '').trim().toLowerCase()
  if (!kw) {
    warnings.push('No focus keyword.')
  } else {
    const firstPara = htmlToText((input.contentHtml.match(/<p\b[\s\S]*?<\/p>/i) || [''])[0]).toLowerCase()
    if (!title.toLowerCase().includes(kw)) warnings.push('Focus keyword is not in the headline.')
    if (!firstPara.includes(kw)) warnings.push('Focus keyword is not in the first paragraph.')
    if (input.seoTitle && !input.seoTitle.toLowerCase().includes(kw)) warnings.push('Focus keyword is not in the SEO title.')
    if (input.seoDescription && !input.seoDescription.toLowerCase().includes(kw)) warnings.push('Focus keyword is not in the meta description.')
  }
  if (input.seoTitle && input.seoTitle.length > 65) warnings.push(`SEO title is ${input.seoTitle.length} characters.`)
  if (input.seoDescription && (input.seoDescription.length < 90 || input.seoDescription.length > 160)) warnings.push(`Meta description is ${input.seoDescription.length} characters (aim for 120 to 155).`)

  return {
    ok: blocking.length === 0,
    wordCount,
    blocking,
    warnings,
    copiedRatio,
    longestCopiedRun: longestRun,
    ungroundedNumbers,
    unsupportedQuotes,
    ungroundedNames,
  }
}

const ALLOWED_TAGS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em', 'br', 'a'])

/**
 * Whitelist sanitiser for the model's HTML. The source text is untrusted, so a prompt-injection in
 * a fetched page could make the model emit scripts, event handlers or its own links. Everything but
 * a small set of tags is removed, attributes are dropped, and ALL links are stripped (the pipeline
 * adds its own vetted links afterwards).
 */
export function sanitizeArticleHtml(html: string): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|form|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|form|noscript|template)\b[^>]*>/gi, '')
    .replace(/<h1\b/gi, '<h2').replace(/<\/h1>/gi, '</h2>')
    .replace(/<h[4-6]\b/gi, '<h3').replace(/<\/h[4-6]>/gi, '</h3>')
    .replace(/<\/?(b)\b[^>]*>/gi, (m) => (m.startsWith('</') ? '</strong>' : '<strong>'))
    .replace(/<\/?(i)\b[^>]*>/gi, (m) => (m.startsWith('</') ? '</em>' : '<em>'))
    .replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (m, tag: string) => {
      const t = tag.toLowerCase()
      if (t === 'a') return '' // links are re-added by the pipeline, never trusted from the model
      if (!ALLOWED_TAGS.has(t)) return ''
      return m.startsWith('</') ? `</${t}>` : t === 'br' ? '<br>' : `<${t}>`
    })
  return cleaned
    .replace(/<p>\s*(<br>)?\s*<\/p>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
