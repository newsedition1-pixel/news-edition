import 'server-only'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

export const NEWS_WORD_LENGTH_KEY = 'newsWordLength'
export const NEWS_AUTO_PUBLISH_KEY = 'newsAutoPublish'
/** Owner decision (20 Nov 2026): articles that pass every check are published without waiting for an editor. */
export const DEFAULT_NEWS_AUTO_PUBLISH = true
export const NEWS_SCHEDULE_KEY = 'newsScheduleEnabled'
/** JSON map of story URL -> time the schedule failed to turn it into an article (see lib/news/failed.ts). */
export const NEWS_SCHEDULE_FAILED_KEY = 'newsScheduleFailed'
/** JSON map of category slug -> time the schedule last tried it, whether or not it published. */
export const NEWS_SCHEDULE_TRIED_KEY = 'newsScheduleTried'
/** Owner decision (20 Nov 2026): one article every 30 minutes, started by the scheduled GitHub workflow. */
export const DEFAULT_NEWS_SCHEDULE_ENABLED = true
/** How published articles are shared on social media: 'off' (nothing), 'dry' (write the posts, send nothing) or 'on'. */
export const SOCIAL_MODE_KEY = 'socialAutoPost'
export type SocialMode = 'off' | 'dry' | 'on'
/** What was shared, as JSON (see lib/social/log.ts). */
export const SOCIAL_LOG_KEY = 'socialPostLog'
/** X replies: counters and the answers sent (see lib/social/xreplies.ts), and the reply desk's open items. */
export const X_REPLY_STATE_KEY = 'xReplyState'
export const X_REPLY_DESK_KEY = 'xReplyDesk'
/** Recent pre-publication audits, as JSON (see lib/news/auditLog.ts). */
export const NEWS_AUDIT_LOG_KEY = 'newsAuditLog'
export const DEFAULT_NEWS_WORD_LENGTH = 800
export const MIN_NEWS_WORD_LENGTH = 600
export const MAX_NEWS_WORD_LENGTH = 4000

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1)
  return row?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`now()` } })
}

/** Clamp an arbitrary input to a valid word length, falling back to the default. */
export function clampWordLength(input: unknown): number {
  const n = Math.round(Number(input))
  if (!Number.isFinite(n)) return DEFAULT_NEWS_WORD_LENGTH
  return Math.min(MAX_NEWS_WORD_LENGTH, Math.max(MIN_NEWS_WORD_LENGTH, n))
}

/** The current default news word length (admin's last choice, or the built-in default). */
export async function getNewsWordLength(): Promise<number> {
  const stored = await getSetting(NEWS_WORD_LENGTH_KEY)
  return stored ? clampWordLength(stored) : DEFAULT_NEWS_WORD_LENGTH
}

/** Whether generated articles that pass every check are published straight away (admin's last choice, else the default). */
export async function getNewsAutoPublish(): Promise<boolean> {
  const stored = await getSetting(NEWS_AUTO_PUBLISH_KEY)
  return stored === null ? DEFAULT_NEWS_AUTO_PUBLISH : stored === 'true'
}

/** Whether the 30-minute schedule may publish (the admin can pause it from the News Automation screen). */
export async function getNewsScheduleEnabled(): Promise<boolean> {
  const stored = await getSetting(NEWS_SCHEDULE_KEY)
  return stored === null ? DEFAULT_NEWS_SCHEDULE_ENABLED : stored === 'true'
}

/** Social sharing mode. Off until the owner turns it on (it posts in public, so it never defaults to on). */
export async function getSocialMode(): Promise<SocialMode> {
  const stored = await getSetting(SOCIAL_MODE_KEY)
  return stored === 'on' || stored === 'dry' ? stored : 'off'
}
