import 'server-only'
import { db } from '@/lib/db'
import { articles } from '@/lib/db/schema'
import { desc, inArray } from 'drizzle-orm'
import { titleSimilarity, SAME_STORY_THRESHOLD, type Story } from './cluster'

/** Drops stories we already have: any report URL already saved, or a near-identical headline. */
export async function dropCoveredStories(stories: Story[]): Promise<Story[]> {
  const urls = stories.flatMap((s) => s.items.map((i) => i.link))
  const savedByUrl = urls.length
    ? await db.select({ sourceUrl: articles.sourceUrl }).from(articles).where(inArray(articles.sourceUrl, urls))
    : []
  const seenUrls = new Set(savedByUrl.map((r) => r.sourceUrl))
  const recent = await db.select({ title: articles.title }).from(articles).orderBy(desc(articles.createdAt)).limit(400)
  return stories.filter(
    (s) => !s.items.some((i) => seenUrls.has(i.link)) && !recent.some((r) => titleSimilarity(r.title, s.lead.title) >= SAME_STORY_THRESHOLD)
  )
}
