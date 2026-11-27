/**
 * What goes to X, and when. The 21 Nov 2026 audit found that dozens of automated posts a day that
 * nobody reacts to can lower the account's reach for every later post (3 to 9 views per post), so
 * growth mode was built around a few confirmed stories a day. Owner decision 22 Nov 2026: 20 posts a
 * day on every account, so every story is eligible now and the day's budget is spread evenly (to go
 * back, set X_DAILY_CAP lower and raise X_QUIET_GAP_MS). The extras stay: a picture when the cover is a
 * real photo, one poll a day, one video, and the article link only on a few (a post with a link costs 13
 * times more on the X API). Telegram still gets every article. An article an editor published by hand
 * is always posted (inside the daily limit). Pure and unit-tested.
 *
 * Owner decision 27 Nov 2026 ("x account me sirf breaking news post kiya kro"): the default mode is now
 * `breaking` (see `planBreaking`): X gets an article only when it carries the site's breaking flag. The
 * growth plan above is kept behind X_MODE=growth.
 */
import { FEED_FROM_HOUR, FEED_TO_HOUR, STRONG_PUBLISHERS, allowedSoFar, istDay, istHours } from './policy'
import type { ShareEntry } from './log'

/** Posts per day (IST). Override with the X_DAILY_CAP environment variable (not set in Vercel on 22 Nov 2026). */
export const X_DAILY_CAP_DEFAULT = 20
export const X_DAILY_CAP_MAX = 40
/** Posts that carry the article link per day (each costs $0.20 on the X API instead of $0.015). */
export const X_LINK_DAILY_CAP = 5
export const X_POLL_DAILY_CAP = 1
/** Videos per day (the x-video workflow makes one). */
export const X_VIDEO_DAILY_CAP = 1
/** Two X posts are never closer than this (an editor's own article excepted). */
export const X_MIN_GAP_MS = 25 * 60 * 1000
/**
 * After this long without an X post (inside the posting window) an ordinary single-source story is
 * posted too. Equal to the minimum gap: every story is eligible, the daily budget and the spacing set the
 * pace. (Until 22 Nov 2026 this was 90 minutes and single-source stories waited for a confirmed story;
 * most scheduled stories come from one publisher, so the account was silent for hours.)
 */
export const X_QUIET_GAP_MS = X_MIN_GAP_MS
/** The poll goes out in the evening, when most readers are online, IST hours [from, to). */
export const POLL_FROM_HOUR = 17
export const POLL_TO_HOUR = 22
export const POLL_DURATION_MINUTES = 24 * 60

export type XLinkMode = 'always' | 'top' | 'never'
export type XMode = 'breaking' | 'growth' | 'legacy'

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
    if (!i.top && i.strength! < STRONG_PUBLISHERS && !quiet) return skip('single-source story: X waits for a quiet stretch')
  }
  if (!editor && i.pollSafe && i.today.polls < X_POLL_DAILY_CAP && h >= POLL_FROM_HOUR && h < POLL_TO_HOUR) {
    return { format: 'poll', link: false, image: false, reason: 'the poll of the day' }
  }
  // With every story eligible, `top` no longer says which story is strong: the few paid links go to confirmed ones.
  const confirmed = editor || i.strength! >= STRONG_PUBLISHERS
  const link = i.today.links < X_LINK_DAILY_CAP && (i.linkMode === 'always' || (i.linkMode === 'top' && i.top && confirmed))
  return {
    format: 'post',
    link,
    image: i.hasImage && !i.aiCover,
    reason: editor ? 'published by an editor' : i.strength! >= STRONG_PUBLISHERS ? `carried by ${i.strength} sources` : 'ordinary story, one publisher',
  }
}

export interface BreakingPlanInput {
  /** The article carries the breaking flag: set by `decidePlacement` (lib/news/placement.ts) for a scheduled article, by the editor's own tick for a manual one. */
  breaking: boolean
  today: XDay
  linkMode: XLinkMode
  dailyCap: number
  hasImage: boolean
  /** The cover is a labelled AI illustration: it is not attached to a tweet. */
  aiCover: boolean
}

/**
 * Breaking-news mode: X gets an article only when it is flagged breaking. It goes out at once, at any hour
 * and without spacing (breaking news does not wait for a slot; placement.ts already allows only two at a
 * time and only for 6 hours), with its link, because the point is to bring readers to the story (the link
 * budget of `X_LINK_DAILY_CAP` and `X_LINK_MODE=never` still apply), and with its picture when the cover is a
 * real photo. No poll, no ordinary story. The daily limit stays as a guard against a runaway.
 */
export function planBreaking(i: BreakingPlanInput): XPlan {
  if (!i.breaking) return skip('not breaking news: X posts breaking news only')
  if (i.today.posts >= i.dailyCap) return skip(`daily limit of ${i.dailyCap} X posts reached`)
  return {
    format: 'post',
    link: i.linkMode !== 'never' && i.today.links < X_LINK_DAILY_CAP,
    image: i.hasImage && !i.aiCover,
    reason: 'breaking news',
  }
}

/** X_DAILY_CAP from the environment, kept in a sane range. */
export function xDailyCap(raw: string | undefined): number {
  const n = Number.parseInt((raw ?? '').trim(), 10)
  return Number.isFinite(n) && n >= 1 ? Math.min(n, X_DAILY_CAP_MAX) : X_DAILY_CAP_DEFAULT
}

/**
 * "breaking" (default since 27 Nov 2026): only articles flagged breaking, see `planBreaking`. "growth": the
 * curated plan of `planX` (20 posts a day, a poll, the daily video). "legacy": every article as a plain text
 * tweet, the behaviour before 22 Nov 2026.
 */
export function xModeOf(raw: string | undefined): XMode {
  const v = (raw ?? '').trim().toLowerCase()
  return v === 'legacy' ? 'legacy' : v === 'growth' ? 'growth' : 'breaking'
}
