/**
 * Which published articles get the "feed" treatment: a post on Instagram and Facebook (and a link in
 * the tweet). Telegram gets every article; the feeds that people scroll get up to FEED_DAILY_CAP a
 * day, spread over the posting window so that they do not arrive in bursts.
 * Owner decision 22 Nov 2026: 20 posts a day on every account (it was 8, top stories only). The 21 Nov
 * audit had warned that many near-identical posts lower reach; to go back, lower FEED_DAILY_CAP and
 * raise FEED_QUIET_GAP_MS again. Pure and unit-tested.
 */

/** Feed posts per day (IST). */
export const FEED_DAILY_CAP = 20
/** Posting window, IST hours [from, to). */
export const FEED_FROM_HOUR = 7
export const FEED_TO_HOUR = 23
/** Two feed posts are never closer than this (shorter than the 30 minutes between two scheduled articles, so that none is passed over only for its timing). */
export const FEED_MIN_GAP_MS = 25 * 60 * 1000
/** After this long without a feed post an ordinary single-source story is posted too. Equal to the minimum gap: every story is eligible. */
export const FEED_QUIET_GAP_MS = FEED_MIN_GAP_MS
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

/** How many feed posts may have gone out by now: the daily cap spread evenly over the window. */
export function allowedSoFar(now: Date, cap = FEED_DAILY_CAP): number {
  const h = Math.min(Math.max(istHours(now) - FEED_FROM_HOUR, 0), FEED_TO_HOUR - FEED_FROM_HOUR)
  return Math.min(cap, Math.floor((cap * h) / (FEED_TO_HOUR - FEED_FROM_HOUR)) + 1)
}

export interface FeedInput {
  now: Date
  /** Feed posts already chosen today (IST). */
  chosenToday: number
  /** When the last feed post was chosen, if ever today or yesterday. */
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
  if (gap < FEED_MIN_GAP_MS) return { top: false, reason: 'too soon after the last feed post' }
  if (i.strength >= STRONG_PUBLISHERS) return { top: true, reason: `carried by ${i.strength} sources` }
  if (gap >= FEED_QUIET_GAP_MS) return { top: true, reason: 'quiet stretch' }
  return { top: false, reason: 'not a top story' }
}
