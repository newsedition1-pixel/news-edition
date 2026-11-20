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
 *   - repetition: same-word sentence openings, stock connectors, repeated information, FAQ answers that restate the article
 *   - structure: an "Analysis" section (its content is held to the same grounding rules as everything else)
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

/**
 * The actual passages (normalised to lower case, without punctuation) where the output repeats
 * `NGRAM` or more words in a row from the source, longest first. Shown to the model on a retry so
 * it knows exactly which sentences to rebuild.
 */
export function copiedPassages(sourceText: string, outputText: string, limit = 4): string[] {
  const src = wordsOf(sourceText)
  const out = wordsOf(withoutQuotes(outputText))
  if (out.length < NGRAM || src.length < NGRAM) return []
  const grams = new Set<string>()
  for (let i = 0; i + NGRAM <= src.length; i++) grams.add(src.slice(i, i + NGRAM).join(' '))
  const covered = new Array<boolean>(out.length).fill(false)
  for (let i = 0; i + NGRAM <= out.length; i++) {
    if (grams.has(out.slice(i, i + NGRAM).join(' '))) for (let k = i; k < i + NGRAM; k++) covered[k] = true
  }
  const runs: string[][] = []
  let cur: string[] = []
  for (let i = 0; i < out.length; i++) {
    if (covered[i]) cur.push(out[i])
    else if (cur.length) {
      runs.push(cur)
      cur = []
    }
  }
  if (cur.length) runs.push(cur)
  return runs
    .sort((a, b) => b.length - a.length)
    .slice(0, limit)
    .map((r) => (r.length > 30 ? `${r.slice(0, 30).join(' ')} …` : r.join(' ')))
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

/** Spelling out an abbreviation that the source uses is not an invented name ("UN" -> "United Nations"). */
const EXPANSIONS: Record<string, string[]> = {
  un: ['united', 'nations'],
  us: ['united', 'states'],
  usa: ['united', 'states', 'america'],
  uk: ['united', 'kingdom'],
  uae: ['united', 'arab', 'emirates'],
  eu: ['european', 'union'],
  rbi: ['reserve', 'bank'],
  sebi: ['securities', 'exchange', 'board'],
  sc: ['supreme', 'court'],
  hc: ['high', 'court'],
  pm: ['prime', 'minister'],
  cm: ['chief', 'minister'],
  icj: ['international', 'court', 'justice'],
  who: ['world', 'health', 'organization', 'organisation'],
  nato: ['north', 'atlantic', 'treaty', 'organization', 'organisation'],
  bjp: ['bharatiya', 'janata', 'party'],
  aap: ['aam', 'aadmi', 'party'],
}

/** Capitalised words in mid-sentence (names of people, places, organisations) that never appear in the source. */
export function ungroundedProperNouns(outputText: string, sourceText: string, extraAllowed: string[] = []): string[] {
  // Source words with and without a trailing possessive ("Cox's" counts as "Cox").
  const srcWords = new Set<string>()
  for (const w of wordsOf(sourceText)) {
    srcWords.add(w)
    srcWords.add(w.replace(/'s$/, '').replace(/'$/, ''))
    for (const full of EXPANSIONS[w] ?? []) srcWords.add(full)
  }
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

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'has', 'had', 'was', 'were', 'are', 'but', 'not', 'its', 'their', 'they', 'will',
  'would', 'could', 'been', 'also', 'than', 'into', 'over', 'such', 'which', 'who', 'whom', 'what', 'when', 'where', 'while', 'said', 'says',
  'about', 'after', 'before', 'under', 'more', 'most', 'some', 'any', 'all', 'one', 'two', 'out', 'new', 'per', 'cent', 'his', 'her', 'our',
])

/** Sentences of at least four words, in reading order. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => wordsOf(s).length >= 4)
}

function contentWords(sentence: string): Set<string> {
  return new Set(wordsOf(sentence).filter((w) => w.length >= 3 && !STOPWORDS.has(w)))
}

/** Share of the words two sentences have in common (0 to 1), ignoring small filler words. */
export function sentenceOverlap(a: string, b: string): number {
  const x = contentWords(a)
  const y = contentWords(b)
  if (x.size < 6 || y.size < 6) return 0
  let shared = 0
  for (const w of x) if (y.has(w)) shared++
  return shared / (x.size + y.size - shared)
}

const TRANSITION_RE = /^(moreover|furthermore|additionally|in addition|overall|notably|importantly|ultimately|consequently|indeed|thus|hence)\b/i

function snippet(s: string, words = 12): string {
  const w = s.split(/\s+/)
  return w.length > words ? `${w.slice(0, words).join(' ')} …` : s
}

/**
 * Repeated information and machine-like rhythm: three or more sentences in a row starting with the
 * same word, stock connectors at the start of sentences, near-duplicate sentences, and FAQ answers
 * that only restate the article. Mild cases are warnings, clear cases block the article.
 */
export function repetitionIssues(bodyText: string, faqs: { question: string; answer: string }[] = []): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = []
  const warnings: string[] = []
  const sentences = sentencesOf(bodyText)

  // Same first word, several sentences in a row.
  let run = 1
  let longest = 1
  let longestWord = ''
  for (let i = 1; i < sentences.length; i++) {
    const a = wordsOf(sentences[i - 1])[0]
    const b = wordsOf(sentences[i])[0]
    run = a && a === b ? run + 1 : 1
    if (run > longest) {
      longest = run
      longestWord = b
    }
  }
  if (longest >= 5) blocking.push(`${longest} sentences in a row begin with "${longestWord}". Vary how sentences start; never more than two in a row with the same word.`)
  else if (longest >= 3) warnings.push(`${longest} sentences in a row begin with "${longestWord}".`)

  const connectors = sentences.filter((s) => TRANSITION_RE.test(s))
  if (connectors.length >= 5) blocking.push(`${connectors.length} sentences open with stock connectors (for example "${snippet(connectors[0], 6)}"). Remove them and let the order of the facts carry the logic.`)
  else if (connectors.length >= 3) warnings.push(`${connectors.length} sentences open with stock connectors.`)

  // The same information said twice.
  const pairs: [string, string][] = []
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      if (sentenceOverlap(sentences[i], sentences[j]) >= 0.7) pairs.push([sentences[i], sentences[j]])
    }
  }
  if (pairs.length >= 2) {
    blocking.push(`The same information is repeated in different sentences, for example: "${snippet(pairs[0][0])}" and "${snippet(pairs[0][1])}". Say each fact once and add something new when a topic returns.`)
  } else if (pairs.length === 1) {
    warnings.push(`Two sentences say nearly the same thing: "${snippet(pairs[0][0])}" and "${snippet(pairs[0][1])}".`)
  }

  // FAQ answers that only restate the article.
  const restated = faqs.filter((f) => sentencesOf(f.answer).some((a) => sentences.some((s) => sentenceOverlap(a, s) >= 0.75)))
  if (restated.length >= 4) {
    blocking.push(`${restated.length} FAQ answers only repeat sentences already in the article (for example the answer to "${snippet(restated[0].question, 8)}"). Each answer must give the direct answer in new words and add clarity.`)
  } else if (restated.length >= 2) {
    warnings.push(`${restated.length} FAQ answers repeat sentences from the article.`)
  }

  return { blocking, warnings }
}

/** Points (paragraphs and list items) in the "Analysis" section, or null when the article has no such heading. */
export function analysisPoints(contentHtml: string): number | null {
  const parts = contentHtml.split(/(<h2\b[^>]*>[\s\S]*?<\/h2>)/i)
  for (let i = 1; i < parts.length; i += 2) {
    if (!/^analysis\b/i.test(htmlToText(parts[i]))) continue
    const section = parts[i + 1] ?? ''
    const items = (section.match(/<li\b/gi) || []).length
    const paragraphs = (section.replace(/<li\b[\s\S]*?<\/li>/gi, '').match(/<p\b/gi) || []).length
    return items + paragraphs
  }
  return null
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
    const passages = copiedPassages(input.sourceText, `${bodyText}\n${faqText}`)
    const where = passages.length ? ` These passages are copied (rebuild each one): ${passages.map((q) => `"${q}"`).join('; ')}.` : ''
    blocking.push(`Too much of the wording is copied from the source (longest copied run ${longestRun} words, ${(copiedRatio * 100).toFixed(0)}% overlap). Rewrite those parts completely in your own words and sentence structure.${where}`)
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
    blocking.push(`These quoted passages are not word-for-word in the source reports: ${unsupportedQuotes.slice(0, 3).map((q) => `"${q.slice(0, 110)}"`).join('; ')}. Use only exact quotes from the sources, or paraphrase without quotation marks.`)
  }

  // Names are checked in the body and FAQs only: headlines and subheadings are often Title Case, so every word in them looks like a name.
  const namesText = `${htmlToText(input.contentHtml.replace(/<h2\b[\s\S]*?<\/h2>/gi, ' '))}\n${faqText}`
  const ungroundedNames = ungroundedProperNouns(namesText, input.sourceText, input.publisherNames ?? [])
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

  const repetition = repetitionIssues(bodyText, input.faqs ?? [])
  blocking.push(...repetition.blocking)
  warnings.push(...repetition.warnings)

  const analysis = analysisPoints(input.contentHtml)
  if (analysis === null || analysis === 0) {
    blocking.push('The article has no analysis section. Add an <h2> that starts with "Analysis" followed by 2 to 3 short analytical points drawn only from facts in the reports (no new facts, figures, names or quotations).')
  } else if (analysis < 2) {
    warnings.push(`The analysis section has ${analysis} point; aim for 2 to 3.`)
  } else if (analysis > 5) {
    warnings.push(`The analysis section has ${analysis} points; keep it to 2 or 3 strong ones.`)
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
