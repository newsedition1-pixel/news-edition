import 'server-only'
import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

export const NEWS_WORD_LENGTH_KEY = 'newsWordLength'
export const DEFAULT_NEWS_WORD_LENGTH = 1000
export const MIN_NEWS_WORD_LENGTH = 100
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
