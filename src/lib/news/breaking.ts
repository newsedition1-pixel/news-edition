/**
 * The breaking-news fast lane of the schedule (owner decision 28 Nov 2026: "jo breaking news hogi poore world me
 * wahi x par post ho").
 *
 * Until then a breaking story waited for its turn: the scheduler writes one article per run, the category that
 * has waited longest goes first (about ten categories), the daily pace allows one article every 72 minutes, and a
 * run within 20 minutes of the last article does nothing. A big story could sit for hours. Now the scheduler
 * looks for breaking stories first (`breakingCandidates`), ignores the category rotation and the pace for them, and
 * may publish them on top of the normal daily volume (`NEWS_BREAKING_EXTRA`). The fact check and the
 * pre-publication audit are NOT skipped: a breaking story that fails them is not published.
 *
 * Pure functions: no network, no server-only, unit-tested.
 */
import type { Story } from './cluster'
import { isUrgentHeadline } from './placement'

/** Trusted publishers a story needs before it is treated as breaking (same bar as X's own rule, see xplan.ts). */
export const BREAKING_LANE_MIN_PUBLISHERS = 2
/** A story whose newest report is older than this is not "breaking" any more (same window as the site's breaking flag). */
export const BREAKING_LANE_MAX_AGE_HOURS = 6
/** Articles the lane may publish on top of NEWS_DAILY_CAP in one IST day. */
export const BREAKING_EXTRA_DEFAULT = 8
export const BREAKING_EXTRA_MAX = 24
/** Stories the lane looks at in one run, and how many of them the model may write (and the checks may refuse). */
export const BREAKING_LANE_MAX_TRIES = 3
export const BREAKING_LANE_MAX_ATTEMPTS = 2
/** Two runs closer than this are one run (the normal guard is 20 minutes; breaking news may use the gap between). */
export const BREAKING_MIN_GAP_MS = 5 * 60 * 1000

/** `NEWS_BREAKING_EXTRA` from the environment: a whole number 0..24, else the default. 0 = no room beyond the normal volume. */
export function parseBreakingExtra(raw: string | undefined): number {
  const text = (raw ?? '').trim()
  if (text === '') return BREAKING_EXTRA_DEFAULT
  const n = Number(text)
  return Number.isInteger(n) && n >= 0 && n <= BREAKING_EXTRA_MAX ? n : BREAKING_EXTRA_DEFAULT
}

/** Is this story breaking news right now? Several publishers, an urgent headline, fresh, and not an explainer. */
export function isBreakingStory(story: Story, now: number, minPublishers = BREAKING_LANE_MIN_PUBLISHERS): boolean {
  if (story.publisherCount < minPublishers) return false
  if (story.isExplainer) return false
  if (!story.newestAt) return false
  const ageMs = now - new Date(story.newestAt).getTime()
  if (!Number.isFinite(ageMs) || ageMs > BREAKING_LANE_MAX_AGE_HOURS * 3_600_000) return false
  return story.items.some((i) => isUrgentHeadline(i.title))
}

/** The breaking stories of a discovery run, the most widely carried first, then the newest. */
export function breakingCandidates(stories: Story[], now: number, minPublishers = BREAKING_LANE_MIN_PUBLISHERS): Story[] {
  return stories
    .filter((s) => isBreakingStory(s, now, minPublishers))
    .sort((a, b) => b.publisherCount - a.publisherCount || (b.newestAt ?? '').localeCompare(a.newestAt ?? '') || b.score - a.score)
}
