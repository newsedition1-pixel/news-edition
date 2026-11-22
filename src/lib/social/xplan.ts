/**
 * What goes to X, and when. X is the one platform where volume hurts: dozens of automated posts a
 * day that nobody reacts to lower the account's reach for every later post (21 Nov 2026 audit:
 * 3 to 9 views per post). So X gets a few confirmed stories a day, each with a picture, a poll once
 * a day, and the article link only on the best few (a post with a link costs 13 times more on the
 * X API). Telegram still gets every article. An article an editor published by hand is always
 * posted (inside the daily limit). Pure and unit-tested.
 */
import { FEED_FROM_HOUR, FEED_TO_HOUR, STRONG_PUBLISHERS, allowedSoFar, istDay, istHours } from './policy'
import type { ShareEntry } from './log'

/** Posts per day (IST). Override with the X_DAILY_CAP environment variable. */
export const X_DAILY_CAP_DEFAULT = 10
export const X_DAILY_CAP_MAX = 40
/** Posts that carry the article link per day (each costs $0.20 on the X API instead of $0.015). */
export const X_LINK_DAILY_CAP = 5
export const X_POLL_DAILY_CAP = 1
/** Videos per day (the x-video workflow makes one). */
export const X_VIDEO_DAILY_CAP = 1
/** Two X posts are never closer than this (an editor's own article excepted). */
export const X_MIN_GAP_MS = 40 * 60 * 1000
/**
 * After this long without an X post (inside the posting window) an ordinary single-source story is
 * posted too, so the account is not silent all day. Most scheduled stories come from one publisher,
 * so without this the planner waited for a confirmed story that might not come for hours
 * (22 Nov 2026: no X post from 07:00 to 09:00 IST).
 */
export const X_QUIET_GAP_MS = 90 * 60 * 1000
/** The poll goes out in the evening, when most readers are online, IST hours [from, to). */
export const POLL_FROM_HOUR = 17
export const POLL_TO_HOUR = 22
export const POLL_DURATION_MINUTES = 24 * 60

export type XLinkMode = 'always' | 'top' | 'never'
export type XMode = 'growth' | 'legacy'

export interface XDay {
  posts: number
  /**
   * Posts made inside the 07:00-23:00 IST window. Spacing counts these only, so a night post (an
   * editor's own article, or one made before growth mode) does not use up the morning's first slot.
   * Falls back to `posts` when absent.
   */
  postsInWindow?: number
  links: number
  polls: number
  videos: number
  lastAt: Date | null
}

/**
 * What went out on X on the Indian calendar day of `now`, read from the share log. In preview mode
 * (`dry`) the previews count instead of real posts, so the admin sees the day the plan would make.
 */
export function xDay(log: ShareEntry[], now: Date, dry = false): XDay {
  const day = istDay(now)
  const sent = log.filter((e) => e.dry === dry && istDay(new Date(e.at)) === day && (dry ? !!e.x && e.x.format !== 'skip' : e.results.x?.ok === true))
  const times = sent.map((e) => new Date(e.at).getTime()).filter((t) => Number.isFinite(t))
  const inWindow = sent.filter((e) => {
    const h = istHours(new Date(e.at))
    return h >= FEED_FROM_HOUR && h < FEED_TO_HOUR
  })
  return {
    posts: sent.length,
    postsInWindow: inWindow.length,
    links: sent.filter((e) => e.x?.link).length,
    polls: sent.filter((e) => e.x?.format === 'poll').length,
    videos: sent.filter((e) => e.x?.format === 'video').length,
    lastAt: times.length ? new Date(Math.max(...times)) : null,
  }
}

export interface XPlanInput {
  now: Date
  today: XDay
  /** The feed "top story" verdict (lib/social/policy.ts). */
  top: boolean
  /** Trusted publishers carrying the story; undefined for an article an editor published by hand. */
  strength: number | undefined
  linkMode: XLinkMode
  dailyCap: number
  hasImage: boolean
  /** The cover is a labelled AI illustration: it is not attached to a tweet. */
  aiCover: boolean
  /** The topic is fit for a neutral poll (see isPollSafe in xcopy.ts). */
  pollSafe: boolean
}

export interface XPlan {
  format: 'skip' | 'post' | 'poll'
  link: boolean
  image: boolean
  reason: string
}

const skip = (reason: string): XPlan => ({ format: 'skip', link: false, image: false, reason })

export function planX(i: XPlanInput): XPlan {
  const h = istHours(i.now)
  const editor = i.strength === undefined
  // No X post for a while: a single-source story may go out so the account is not silent.
  const quiet = !i.today.lastAt || i.now.getTime() - i.today.lastAt.getTime() >= X_QUIET_GAP_MS
  if (i.today.posts >= i.dailyCap) return skip(`daily limit of ${i.dailyCap} X posts reached`)
  if (!editor) {
    if (h < FEED_FROM_HOUR || h >= FEED_TO_HOUR) return skip(`outside ${FEED_FROM_HOUR}:00-${FEED_TO_HOUR}:00 IST`)
    if ((i.today.postsInWindow ?? i.today.posts) >= allowedSoFar(i.now, i.dailyCap)) return skip('spacing the day out')
    if (i.today.lastAt && i.now.getTime() - i.today.lastAt.getTime() < X_MIN_GAP_MS) return skip('too soon after the last X post')
    if (!i.top && i.strength! < STRONG_PUBLISHERS && !quiet) return skip('single-source story: X waits for a confirmed story or a quiet stretch')
  }
  if (!editor && i.pollSafe && i.today.polls < X_POLL_DAILY_CAP && h >= POLL_FROM_HOUR && h < POLL_TO_HOUR) {
    return { format: 'poll', link: false, image: false, reason: 'the poll of the day' }
  }
  const link = i.today.links < X_LINK_DAILY_CAP && (i.linkMode === 'always' || (i.linkMode === 'top' && i.top))
  return {
    format: 'post',
    link,
    image: i.hasImage && !i.aiCover,
    reason: editor ? 'published by an editor' : i.top ? 'top story' : i.strength! >= STRONG_PUBLISHERS ? `carried by ${i.strength} sources` : 'quiet stretch: no X post for a while',
  }
}

/** X_DAILY_CAP from the environment, kept in a sane range. */
export function xDailyCap(raw: string | undefined): number {
  const n = Number.parseInt((raw ?? '').trim(), 10)
  return Number.isFinite(n) && n >= 1 ? Math.min(n, X_DAILY_CAP_MAX) : X_DAILY_CAP_DEFAULT
}

/** "growth" (default): the plan above. "legacy": every article as a plain text tweet, the behaviour before 22 Nov 2026. */
export function xModeOf(raw: string | undefined): XMode {
  return (raw ?? '').trim().toLowerCase() === 'legacy' ? 'legacy' : 'growth'
}
