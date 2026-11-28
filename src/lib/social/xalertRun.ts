import 'server-only'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { and, eq, like, lt, or } from 'drizzle-orm'
import { getSetting, getSocialMode, setSetting, SOCIAL_LOG_KEY } from '@/lib/settings'
import { discoverStories } from '@/lib/news/feeds'
import { dropCoveredStories } from '@/lib/news/fresh'
import { breakingCandidates } from '@/lib/news/breaking'
import { PUBLISHERS } from '@/lib/news/publishers'
import type { Story } from '@/lib/news/cluster'
import { loadChannelConfig, secretsOf, sendX } from './channels'
import { parseLog, scrub } from './log'
import { askJson } from './xwriter'
import { xBreakingMinPublishers, xDailyCap, xDay, xModeOf } from './xplan'
import {
  ALERT_DRY_PREFIX, ALERT_KEEP_DAYS, ALERT_MAX_AGE_HOURS, ALERT_PREFIX, ALERT_SKIPPED_RETRY_MS, ALERTS_PER_RUN, alertDailyCap, alertKeyOf, alertsToday,
  alertTweetText, isAlerted, matchAlertForArticle, parseAlertRecord, writeAlertLine, type AlertRecord,
} from './xalert'

/**
 * Breaking-news alerts on X (see xalert.ts for the rules). Called from the breaking watch (`GET /api/cron/breaking`, meant for an
 * outside cron every 5 minutes) and from the 30-minute news call. Never throws. Each story has one settings row, created with
 * "insert, do nothing on conflict", so two runs that overlap cannot both alert the same story.
 *
 * Off unless X is configured, the social mode (Admin > News Automation) is on or preview, and X_MODE is `breaking` (the default).
 * `X_ALERTS=off` switches it off on its own. Preview mode writes the line into the runtime log and sends nothing.
 */

export interface AlertRun {
  ran: boolean
  message: string
}

interface AlertRow {
  key: string
  rec: AlertRecord
}

async function loadRows(): Promise<AlertRow[]> {
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(or(like(settings.key, `${ALERT_PREFIX}%`), like(settings.key, `${ALERT_DRY_PREFIX}%`)))
  const out: AlertRow[] = []
  for (const r of rows) {
    const rec = parseAlertRecord(r.value)
    if (rec) out.push({ key: r.key, rec })
  }
  return out
}

/** True when this run is the one that owns the story: the row did not exist. */
async function reserve(key: string, rec: AlertRecord): Promise<boolean> {
  const rows = await db
    .insert(settings)
    .values({ key, value: JSON.stringify(rec), updatedAt: new Date() })
    .onConflictDoNothing()
    .returning({ key: settings.key })
  return rows.length > 0
}

async function save(key: string, rec: AlertRecord): Promise<void> {
  await setSetting(key, JSON.stringify(rec))
}

async function prune(now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - ALERT_KEEP_DAYS * 86_400_000)
  await db.delete(settings).where(and(or(like(settings.key, `${ALERT_PREFIX}%`), like(settings.key, `${ALERT_DRY_PREFIX}%`)), lt(settings.updatedAt, cutoff)))
}

const alertsOff = () => (process.env.X_ALERTS ?? '').trim().toLowerCase() === 'off'

export async function runXAlerts(opts: { stories?: Story[]; now?: Date } = {}): Promise<AlertRun> {
  try {
    if (alertsOff()) return { ran: false, message: 'X alerts are off (X_ALERTS=off).' }
    const mode = await getSocialMode()
    if (mode === 'off') return { ran: false, message: 'Social sharing is off.' }
    const cfg = loadChannelConfig(process.env)
    if (!cfg.x) return { ran: false, message: 'X is not set up.' }
    if (xModeOf(process.env.X_MODE) !== 'breaking') return { ran: false, message: 'X alerts only run in X_MODE=breaking.' }
    const dry = mode === 'dry'
    const now = opts.now ?? new Date()

    const stories = opts.stories ?? (await discoverStories('')).stories
    const minPublishers = xBreakingMinPublishers(process.env.X_BREAKING_MIN_PUBLISHERS)
    const candidates = breakingCandidates(stories, now.getTime(), minPublishers, ALERT_MAX_AGE_HOURS)
    if (candidates.length === 0) return { ran: true, message: 'No breaking story to announce.' }

    const [allRows, shareLog] = await Promise.all([loadRows(), getSetting(SOCIAL_LOG_KEY).then(parseLog)])
    // A story that had no safe line a while ago may have one now (more reports, agreeing numbers): let it be tried again.
    const stale = allRows.filter((r) => r.rec.status === 'skipped' && now.getTime() - new Date(r.rec.at).getTime() > ALERT_SKIPPED_RETRY_MS)
    await Promise.all(stale.map((r) => db.delete(settings).where(eq(settings.key, r.key))))
    const rows = allRows.filter((r) => !stale.includes(r))
    const records = rows.map((r) => r.rec)
    // The day's budget: the alert cap, and X_DAILY_CAP over article tweets and alerts together.
    const sentToday = alertsToday(records, now, dry)
    const room = Math.min(alertDailyCap(process.env.X_ALERT_DAILY_CAP) - sentToday, xDailyCap(process.env.X_DAILY_CAP) - xDay(shareLog, now, dry).posts - sentToday, ALERTS_PER_RUN)
    if (room <= 0) return { ran: true, message: `Alert budget used up today (${sentToday} sent).` }

    // A story we already wrote about is covered by its own article tweet.
    const open = (await dropCoveredStories(candidates)).filter((s) => !isAlerted(records, s.items.map((i) => i.title), dry))
    if (open.length === 0) return { ran: true, message: 'Every breaking story is already announced or covered.' }

    prune(now).catch(() => undefined)
    const names = PUBLISHERS.map((p) => p.name)
    const secrets = secretsOf(cfg)
    const notes: string[] = []
    let sent = 0
    for (const story of open) {
      if (sent >= room) break
      const key = alertKeyOf(story.lead.title, dry)
      const base: AlertRecord = { at: now.toISOString(), dry, status: 'writing', titles: story.items.map((i) => i.title) }
      if (!(await reserve(key, base))) continue

      const { line, issues } = await writeAlertLine((messages) => askJson(messages, 300), { reports: story.items.map((i) => ({ title: i.title, summary: i.summary })) }, names)
      if (!line) {
        const reason = issues.join(' ').slice(0, 300)
        await save(key, { ...base, status: 'skipped', reason })
        notes.push(`${story.lead.title.slice(0, 60)}: no alert (${reason})`)
        continue
      }
      const text = alertTweetText(line)
      if (dry) {
        await save(key, { ...base, status: 'sent', text, reason: 'preview only' })
        notes.push(`(preview) ${text}`)
        sent++
        continue
      }
      const result = await sendX(cfg.x, { text, hashtags: [], link: null, imageUrl: null, poll: null }, { fetch: (url, init) => fetch(url, init) })
      if (result.ok && result.ref) {
        await save(key, { ...base, status: 'sent', text, tweetId: result.ref })
        notes.push(`sent: ${text}`)
        sent++
      } else {
        const error = scrub(result.error ?? 'unknown error', secrets).slice(0, 240)
        await save(key, { ...base, status: 'failed', text, error })
        notes.push(`FAILED: ${error}`)
      }
    }
    return { ran: true, message: notes.length ? notes.join(' | ') : 'Nothing to announce.' }
  } catch (err) {
    console.error('X alerts error:', err instanceof Error ? err.message : err)
    return { ran: true, message: 'X alerts failed (see the error log).' }
  }
}

/** The sent, not yet linked alert about the same story as this article, or null. Never throws. */
export async function findAlertFor(article: { title: string; excerpt: string | null; tags: string[] }, now = new Date()): Promise<{ key: string; tweetId: string } | null> {
  try {
    const hit = matchAlertForArticle(await loadRows(), article, now)
    return hit?.rec.tweetId ? { key: hit.key, tweetId: hit.rec.tweetId } : null
  } catch {
    return null
  }
}

/** Remembers that the article's link went under the alert, so a second article of the same story does not reply again. */
export async function markAlertLinked(key: string, linkTweetId: string): Promise<void> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1)
  const rec = parseAlertRecord(row?.value ?? null)
  if (!rec) return
  await save(key, { ...rec, linkedAt: new Date().toISOString(), linkTweetId })
}
