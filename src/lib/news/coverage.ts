import 'server-only'
import { and, count, eq, gte, inArray, max } from 'drizzle-orm'
import { db } from '@/lib/db'
import { articles, categories } from '@/lib/db/schema'
import { SCHEDULE_SLUGS } from './desks'

/** Published articles per category in the last 24 hours (all authors), for the given category slugs. */
export async function categoryCounts24h(slugs: string[], now = new Date()): Promise<Record<string, number>> {
  const out: Record<string, number> = Object.fromEntries(slugs.map((s) => [s, 0]))
  if (slugs.length === 0) return out
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000)
  const rows = await db
    .select({ slug: categories.slug, n: count() })
    .from(articles)
    .innerJoin(categories, eq(articles.categoryId, categories.id))
    .where(and(eq(articles.status, 'published'), gte(articles.publishedAt, dayAgo), inArray(categories.slug, slugs)))
    .groupBy(categories.slug)
  for (const r of rows) out[r.slug] = Number(r.n)
  return out
}

export interface CoverageRow {
  slug: string
  name: string | null
  active: boolean
  last24h: number
  lastPublishedAt: string | null
}

/** Per category: how many articles went out in the last 24 hours and when the last one did. */
export async function getCoverageStatus(): Promise<CoverageRow[]> {
  const [cats, counts, lasts] = await Promise.all([
    db.select({ slug: categories.slug, name: categories.name, isActive: categories.isActive }).from(categories).where(inArray(categories.slug, SCHEDULE_SLUGS)),
    categoryCounts24h(SCHEDULE_SLUGS),
    db
      .select({ slug: categories.slug, at: max(articles.publishedAt) })
      .from(articles)
      .innerJoin(categories, eq(articles.categoryId, categories.id))
      .where(and(eq(articles.status, 'published'), inArray(categories.slug, SCHEDULE_SLUGS)))
      .groupBy(categories.slug),
  ])
  return SCHEDULE_SLUGS.map((slug) => {
    const c = cats.find((x) => x.slug === slug)
    const l = lasts.find((x) => x.slug === slug)
    const at = l?.at ? new Date(l.at as unknown as string | Date).toISOString() : null
    return { slug, name: c?.name ?? null, active: !!c?.isActive, last24h: counts[slug] ?? 0, lastPublishedAt: at }
  })
}
