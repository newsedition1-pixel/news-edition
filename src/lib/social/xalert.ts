/**
 * The breaking-news alert for X (owner decision 28 Nov 2026: "X / ya trusted news organisation pr jo sabse phle
 * break ho news tab hi turant x pr post ho", answer to "pehle alert, baad me link").
 *
 * The full article takes minutes (read, write, fact check, audit). When a story breaks, X first gets ONE short line
 * ("BREAKING: ..."), written from the headlines and summaries that 2+ independent trusted publishers have already
 * published, and checked mechanically; the article follows and its link goes under the alert as a reply
 * (`lib/social/share.ts`). Nothing in the alert can come from the model's memory:
 *   - a name must be in the reports, a number must be given by at least two of them, a strong claim word
 *     ("terror", "murder", "massacre" ...) must be used by at least two of them;
 *   - no outlet, agency or journalist is named, no run of 8 words is copied from a report;
 *   - no link, hashtag, emoji, exclamation mark, clickbait or capital-letter shouting.
 * When nothing passes after one retry there is no alert (the article path still tweets later).
 * Pure and unit-tested: the model call is injected (see xalertRun.ts for the network and database part).
 */
import { CLICKBAIT_RE, copyStats, figureSet, ungroundedProperNouns } from '../news/quality'
import { normalizeTitle } from '../news/cluster'
import { findSameStory } from '../news/dedupe'
import { plain, weightedLength, X_LIMIT } from './compose'
import { cleanLine, retryPrompt, type Message } from './xcopy'
import { istDay } from './policy'

/** Settings-row prefixes: one row per story, so "reserve this story" is one atomic insert (see xalertRun.ts). */
export const ALERT_PREFIX = 'xAlert:'
export const ALERT_DRY_PREFIX = 'xAlertDry:'

/** Alerts in one IST day (X_ALERT_DAILY_CAP, 0-30, default 10; 0 = no alerts). */
export const ALERT_DAILY_CAP_DEFAULT = 10
export const ALERT_DAILY_CAP_MAX = 30
/** Alerts sent in one run, so a burst of stories cannot flood the account. */
export const ALERTS_PER_RUN = 2
/** A story whose newest report is older than this is not "first" any more: no alert. */
export const ALERT_MAX_AGE_HOURS = 2
/** How long alert rows are kept (they matter for 48 hours of dedupe at most, and for linking the article). */
export const ALERT_KEEP_DAYS = 3
/** A story with no safe line is tried again after this long (more reports may have come in), and not before. */
export const ALERT_SKIPPED_RETRY_MS = 15 * 60 * 1000
/** An article published later than this after the alert does not get its link under the alert. */
export const ALERT_LINK_WINDOW_HOURS = 12

export const LINE_MIN = 50
export const LINE_MAX = 220
export const ALERT_PREFIX_TEXT = 'BREAKING: '

export function alertDailyCap(raw: string | undefined): number {
  const text = (raw ?? '').trim()
  if (text === '') return ALERT_DAILY_CAP_DEFAULT
  const n = Number(text)
  return Number.isInteger(n) && n >= 0 && n <= ALERT_DAILY_CAP_MAX ? n : ALERT_DAILY_CAP_DEFAULT
}

// ── the record kept for every alert ─────────────────────────────────────────

export interface AlertRecord {
  at: string
  /** Preview mode: the line was written and logged, nothing was sent. */
  dry: boolean
  /** writing: reserved, not finished (a crash leaves this and the story is never alerted twice); sent; failed; skipped (no safe line). */
  status: 'writing' | 'sent' | 'failed' | 'skipped'
  /** The publishers' headlines of the story: used to recognise the same story later and to find our article for it. */
  titles: string[]
  text?: string
  tweetId?: string
  error?: string
  reason?: string
  /** Set when the article's link was posted as a reply to this alert. */
  linkedAt?: string
  linkTweetId?: string
}

export function parseAlertRecord(raw: string | null): AlertRecord | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<AlertRecord> | null
    if (!v || typeof v !== 'object' || typeof v.at !== 'string' || !Array.isArray(v.titles)) return null
    const status = v.status === 'sent' || v.status === 'failed' || v.status === 'skipped' ? v.status : 'writing'
    return { ...(v as AlertRecord), status, dry: v.dry === true, titles: v.titles.filter((t): t is string => typeof t === 'string') }
  } catch {
    return null
  }
}

/** The settings key of a story: a short hash of its lead headline (the same feed snapshot gives the same key, so two overlapping runs collide). */
export function alertKeyOf(leadTitle: string, dry: boolean): string {
  let h = 0x811c9dc5
  for (const ch of normalizeTitle(leadTitle)) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${dry ? ALERT_DRY_PREFIX : ALERT_PREFIX}${h.toString(16).padStart(8, '0')}`
}

/** Has this story (its publisher headlines) already been alerted? Same rule as the same-story guard for articles. */
export function isAlerted(records: AlertRecord[], titles: string[], dry: boolean): boolean {
  return records.some((r) => r.dry === dry && findSameStory({ titles }, r.titles.map((title) => ({ title }))) !== null)
}

/** Alerts that went out (or, in preview, were written) on the Indian calendar day of `now`. */
export function alertsToday(records: AlertRecord[], now: Date, dry: boolean): number {
  const day = istDay(now)
  return records.filter((r) => r.dry === dry && r.status === 'sent' && istDay(new Date(r.at)) === day).length
}

/** The newest sent, not yet linked alert that is about the same story as our article, or null. */
export function matchAlertForArticle<T extends { key: string; rec: AlertRecord }>(
  entries: T[],
  article: { title: string; excerpt: string | null; tags: string[] },
  now: Date,
): T | null {
  const cutoff = now.getTime() - ALERT_LINK_WINDOW_HOURS * 3_600_000
  const ordered = entries
    .filter((e) => !e.rec.dry && e.rec.status === 'sent' && !!e.rec.tweetId && !e.rec.linkTweetId && new Date(e.rec.at).getTime() >= cutoff)
    .sort((a, b) => b.rec.at.localeCompare(a.rec.at))
  for (const e of ordered) {
    const same = findSameStory({ titles: e.rec.titles }, [{ title: article.title, excerpt: article.excerpt, tags: article.tags }])
    if (same) return e
  }
  return null
}

// ── writing the line ────────────────────────────────────────────────────────

export interface AlertReport {
  title: string
  summary: string
}

export interface AlertInput {
  /** One report per publisher: the headline and the feed summary, nothing else. */
  reports: AlertReport[]
}

const reportText = (r: AlertReport) => `${plain(r.title)}. ${plain(r.summary)}`.trim()

const NUMBER_WORDS: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
  thirty: '30', forty: '40', fifty: '50',
}

/** "seven killed" and "7 killed" are the same number; small counts matter most in a casualty alert. */
function withDigits(text: string): string {
  return text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\b/gi, (w) => NUMBER_WORDS[w.toLowerCase()])
}

/** Words that make an event sound worse or different than a plain account: they must be the reports' own. */
const STRONG_CLAIM_RE = /\b(terror\w*|suicide|murder\w*|massacre\w*|assassinat\w*|sabotage\w*|deliberate\w*|intentional\w*|genocide|war crimes?|coup|invasion|invaded)\b/gi

const OUTLET_EXTRAS = [
  'BBC', 'NDTV', 'CNN', 'PTI', 'ANI', 'IANS', 'AFP', 'Reuters', 'Bloomberg', 'Associated Press', 'Press Trust of India',
  'Asian News International', 'Al Jazeera', 'Hindustan Times', 'Times of India', 'Indian Express', 'The Hindu', 'India Today',
  'News18', 'Scroll', 'Business Standard', 'Times Now', 'Republic', 'Zee News', 'ABP', 'Aaj Tak',
]

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The outlets, agencies or channels named in a line. Short all-capital names ("ANI", "PTI") match in capitals only. */
export function mentionedOutlets(text: string, publisherNames: string[]): string[] {
  const hits: string[] = []
  const seen = new Set<string>()
  for (const raw of [...publisherNames, ...OUTLET_EXTRAS]) {
    const name = raw.replace(/^the\s+/i, '').trim()
    if (name.length < 2 || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    const re = new RegExp(`(?<![A-Za-z])${escapeRegExp(name)}(?![A-Za-z])`, /^[A-Z]{2,5}$/.test(name) ? '' : 'i')
    if (re.test(text)) hits.push(name)
  }
  return hits
}

/** What is wrong with a line; empty when it can be posted. */
export function checkAlertLine(line: string, input: AlertInput, publisherNames: string[]): string[] {
  const issues: string[] = []
  const texts = input.reports.map(reportText)
  const source = texts.join('\n')

  if (line.length < LINE_MIN || line.length > LINE_MAX) issues.push(`The line must be ${LINE_MIN} to ${LINE_MAX} characters (it is ${line.length}).`)
  if (/^breaking\b/i.test(line)) issues.push('Do not start with "Breaking": the code adds it.')
  if (CLICKBAIT_RE.test(line)) issues.push('The line uses clickbait wording.')
  if (/!/.test(line)) issues.push('The line has an exclamation mark.')
  if (/\b[A-Z]{6,}\b/.test(line)) issues.push('The line shouts in capital letters.')
  if (/(\.\.\.|…)$/.test(line)) issues.push('The line trails off.')

  const outlets = mentionedOutlets(line, publisherNames)
  if (outlets.length) issues.push(`The line names a news outlet or agency (${outlets.join(', ')}); never name a source.`)

  const names = ungroundedProperNouns(line.replace(/\b([A-Z]{2,6})s\b/g, '$1'), source.replace(/\b([A-Z]{2,6})s\b/g, '$1'))
  if (names.length) issues.push(`The line names things that are not in the reports: ${names.join(', ')}.`)

  // A number is only safe when independent reports agree on it: counts of the dead and injured change fast and differ between outlets.
  const digitTexts = texts.map((t) => figureSet(withDigits(t)))
  const unconfirmed = [...figureSet(withDigits(line))].filter((f) => digitTexts.filter((set) => set.has(f)).length < 2)
  if (unconfirmed.length) issues.push(`These numbers are not given by at least two reports: ${unconfirmed.join(', ')}. Leave them out or use only numbers that two reports give.`)

  const strong = [...new Set((line.match(STRONG_CLAIM_RE) ?? []).map((w) => w.toLowerCase()))]
  const unsupported = strong.filter((w) => texts.filter((t) => new RegExp(`\\b${escapeRegExp(w)}`, 'i').test(t)).length < 2)
  if (unsupported.length) issues.push(`These strong words are not used by at least two reports: ${unsupported.join(', ')}. Describe the event plainly instead.`)

  if (copyStats(source, line).longestRun >= 8) issues.push('The line copies a run of 8 or more words from a report. Say it in your own words.')
  return issues
}

export function buildAlertPrompt(input: AlertInput): { system: string; user: string } {
  const system = [
    'You write the first line of a breaking-news alert for NewsEdition, an Indian news site, on X (Twitter).',
    'You are given the headlines and short summaries that several independent news organisations have just published about the same event.',
    'Write ONE plain sentence that says what happened, using only what these reports state. Nothing from memory, no background, no guesses.',
    'Return JSON: {"line": string}, or {"line": null} when the reports do not clearly describe the same event or do not agree enough for a safe one-line alert.',
    `line: ${LINE_MIN} to ${LINE_MAX} characters, in your own words (never copy a headline), who/what/where first, plain active voice, same language as the headlines.`,
    'Numbers: write numerals, and only a number that at least two reports give. If the reports differ on a number, leave the number out.',
    'Never name a newspaper, channel, agency, website or journalist, and never write "reportedly", "sources say" or "according to".',
    'Do not give a cause, blame, motive, suspect or "terror"/"murder"/"massacre" unless at least two reports use that word.',
    'No "Breaking" (the code adds it), no clickbait, no exclamation marks, no capital-letter shouting, no emoji, no hashtags, no links.',
  ].join('\n')
  const user = input.reports
    .map((r, i) => `Report ${i + 1}: ${plain(r.title)}${plain(r.summary) ? `\nSummary ${i + 1}: ${plain(r.summary).slice(0, 320)}` : ''}`)
    .join('\n\n')
  return { system, user }
}

/**
 * Asks for a line, checks it, and asks once more with the reasons when it fails. `ask` returns the model's raw JSON text or
 * null (no key, network error). `line` is null when no safe line exists; `issues` then says why.
 */
export async function writeAlertLine(
  ask: (messages: Message[]) => Promise<string | null>,
  input: AlertInput,
  publisherNames: string[],
): Promise<{ line: string | null; issues: string[] }> {
  if (input.reports.length < 2) return { line: null, issues: ['An alert needs reports from at least two publishers.'] }
  const { system, user } = buildAlertPrompt(input)
  const messages: Message[] = [{ role: 'system', content: system }, { role: 'user', content: user }]
  let issues: string[] = []
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(messages)
    if (!raw) return { line: null, issues: ['The writer did not answer.'] }
    let parsed: unknown = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      /* handled below */
    }
    const value = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).line : undefined
    if (value === null) return { line: null, issues: ['The writer found no safe line in the reports.'] }
    const line = cleanLine(value)
    issues = line ? checkAlertLine(line, input, publisherNames) : ['The answer was not the JSON that was asked for.']
    if (line && issues.length === 0) return { line, issues }
    messages.push({ role: 'assistant', content: raw }, { role: 'user', content: retryPrompt(issues) })
  }
  return { line: null, issues }
}

// ── the tweets ──────────────────────────────────────────────────────────────

/** The alert as posted. The prefix is added here, never by the model. */
export function alertTweetText(line: string): string {
  const text = `${ALERT_PREFIX_TEXT}${line}`
  return weightedLength(text) <= X_LIMIT ? text : text.slice(0, X_LIMIT - 1).trimEnd()
}

/** The reply that carries the article's link once the article is published: the checked fact line when there is one. */
export function alertLinkText(fact: string | null | undefined, title: string, url: string): string {
  const lead = (fact ?? '').trim() || plain(title)
  const body = `${lead}\n\nFull report: ${url}`
  if (weightedLength(body) <= X_LIMIT) return body
  return `Full report: ${url}`
}
