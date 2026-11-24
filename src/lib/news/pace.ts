/**
 * Daily volume of the news schedule (owner decision 25 Nov 2026: about 20 articles a day instead of ~40,
 * spread over the day). Pure functions: no network, unit-tested.
 */

export const DEFAULT_DAILY_CAP = 20
const IST_OFFSET_MIN = 330

/** `NEWS_DAILY_CAP` from the environment: a whole number 1..48, else the default. */
export function parseDailyCap(raw: string | undefined): number {
  const n = Number((raw ?? '').trim())
  return Number.isInteger(n) && n >= 1 && n <= 48 ? n : DEFAULT_DAILY_CAP
}

/** Midnight of the current India (IST) day, as a Date. */
export function istDayStart(now: Date): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MIN * 60_000)
  const midnightShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  return new Date(midnightShifted - IST_OFFSET_MIN * 60_000)
}

/**
 * How many articles may be published so far today: the cap spread evenly over the IST day, so 20 a day
 * means about one every 72 minutes rather than 20 in the first ten hours. Never below 1, never above the cap.
 */
export function allowedSoFar(now: Date, cap: number): number {
  const minutes = (now.getTime() - istDayStart(now).getTime()) / 60_000
  return Math.min(cap, Math.max(1, Math.ceil((cap * (minutes + 1)) / 1440)))
}
