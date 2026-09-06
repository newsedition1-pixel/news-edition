/**
 * Synthetic analytics for the admin demo dashboard.
 *
 * NOTHING HERE IS REAL. It generates plausible-looking traffic numbers from a
 * deterministic seed so the demo page renders identically on every request
 * within the same day (no jumping numbers, no hydration mismatch). It never
 * reads from or writes to any analytics provider.
 */

/** Scale every number in the demo up or down. 1 = ~4k pageviews/day. */
const DEMO_SCALE = 1

export const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const
export type Range = keyof typeof RANGE_DAYS

export interface DayPoint {
  date: string // ISO yyyy-mm-dd
  label: string // '12 Aug'
  pageviews: number
  users: number
  sessions: number
}

export interface BreakdownRow {
  label: string
  sessions: number
  share: number // 0..1
}

export interface TopPage {
  title: string
  path: string
  views: number
  avgTimeSec: number
}

export interface DemoAnalytics {
  range: Range
  days: DayPoint[]
  totals: { pageviews: number; users: number; sessions: number; avgEngagementSec: number; bounceRate: number }
  deltas: { pageviews: number; users: number; sessions: number; avgEngagementSec: number }
  sources: BreakdownRow[]
  devices: BreakdownRow[]
  countries: BreakdownRow[]
  topPages: TopPage[]
  realtime: { minutesAgo: number; users: number }[]
  activeNow: number
}

/** Small deterministic PRNG — the same seed always yields the same sequence. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Weekday multipliers — news dips a little on weekends. Sun..Sat */
const WEEKDAY_FACTOR = [0.84, 1.07, 1.05, 1.03, 1.02, 1.0, 0.86]

/**
 * Builds `count` daily points ending `endOffset` days before today.
 * The level of each day is a function of how far back it is, so the previous
 * period always comes out lower than the current one — the trend reads as up.
 */
function buildDays(count: number, endOffset: number): DayPoint[] {
  const today = new Date()
  const out: DayPoint[] = []

  for (let i = 0; i < count; i++) {
    const daysBack = endOffset + (count - 1 - i)
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - daysBack))
    const iso = d.toISOString().slice(0, 10)
    const rnd = mulberry32(hash(iso))

    // Decelerating growth curve, anchored so today sits at the base level.
    // Compound growth was tried first and is wrong here: any rate fast enough
    // to beat the noise over 7 days implies an absurd 90-day delta.
    const growth = 1 - 0.75 * (daysBack / (daysBack + 120))
    const weekday = WEEKDAY_FACTOR[d.getUTCDay()]
    const noise = 0.975 + rnd() * 0.05
    // Roughly one day in twenty gets a lift — a story that travelled.
    const spike = rnd() < 0.05 ? 1.25 + rnd() * 0.15 : 1

    const users = Math.round(1450 * growth * weekday * noise * spike * DEMO_SCALE)
    const sessions = Math.round(users * (1.24 + rnd() * 0.1))
    const pageviews = Math.round(sessions * (2.2 + rnd() * 0.5))

    out.push({ date: iso, label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`, users, sessions, pageviews })
  }
  return out
}

function sum(rows: DayPoint[], key: 'users' | 'sessions' | 'pageviews'): number {
  return rows.reduce((t, r) => t + r[key], 0)
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0
  return Math.round(((current - previous) / previous) * 1000) / 10
}

/** Splits a total across fixed shares, jittered by seed, then re-normalised. */
function breakdown(labels: [string, number][], total: number, seed: string): BreakdownRow[] {
  const rnd = mulberry32(hash(seed))
  const jittered = labels.map(([label, share]) => ({ label, share: share * (0.92 + rnd() * 0.16) }))
  const totalShare = jittered.reduce((t, r) => t + r.share, 0)
  return jittered.map((r) => {
    const share = r.share / totalShare
    return { label: r.label, share, sessions: Math.round(total * share) }
  })
}

export interface ArticleSeed {
  title: string
  slug: string
}

export function buildDemoAnalytics(range: Range, articles: ArticleSeed[]): DemoAnalytics {
  const days = RANGE_DAYS[range]
  const current = buildDays(days, 0)
  const previous = buildDays(days, days)

  const pageviews = sum(current, 'pageviews')
  const users = sum(current, 'users')
  const sessions = sum(current, 'sessions')

  const rnd = mulberry32(hash(`totals:${range}:${current[0].date}`))
  const avgEngagementSec = Math.round(118 + rnd() * 34)
  const prevEngagement = Math.round(avgEngagementSec * (0.9 + rnd() * 0.08))

  const sources = breakdown(
    [
      ['Google Search', 0.44],
      ['Direct', 0.19],
      ['Google News', 0.14],
      ['Facebook', 0.09],
      ['WhatsApp', 0.06],
      ['X (Twitter)', 0.04],
      ['Other referral', 0.04],
    ],
    sessions,
    `src:${range}`
  )

  const devices = breakdown(
    [
      ['Mobile', 0.78],
      ['Desktop', 0.17],
      ['Tablet', 0.05],
    ],
    sessions,
    `dev:${range}`
  )

  const countries = breakdown(
    [
      ['India', 0.79],
      ['United States', 0.07],
      ['United Arab Emirates', 0.04],
      ['United Kingdom', 0.03],
      ['Canada', 0.03],
      ['Others', 0.04],
    ],
    sessions,
    `geo:${range}`
  )

  // Real article titles, synthetic view counts on a Zipf-ish decay.
  const pageRnd = mulberry32(hash(`pages:${range}:${current[0].date}`))
  const weights = articles.map((_, i) => (1 / Math.pow(i + 1, 0.78)) * (0.85 + pageRnd() * 0.3))
  const weightTotal = weights.reduce((t, w) => t + w, 0) || 1
  const topPages: TopPage[] = articles
    .map((a, i) => ({
      title: a.title,
      path: `/article/${a.slug}`,
      views: Math.round(pageviews * 0.62 * (weights[i] / weightTotal)),
      avgTimeSec: Math.round(72 + pageRnd() * 150),
    }))
    .sort((a, b) => b.views - a.views)

  // Last 30 minutes, seeded by the hour so it moves through the day.
  const now = new Date()
  const rtRnd = mulberry32(hash(`rt:${now.toISOString().slice(0, 13)}`))
  const perMinute = (current[current.length - 1].users / 1440) * 26
  const realtime = Array.from({ length: 30 }, (_, i) => ({
    minutesAgo: 29 - i,
    users: Math.max(1, Math.round(perMinute * (0.55 + rtRnd() * 0.9))),
  }))
  const activeNow = realtime[realtime.length - 1].users + realtime[realtime.length - 2].users

  return {
    range,
    days: current,
    totals: {
      pageviews,
      users,
      sessions,
      avgEngagementSec,
      bounceRate: Math.round((38 + rnd() * 9) * 10) / 10,
    },
    deltas: {
      pageviews: pctChange(pageviews, sum(previous, 'pageviews')),
      users: pctChange(users, sum(previous, 'users')),
      sessions: pctChange(sessions, sum(previous, 'sessions')),
      avgEngagementSec: pctChange(avgEngagementSec, prevEngagement),
    },
    sources,
    devices,
    countries,
    topPages,
    realtime,
    activeNow,
  }
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
