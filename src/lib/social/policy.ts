/**
 * Which published articles get the "top story" treatment: a post on Instagram and Facebook (and a
 * link in the tweet). Telegram and X get every article; the feeds that people scroll get a few,
 * spread over the day, because dozens of near-identical posts look like spam and cost reach.
 * Pure and unit-tested.
 */

/** Top stories per day (IST). */
export const FEED_DAILY_CAP = 8
/** Posting window, IST hours [from, to). */
export const FEED_FROM_HOUR = 7
export const FEED_TO_HOUR = 23
/** Two top stories are never closer than this. */
export const FEED_MIN_GAP_MS = 45 * 60 * 1000
/** After this long without a top story even an ordinary story is posted, so a quiet news day is not empty. */
export const FEED_QUIET_GAP_MS = 2 * 60 * 60 * 1000
/** A story carried by at least this many trusted publishers counts as confirmed and strong. */
export const STRONG_PUBLISHERS = 2

const IST_OFFSET_MS = 330 * 60 * 1000

/** "2026-11-20" in India. */
export function istDay(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Hours since midnight in India, with fractions. */
export function istHours(date: Date): number {
  const d = new Date(date.getTime() + IST_OFFSET_MS)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}

/** How many top stories may have gone out by now: the daily cap spread evenly over the window. */
export function allowedSoFar(now: Date, cap = FEED_DAILY_CAP): number {
  const h = Math.min(Math.max(istHours(now) - FEED_FROM_HOUR, 0), FEED_TO_HOUR - FEED_FROM_HOUR)
  return Math.min(cap, Math.floor((cap * h) / (FEED_TO_HOUR - FEED_FROM_HOUR)) + 1)
}

export interface FeedInput {
  now: Date
  /** Top stories already chosen today (IST). */
  chosenToday: number
  /** When the last top story was chosen, if ever today or yesterday. */
  lastChosenAt: Date | null
  /**
   * How strong the story is: the number of trusted publishers carrying it (+1 when it is trending).
   * Undefined for an article an editor published by hand, which is always welcome.
   */
  strength: number | undefined
}

export interface FeedDecision {
  top: boolean
  reason: string
}

export function feedDecision(i: FeedInput): FeedDecision {
  const h = istHours(i.now)
  if (h < FEED_FROM_HOUR || h >= FEED_TO_HOUR) return { top: false, reason: `outside ${FEED_FROM_HOUR}:00-${FEED_TO_HOUR}:00 IST` }
  if (i.chosenToday >= FEED_DAILY_CAP) return { top: false, reason: `daily limit of ${FEED_DAILY_CAP} reached` }
  if (i.chosenToday >= allowedSoFar(i.now)) return { top: false, reason: 'spacing the day out' }
  if (i.strength === undefined) return { top: true, reason: 'published by an editor' }
  const gap = i.lastChosenAt ? i.now.getTime() - i.lastChosenAt.getTime() : Infinity
  if (gap < FEED_MIN_GAP_MS) return { top: false, reason: 'too soon after the last top story' }
  if (i.strength >= STRONG_PUBLISHERS) return { top: true, reason: `carried by ${i.strength} sources` }
  if (gap >= FEED_QUIET_GAP_MS) return { top: true, reason: 'quiet stretch' }
  return { top: false, reason: 'not a top story' }
}
