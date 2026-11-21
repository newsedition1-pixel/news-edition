/**
 * The words of a tweet. A feed full of "headline + the first lines of the article" gets no
 * reaction, so X gets a short hook (the one concrete fact or consequence) and one line the hook does
 * not say, written by the model from the finished article and then checked mechanically: every
 * figure and every name must be in the article, no clickbait, no links or hashtags from the model.
 * When the model is unavailable or fails the checks, the plain headline-and-summary tweet goes out
 * instead, so nothing is ever blocked. Pure and unit-tested (the network call is in xwriter.ts).
 */
import { CLICKBAIT_RE, extractFigures, figureSet, htmlToText, ungroundedProperNouns } from '../news/quality'
import { composeAll, cloudinaryVariant, cutAtWord, plain, weightedLength, X_LIMIT, X_URL_WEIGHT, type ArticleForSocial, type ComposedPost, type XPoll } from './compose'
import { pickHashtags } from './hashtags'
import { POLL_DURATION_MINUTES } from './xplan'

/** Wide enough for the 16:9 crop of the X timeline, never upscaled; the logo burned into the cover stays inside. */
export const X_IMAGE = 'c_limit,w_1600,f_jpg,q_auto:good'
export const HOOK_MIN = 25
export const HOOK_MAX = 110
export const FACT_MIN = 20
export const FACT_MAX = 180
export const POLL_QUESTION_MAX = 140
export const POLL_OPTION_MAX = 25

export interface XPollDraft {
  question: string
  options: string[]
}

export interface XDraft {
  hook: string
  fact: string
  poll: XPollDraft | null
}

// ── topics fit for a poll ───────────────────────────────────────────────────

/** A poll only goes under stories from these desks (slugs) and only when the story is not about harm, crime, faith or party politics. */
export const POLL_CATEGORIES = new Set(['business', 'entertainment', 'india', 'technology', 'sports', 'lifestyle'])

const SENSITIVE =
  /\b(dead|death|deaths|dies|died|killed|kills|killing|murder|murdered|rape|raped|assault|abuse|suicide|attack|attacked|blast|bomb|terror|terrorist|terrorists|militant|militants|encounter|riot|riots|violence|communal|hate|accident|crash|crashed|collapse|collapsed|fire|flood|floods|earthquake|victim|victims|injured|hospital|cancer|disease|outbreak|covid|war|ceasefire|hostage|hostages|missile|strike|strikes|protest|protests|arrest|arrested|jail|convicted|verdict|court|probe|scam|fraud|minor|minors|child|children|religion|religious|temple|mosque|church|caste|election|elections|vote|voters|bjp|congress|aap|modi|gandhi|kejriwal|shah|trump|putin|netanyahu)\b/i

/** True when a story is about harm, crime, faith or party politics: no poll, no video on it. */
export function isSensitive(a: { title: string; excerpt: string | null }): boolean {
  return SENSITIVE.test(`${a.title} ${a.excerpt ?? ''}`)
}

export function isPollSafe(a: { title: string; excerpt: string | null; categorySlug: string | null }): boolean {
  if (!a.categorySlug || !POLL_CATEGORIES.has(a.categorySlug)) return false
  return !isSensitive(a)
}

// ── cleaning and checking what the model wrote ──────────────────────────────

/** One plain line: no links, hashtags, mentions or emoji (the code adds the link and tags itself). */
export function cleanLine(value: unknown): string {
  const s = typeof value === 'string' ? value : ''
  return plain(s)
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(^|\s)[#@][\w]+/g, '$1')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseDraft(raw: unknown): XDraft | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const hook = cleanLine(o.hook)
  if (!hook) return null
  let poll: XPollDraft | null = null
  const p = o.poll
  if (p && typeof p === 'object') {
    const q = cleanLine((p as Record<string, unknown>).question)
    const opts = (p as Record<string, unknown>).options
    const options = Array.isArray(opts) ? opts.map(cleanLine).filter(Boolean) : []
    if (q && options.length) poll = { question: q, options }
  }
  return { hook, fact: cleanLine(o.fact), poll }
}

export function sourceOf(a: ArticleForSocial): string {
  return [plain(a.title), plain(a.excerpt), htmlToText(a.content ?? '')].filter(Boolean).join('\n')
}

export function groundingIssues(text: string, source: string, what: string): string[] {
  const issues: string[] = []
  const known = figureSet(source)
  const loose = extractFigures(text).filter((f) => !known.has(f))
  if (loose.length) issues.push(`${what} has figures that are not in the article: ${loose.join(', ')}.`)
  // "EMIs" is the acronym "EMI" in the plural, not a new name.
  const names = ungroundedProperNouns(text.replace(/\b([A-Z]{2,6})s\b/g, '$1'), source.replace(/\b([A-Z]{2,6})s\b/g, '$1'))
  if (names.length) issues.push(`${what} names things that are not in the article: ${names.join(', ')}.`)
  return issues
}

/** What is wrong with a draft; empty when it can be posted. */
export function checkDraft(d: XDraft, a: ArticleForSocial, wantPoll: boolean): string[] {
  const issues: string[] = []
  const source = sourceOf(a)
  const line = (text: string, what: string) => {
    if (CLICKBAIT_RE.test(text)) issues.push(`${what} uses clickbait wording.`)
    if (/!/.test(text)) issues.push(`${what} has an exclamation mark.`)
    if (/\b[A-Z]{6,}\b/.test(text)) issues.push(`${what} shouts in capital letters.`)
    if (/(\.\.\.|…)$/.test(text)) issues.push(`${what} trails off.`)
  }
  if (d.hook.length < HOOK_MIN || d.hook.length > HOOK_MAX) issues.push(`The hook must be ${HOOK_MIN} to ${HOOK_MAX} characters (it is ${d.hook.length}).`)
  line(d.hook, 'The hook')
  issues.push(...groundingIssues(d.hook, source, 'The hook'))
  if (d.fact) {
    if (d.fact.length < FACT_MIN || d.fact.length > FACT_MAX) issues.push(`The fact line must be ${FACT_MIN} to ${FACT_MAX} characters (it is ${d.fact.length}).`)
    line(d.fact, 'The fact line')
    issues.push(...groundingIssues(d.fact, source, 'The fact line'))
    if (d.fact.toLowerCase().includes(d.hook.toLowerCase().slice(0, 40))) issues.push('The fact line repeats the hook.')
  }
  if (wantPoll) {
    if (!d.poll) {
      issues.push('A poll was asked for and is missing.')
    } else {
      const { question, options } = d.poll
      if (question.length < 10 || question.length > POLL_QUESTION_MAX || !question.endsWith('?')) issues.push(`The poll question must be a question of 10 to ${POLL_QUESTION_MAX} characters.`)
      if (options.length < 2 || options.length > 3) issues.push('The poll needs 2 or 3 options.')
      if (options.some((o) => o.length > POLL_OPTION_MAX)) issues.push(`Every poll option must be at most ${POLL_OPTION_MAX} characters.`)
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) issues.push('The poll options must differ.')
      line(question, 'The poll question')
      issues.push(...groundingIssues(`${question} ${options.join('. ')}`, source, 'The poll'))
    }
  }
  return issues
}

// ── the prompt ──────────────────────────────────────────────────────────────

export function buildWriterPrompt(a: ArticleForSocial, wantPoll: boolean): { system: string; user: string } {
  const system = [
    'You write posts for NewsEdition, an Indian news site, on X (Twitter). Readers scroll fast: the post must make one fact land in a second.',
    'Write from the article you are given and use nothing else: every figure, name, place and date must be in it. Do not guess, do not add context from memory.',
    'Return JSON: {"hook": string, "fact": string' + (wantPoll ? ', "poll": {"question": string, "options": string[]}' : '') + '}.',
    `hook: one line of ${HOOK_MIN} to ${HOOK_MAX} characters. Lead with the most concrete fact or consequence (a number, a decision, who is affected, a date). Plain words, active voice. Not a copy of the headline. No clickbait ("shocking", "you won't believe"), no exclamation marks, no capital-letter shouting, no emoji, no hashtags, no links, no "Breaking".`,
    `fact: one or two short sentences, ${FACT_MIN} to ${FACT_MAX} characters in all, that add what the hook leaves out: why it matters or what happens next. Do not repeat the hook.`,
    ...(wantPoll
      ? [
          `poll: a neutral question that asks the reader's opinion or prediction about this story (never a question about facts, never about a person's character). question: at most ${POLL_QUESTION_MAX} characters, ends with a question mark. options: 2 or 3 balanced answers, each at most ${POLL_OPTION_MAX} characters, no loaded wording, always one that lets the reader be unsure.`,
        ]
      : []),
    'Write in the language of the article headline.',
  ].join('\n')
  const body = htmlToText(a.content ?? '').slice(0, 3500)
  const user = [
    `Headline: ${plain(a.title)}`,
    a.categoryName ? `Desk: ${a.categoryName}` : '',
    a.excerpt ? `Summary: ${plain(a.excerpt)}` : '',
    body ? `Article:\n${body}` : '',
  ].filter(Boolean).join('\n\n')
  return { system, user }
}

export function retryPrompt(issues: string[]): string {
  return `The draft was rejected for these reasons:\n- ${issues.join('\n- ')}\nReturn corrected JSON in the same format, fixing every point.`
}

export type Message = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Asks for a draft, checks it, and asks once more with the reasons when it fails. `ask` returns the
 * model's raw JSON text or null (no key, network error). Returns null when no draft passes.
 */
export async function writeDraft(ask: (messages: Message[]) => Promise<string | null>, a: ArticleForSocial, wantPoll: boolean): Promise<{ draft: XDraft | null; issues: string[] }> {
  const { system, user } = buildWriterPrompt(a, wantPoll)
  const messages: Message[] = [{ role: 'system', content: system }, { role: 'user', content: user }]
  let issues: string[] = []
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(messages)
    if (!raw) return { draft: null, issues: ['The writer did not answer.'] }
    let parsed: unknown = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      /* handled below */
    }
    const draft = parseDraft(parsed)
    issues = draft ? checkDraft(draft, a, wantPoll) : ['The answer was not the JSON that was asked for.']
    if (draft && issues.length === 0) return { draft, issues }
    messages.push({ role: 'assistant', content: raw }, { role: 'user', content: retryPrompt(issues) })
  }
  return { draft: null, issues }
}

// ── composing the tweet ─────────────────────────────────────────────────────

export interface XComposeInput {
  article: ArticleForSocial
  draft: XDraft | null
  plan: { format: 'post' | 'poll'; link: boolean; image: boolean }
}

export interface XComposed extends ComposedPost {
  copy: 'ai' | 'plain'
}

/** Used when no checked draft exists: a poll on the headline with a question that fits any neutral story. */
const PLAIN_POLL: XPollDraft = { question: 'What is your view on this?', options: ['Good move', 'Not convinced', 'Too early to say'] }

function joinPost(hook: string, fact: string, link: string | null, tagLine: string): string {
  return [fact ? `${hook}\n\n${fact}` : hook, link, tagLine].filter(Boolean).join('\n\n')
}

/** The richest version that fits in 280: fact and tags first, then fewer tags, then no fact. The hook and the link always stay. */
function fitPost(hook: string, fact: string, link: string | null, tags: string[]): string {
  const linkLine = link ? `${link}` : null
  const attempts: [string, string][] = [
    [fact, tags.join(' ')],
    [fact, tags[0] ?? ''],
    [fact, ''],
    ['', tags.join(' ')],
    ['', tags[0] ?? ''],
  ]
  for (const [f, t] of attempts) {
    const text = joinPost(hook, f, linkLine, t)
    const weight = weightedLength(text) - (link ? weightedLength(link) - X_URL_WEIGHT : 0)
    if (weight <= X_LIMIT) return text
  }
  return joinPost(cutAtWord(hook, HOOK_MAX), '', linkLine, '')
}

export function composeXPost(i: XComposeInput): XComposed {
  const a = i.article
  const image = i.plan.image ? cloudinaryVariant(a.imageUrl, X_IMAGE) : null
  const src = { tags: a.tags, categorySlug: a.categorySlug, categoryName: a.categoryName }
  const tags = pickHashtags('x', src)

  if (i.plan.format === 'poll') {
    const d = i.draft?.poll ?? null
    const hook = i.draft?.hook ?? cutAtWord(plain(a.title), HOOK_MAX)
    const poll = d ?? PLAIN_POLL
    let text = `${hook}\n\n${poll.question}`
    if (weightedLength(text) > X_LIMIT) text = `${cutAtWord(hook, 120)}\n\n${poll.question}`
    const xPoll: XPoll = { options: poll.options.slice(0, 3), durationMinutes: POLL_DURATION_MINUTES }
    return { text, hashtags: [], link: null, imageUrl: null, poll: xPoll, copy: i.draft?.poll ? 'ai' : 'plain' }
  }

  if (i.draft) {
    const link = i.plan.link ? a.url : null
    return { text: fitPost(i.draft.hook, i.draft.fact, link, tags), hashtags: tags, link: null, imageUrl: image, poll: null, copy: 'ai' }
  }
  const legacy = composeAll(a, { xLink: i.plan.link }).x
  return { ...legacy, imageUrl: image, poll: null, copy: 'plain' }
}
