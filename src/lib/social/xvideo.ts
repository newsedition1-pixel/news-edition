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

/** The newest recent story that has a credited photo, is not about harm, crime, faith or party politics, and has no video yet. */
export function pickVideoRow(rows: VideoRow[], log: ShareEntry[], now: Date): { row: VideoRow; photoUrl: string; credit: string } | null {
  for (const row of rows) {
    if (!row.publishedAt || now.getTime() - row.publishedAt.getTime() > VIDEO_MAX_AGE_MS) continue
    if (alreadyVideoed(log, row.id) || isSensitive({ title: row.title, excerpt: row.excerpt })) continue
    const cover = coverOf(row.content)
    const photoUrl = reelPhotoUrl(row.coverImage)
    if (cover.kind !== 'photo' || !cover.credit || !photoUrl) continue
    return { row, photoUrl, credit: cover.credit }
  }
  return null
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
    `headline: ${20} to ${VIDEO_HEADLINE_MAX} characters, the story in plain words, no clickbait, no exclamation marks.`,
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
