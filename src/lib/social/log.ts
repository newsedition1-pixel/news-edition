/**
 * The record of what was shared, kept as JSON in one settings row (no database change needed). It
 * answers three questions: was this article already shared, how many top stories went out today,
 * and what happened on each platform (so the admin can see failures). Pure and unit-tested.
 */
import { istDay } from './policy'

export const SOCIAL_LOG_MAX = 60

export interface ChannelResult {
  ok: boolean
  /** Id of the post on the platform. */
  ref?: string
  error?: string
  /** Why nothing was sent (not configured, not a top story, AI cover, preview only). */
  skipped?: string
}

export interface ShareEntry {
  id: number
  title: string
  at: string
  /** Preview mode: text was written but nothing was sent. */
  dry: boolean
  top: boolean
  reason: string
  results: Record<string, ChannelResult>
  /** Only kept for previews, so the admin can read what would have been posted. */
  captions?: Record<string, string>
}

export function parseLog(raw: string | null): ShareEntry[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.filter((e): e is ShareEntry => !!e && typeof e === 'object' && typeof (e as ShareEntry).id === 'number' && typeof (e as ShareEntry).at === 'string')
  } catch {
    return []
  }
}

/** Newest first, one live entry per article, capped. Preview entries replace older previews of the same article. */
export function addEntry(log: ShareEntry[], entry: ShareEntry, max = SOCIAL_LOG_MAX): ShareEntry[] {
  const rest = log.filter((e) => !(e.id === entry.id && e.dry === entry.dry))
  return [entry, ...rest].slice(0, max)
}

/** An article that already went out for real is never posted again (a failed channel is not retried automatically, to avoid doubles). */
export function alreadyShared(log: ShareEntry[], id: number): boolean {
  return log.some((e) => e.id === id && !e.dry)
}

function chosen(log: ShareEntry[]): ShareEntry[] {
  return log.filter((e) => !e.dry && e.top)
}

/** Top stories chosen on the Indian calendar day of `now`. */
export function chosenToday(log: ShareEntry[], now: Date): number {
  const day = istDay(now)
  return chosen(log).filter((e) => istDay(new Date(e.at)) === day).length
}

export function lastChosenAt(log: ShareEntry[]): Date | null {
  const times = chosen(log).map((e) => new Date(e.at).getTime()).filter((t) => Number.isFinite(t))
  return times.length ? new Date(Math.max(...times)) : null
}

/** Removes known secrets from text before it is stored or shown. */
export function scrub(text: string, secrets: (string | undefined)[]): string {
  let out = text
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join('***')
  return out.replace(/access_token=[^&\s"']+/gi, 'access_token=***').replace(/\bbot\d+:[A-Za-z0-9_-]+/g, 'bot***')
}
