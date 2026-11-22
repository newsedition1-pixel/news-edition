/**
 * The daily X video: one vertical video a day made from a recent story with a credited photo
 * (the same look as the Reel: photo with its credit, headline, three points, original music). The
 * x-video workflow on GitHub renders it and uploads it to /api/social/x-video, which posts it.
 * This file holds the pure parts: which story, the words on the frames, the upload checks.
 */
import { htmlToText } from '../news/quality'
import { coverOf, reelPhotoUrl } from '../reel/asset'
import { plain, type ArticleForSocial } from './compose'
import type { ShareEntry } from './log'
import { istDay } from './policy'
import { groundingIssues, isSensitive, sourceOf, type Message } from './xcopy'
import { CLICKBAIT_RE } from '../news/quality'

export const X_VIDEO_MAX_UPLOAD = 4 * 1024 * 1024
/** Only stories this fresh are turned into a video. */
export const VIDEO_MAX_AGE_MS = 36 * 60 * 60 * 1000
export const VIDEO_HEADLINE_MAX = 56
/** What the writer is asked for: a margin under the hard limit, because models miscount characters (22 Nov 2026: 57 against 56, twice). */
export const VIDEO_HEADLINE_ASK = 48
/** Stories tried in one run when the words of the first do not pass the checks. */
export const VIDEO_STORY_TRIES = 3
export const VIDEO_POINT_MAX = 70
export const VIDEO_HANDLE = '@NewsEdition_1'

export interface VideoWords {
  headline: string
  points: string[]
}

/** The JSON the workflow renders (keys of make_reel.py). */
export interface VideoSpec extends VideoWords {
  pillar: string
  source: string
  date: string
  handle: string
}

export interface VideoCandidate {
  slug: string
  id: number
  title: string
  spec: VideoSpec
  photoUrl: string
  photoCredit: string
  /**
   * The narration as an MP3 (base64) with the text it reads; absent when no voice could be made (the video then has music only).
   * `words` (Hindi narration only): the number of spoken words per frame text (headline, then the three points), so that
   * the workflow shows each text when it is spoken; without it the English word counts of the frame text are used.
   */
  voice?: { mp3Base64: string; text: string; lang?: 'hi' | 'en'; words?: number[] }
}

export interface VideoRow {
  id: number
  slug: string
  title: string
  excerpt: string | null
  content: string
  coverImage: string | null
  publishedAt: Date | null
  categorySlug: string | null
  categoryName: string | null
}

/** A video is logged under the negative article id, so it never replaces the article's own share entry. */
export const videoLogId = (articleId: number) => -articleId

export function videosToday(log: ShareEntry[], now: Date): number {
  const day = istDay(now)
  return log.filter((e) => !e.dry && e.id < 0 && e.results.x?.ok === true && istDay(new Date(e.at)) === day).length
}

export function alreadyVideoed(log: ShareEntry[], articleId: number): boolean {
  return log.some((e) => e.id === videoLogId(articleId) && !e.dry)
}

/** "22 Nov 2026" in India. */
export function dateLabel(now: Date): string {
  const d = new Date(now.getTime() + 330 * 60 * 1000)
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`
}

/** "Source: The Indian Express." in the stored HTML -> "The Indian Express"; null when there is none. */
export function publisherOf(content: string): string | null {
  const m = htmlToText(content).match(/Source:\s*([^\n.]{2,60})/i)
  return m ? m[1].trim() : null
}

export interface VideoPick {
  row: VideoRow
  photoUrl: string
  credit: string
}

/** The newest recent stories (at most `limit`) that have a credited photo, are not about harm, crime, faith or party politics, and have no video yet. */
export function pickVideoRows(rows: VideoRow[], log: ShareEntry[], now: Date, limit = VIDEO_STORY_TRIES): VideoPick[] {
  const picks: VideoPick[] = []
  for (const row of rows) {
    if (picks.length >= limit) break
    if (!row.publishedAt || now.getTime() - row.publishedAt.getTime() > VIDEO_MAX_AGE_MS) continue
    if (alreadyVideoed(log, row.id) || isSensitive({ title: row.title, excerpt: row.excerpt })) continue
    const cover = coverOf(row.content)
    const photoUrl = reelPhotoUrl(row.coverImage)
    if (cover.kind !== 'photo' || !cover.credit || !photoUrl) continue
    picks.push({ row, photoUrl, credit: cover.credit })
  }
  return picks
}

/** The newest such story, or null. */
export function pickVideoRow(rows: VideoRow[], log: ShareEntry[], now: Date): VideoPick | null {
  return pickVideoRows(rows, log, now, 1)[0] ?? null
}

/**
 * What the narrator reads: the headline, then the three points, exactly the words on the frames. About
 * 45 words at most, which is under 20 seconds of speech (the video grows to fit the voice, up to 24 s).
 */
export function voiceScript(w: VideoWords): string {
  const sentence = (t: string) => t.trim().replace(/[.!?\s]+$/, '')
  return [w.headline, ...w.points].map(sentence).filter(Boolean).join('. ') + '.'
}

// ── the Hindi narration (owner decision 22 Nov 2026: English text on the frames, Hindi voice) ──

/** Spoken words per narration line (a line narrates one frame text) and in all. About 2.6 spoken Hindi words a second, so 58 words stay under the 21.5 s the workflow accepts. */
export const HINDI_LINE_WORDS = { min: 4, max: 20 }
export const HINDI_TOTAL_WORDS = { min: 28, max: 58 }

/** Anything but Devanagari letters and plain punctuation: digits, Latin letters, symbols and emoji are read unpredictably by the voice. */
const NOT_HINDI_RE = /[^ऀ-॥॰-ॿ\s,.?'"‘’“”\-–—]/u

const spokenWords = (line: string): number => line.trim().split(/\s+/).filter(Boolean).length

/**
 * The prompt for the Hindi narration. The writer sees only the four frame texts, which already passed
 * the checks (every figure and name is in the article), so it cannot bring in a new fact.
 */
export function buildHindiPrompt(w: VideoWords): { system: string; user: string } {
  const system = [
    'You write the spoken narration, in Hindi (Devanagari script), of a 14-second vertical news video for NewsEdition, an Indian news site.',
    'The viewer reads four short English text lines on the screen and hears you say the same four facts in Hindi.',
    'Use only the four lines given: add no fact, figure, name, place or date that is not in them, and leave none of their facts out.',
    'Return JSON: {"lines": [string, string, string, string]}. Line 1 narrates the headline, lines 2 to 4 narrate the three points, in the same order.',
    `Style: plain, natural spoken Hindi, the way a news anchor talks to someone watching on a phone (everyday Hindi, no heavy Sanskrit words). Each line is one short sentence of ${HINDI_LINE_WORDS.min + 1} to ${HINDI_LINE_WORDS.max - 2} words; ${HINDI_TOTAL_WORDS.min + 2} to ${HINDI_TOTAL_WORDS.max - 8} words in all.`,
    'Write for the ear: spell every number out in Hindi words (5.5% becomes साढ़े पाँच प्रतिशत) and write English acronyms and names in Devanagari (RBI becomes आरबीआई). No digits, no Latin letters, no symbols, no emoji, no exclamation marks, no clickbait.',
    'Do not name any news outlet and do not say "according to".',
  ].join('\n')
  const user = [`Headline: ${w.headline}`, ...w.points.map((p, i) => `Point ${i + 1}: ${p}`)].join('\n')
  return { system, user }
}

export function parseHindi(raw: unknown): string[] | null {
  if (!raw || typeof raw !== 'object') return null
  const lines = (raw as { lines?: unknown }).lines
  if (!Array.isArray(lines) || lines.length !== 4 || !lines.every((l) => typeof l === 'string')) return null
  return (lines as string[]).map((l) => l.replace(/\s+/g, ' ').trim())
}

/** The reasons a narration is rejected; none means it can be read aloud. */
export function checkHindi(lines: string[]): string[] {
  const issues: string[] = []
  if (lines.length !== 4) return ['There must be exactly 4 lines: the headline, then the three points.']
  lines.forEach((l, i) => {
    const n = spokenWords(l)
    if (n < HINDI_LINE_WORDS.min || n > HINDI_LINE_WORDS.max) issues.push(`Line ${i + 1} must be ${HINDI_LINE_WORDS.min} to ${HINDI_LINE_WORDS.max} words (it is ${n}).`)
  })
  const total = lines.reduce((sum, l) => sum + spokenWords(l), 0)
  if (total < HINDI_TOTAL_WORDS.min || total > HINDI_TOTAL_WORDS.max) issues.push(`The narration must be ${HINDI_TOTAL_WORDS.min} to ${HINDI_TOTAL_WORDS.max} words in all (it is ${total}).`)
  const all = lines.join(' ')
  if (!/[ऀ-ॿ]/.test(all) || NOT_HINDI_RE.test(all)) issues.push('Use Devanagari words and plain punctuation only: no digits, Latin letters, symbols or emoji (write numbers and acronyms out in Devanagari).')
  if (/!/.test(all)) issues.push('No exclamation marks.')
  return issues
}

/** What the voice reads: the four lines, each closed with a danda, so the voice pauses between them. */
export function hindiScript(lines: string[]): string {
  return lines.map((l) => l.trim().replace(/[.।?!\s]+$/u, '')).filter(Boolean).map((l) => `${l}।`).join(' ')
}

/** Spoken words per line, for timing the frame texts. */
export function hindiWordCounts(lines: string[]): number[] {
  return lines.map(spokenWords)
}

/** Asks for the Hindi narration of the frame text, checks it and asks once more with the reasons when it fails. Null lines: the English narration is used instead. */
export async function writeHindi(ask: (m: Message[]) => Promise<string | null>, w: VideoWords): Promise<{ lines: string[] | null; issues: string[] }> {
  const { system, user } = buildHindiPrompt(w)
  const messages: Message[] = [{ role: 'system', content: system }, { role: 'user', content: user }]
  let issues: string[] = []
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(messages)
    if (!raw) return { lines: null, issues: ['The writer did not answer.'] }
    let parsed: unknown = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      /* handled below */
    }
    const lines = parseHindi(parsed)
    issues = lines ? checkHindi(lines) : ['The answer was not the JSON that was asked for.']
    if (lines && issues.length === 0) return { lines, issues }
    messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `Rejected for:\n- ${issues.join('\n- ')}\nReturn corrected JSON.` })
  }
  return { lines: null, issues }
}

export function buildSpec(row: VideoRow, words: VideoWords, now: Date): VideoSpec {
  const publisher = publisherOf(row.content)
  const source = publisher ? (publisher.length <= 28 ? `${publisher} via NewsEdition` : publisher.slice(0, 44)) : 'NewsEdition'
  return { pillar: row.categoryName ?? 'News', headline: words.headline, points: words.points, source, date: dateLabel(now), handle: VIDEO_HANDLE }
}

// ── the words on the frames ─────────────────────────────────────────────────

export function parseWords(raw: unknown): VideoWords | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const clean = (v: unknown) => plain(typeof v === 'string' ? v : '').replace(/https?:\/\/\S+/gi, '').replace(/\p{Extended_Pictographic}️?/gu, '').replace(/\s+/g, ' ').trim()
  const headline = clean(o.headline)
  const points = Array.isArray(o.points) ? o.points.map(clean).filter(Boolean) : []
  return headline ? { headline, points } : null
}

export function checkWords(w: VideoWords, a: ArticleForSocial): string[] {
  const issues: string[] = []
  if (w.headline.length < 20 || w.headline.length > VIDEO_HEADLINE_MAX) issues.push(`The headline must be 20 to ${VIDEO_HEADLINE_MAX} characters (it is ${w.headline.length}).`)
  if (w.points.length !== 3) issues.push('There must be exactly 3 points.')
  for (const p of w.points) if (p.length < 15 || p.length > VIDEO_POINT_MAX) issues.push(`Each point must be 15 to ${VIDEO_POINT_MAX} characters: "${p}".`)
  const all = [w.headline, ...w.points].join('. ')
  if (CLICKBAIT_RE.test(all) || /!/.test(all)) issues.push('No clickbait wording and no exclamation marks.')
  issues.push(...groundingIssues(all, sourceOf(a), 'The video text'))
  return issues
}

export function buildWordsPrompt(a: ArticleForSocial): { system: string; user: string } {
  const system = [
    'You write the on-screen text of a 14-second vertical news video for NewsEdition, an Indian news site.',
    'Use only the article given: every figure, name, place and date must be in it.',
    `Return JSON: {"headline": string, "points": [string, string, string]}.`,
    `headline: 20 to ${VIDEO_HEADLINE_ASK} characters (count them; anything over ${VIDEO_HEADLINE_MAX} is rejected), the story in plain words, no clickbait, no exclamation marks.`,
    `points: exactly three short lines, 15 to ${VIDEO_POINT_MAX} characters each, one fact each, in the order a reader needs them (what happened, who it affects, what next). No emoji, no hashtags, no links.`,
  ].join('\n')
  const user = [`Headline: ${plain(a.title)}`, a.excerpt ? `Summary: ${plain(a.excerpt)}` : '', `Article:\n${htmlToText(a.content ?? '').slice(0, 3000)}`].filter(Boolean).join('\n\n')
  return { system, user }
}

export async function writeWords(ask: (m: Message[]) => Promise<string | null>, a: ArticleForSocial): Promise<{ words: VideoWords | null; issues: string[] }> {
  const { system, user } = buildWordsPrompt(a)
  const messages: Message[] = [{ role: 'system', content: system }, { role: 'user', content: user }]
  let issues: string[] = []
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(messages)
    if (!raw) return { words: null, issues: ['The writer did not answer.'] }
    let parsed: unknown = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      /* handled below */
    }
    const words = parseWords(parsed)
    issues = words ? checkWords(words, a) : ['The answer was not the JSON that was asked for.']
    if (words && issues.length === 0) return { words, issues }
    messages.push({ role: 'assistant', content: raw }, { role: 'user', content: `Rejected for:\n- ${issues.join('\n- ')}\nReturn corrected JSON.` })
  }
  return { words: null, issues }
}

// ── the upload ──────────────────────────────────────────────────────────────

/** An MP4 file starts with a box size and then "ftyp". */
export function isMp4(bytes: Uint8Array): boolean {
  return bytes.byteLength > 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
}
