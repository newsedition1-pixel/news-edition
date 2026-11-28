import 'server-only'
import { db } from '@/lib/db'
import { articles } from '@/lib/db/schema'
import { desc, gte, inArray } from 'drizzle-orm'
import { titleSimilarity, SAME_STORY_THRESHOLD, type Story } from './cluster'
import { findSameStory, SAME_STORY_WINDOW_MS } from './dedupe'

/**
 * Drops stories we already have: any report URL already saved, a near-identical headline among the last
 * 400 articles, or (since 25 Nov 2026) the same story as one of our articles of the last 48 hours, judged
 * on every publisher headline of the story against our headline, excerpt and tags (`findSameStory`).
 */
export async function dropCoveredStories(stories: Story[]): Promise<Story[]> {
  const urls = stories.flatMap((s) => s.items.map((i) => i.link))
  const savedByUrl = urls.length
    ? await db.select({ sourceUrl: articles.sourceUrl }).from(articles).where(inArray(articles.sourceUrl, urls))
    : []
  const seenUrls = new Set(savedByUrl.map((r) => r.sourceUrl))
  const recent = await db.select({ title: articles.title }).from(articles).orderBy(desc(articles.createdAt)).limit(400)
  const lastTwoDays = await db
    .select({ title: articles.title, excerpt: articles.excerpt, tags: articles.tags })
    .from(articles)
    .where(gte(articles.createdAt, new Date(Date.now() - SAME_STORY_WINDOW_MS)))
    .orderBy(desc(articles.createdAt))
    .limit(300)
  return stories.filter(
    (s) =>
      !s.items.some((i) => seenUrls.has(i.link)) &&
      !recent.some((r) => titleSimilarity(r.title, s.lead.title) >= SAME_STORY_THRESHOLD) &&
      !findSameStory({ titles: s.items.map((i) => i.title) }, lastTwoDays)
  )
}

/** Our articles of the last 48 hours (headline, excerpt, tags), for `findSameStory`. One query: the X alerts compare many posts against it. */
export async function recentOwnArticles(): Promise<{ title: string; excerpt: string | null; tags: string[] | null }[]> {
  return db
    .select({ title: articles.title, excerpt: articles.excerpt, tags: articles.tags })
    .from(articles)
    .where(gte(articles.createdAt, new Date(Date.now() - SAME_STORY_WINDOW_MS)))
    .orderBy(desc(articles.createdAt))
    .limit(300)
}
