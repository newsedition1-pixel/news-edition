import 'server-only'
import { and, count, eq, gte, lt } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { articles } from '@/lib/db/schema'
import { BREAKING_HOURS, type PlacementContext } from './placement'

const HOUR = 3_600_000

/** What is already featured or breaking, so `decidePlacement` can keep both rare. */
export async function loadPlacementContext(categoryId: number | null, now = new Date()): Promise<PlacementContext> {
  const dayAgo = new Date(now.getTime() - 24 * HOUR)
  const breakingSince = new Date(now.getTime() - BREAKING_HOURS * HOUR)
  const published = eq(articles.status, 'published')
  const [breaking, featured, inCategory] = await Promise.all([
    db.select({ n: count() }).from(articles).where(and(published, eq(articles.isBreaking, true), gte(articles.publishedAt, breakingSince))),
    db.select({ n: count() }).from(articles).where(and(published, eq(articles.isFeatured, true), gte(articles.publishedAt, dayAgo))),
    categoryId === null
      ? Promise.resolve([{ n: 0 }])
      : db.select({ n: count() }).from(articles).where(and(published, eq(articles.isFeatured, true), eq(articles.categoryId, categoryId), gte(articles.publishedAt, dayAgo))),
  ])
  return {
    breakingNow: Number(breaking[0]?.n ?? 0),
    featuredToday: Number(featured[0]?.n ?? 0),
    featuredTodayInCategory: Number(inCategory[0]?.n ?? 0),
  }
}

/** Removes the breaking flag from AI-written articles older than `BREAKING_HOURS` (an editor's own flags are left alone). */
export async function expireBreaking(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - BREAKING_HOURS * HOUR)
  const rows = await db
    .update(articles)
    .set({ isBreaking: false })
    .where(and(eq(articles.isBreaking, true), eq(articles.isAiGenerated, true), lt(articles.publishedAt, before)))
    .returning({ id: articles.id })
  if (rows.length > 0) revalidatePath('/')
  return rows.length
}
