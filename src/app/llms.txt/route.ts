import { db } from '@/lib/db'
import { articles, categories } from '@/lib/db/schema'
import { asc, desc, eq } from 'drizzle-orm'
import { buildLlmsTxt } from '@/lib/llms'

// /llms.txt for AI answer engines: sections and the 30 newest stories, built from the database.
// Replaces the static public/llms.txt (it listed no Sports or Technology and went stale).
export const revalidate = 900

const HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' }

export async function GET() {
  try {
    const [cats, recent] = await Promise.all([
      db
        .select({ name: categories.name, slug: categories.slug, description: categories.description })
        .from(categories)
        .where(eq(categories.isActive, true))
        .orderBy(asc(categories.sortOrder), asc(categories.name)),
      db
        .select({
          slug: articles.slug,
          title: articles.title,
          publishedAt: articles.publishedAt,
          categoryName: categories.name,
        })
        .from(articles)
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .where(eq(articles.status, 'published'))
        .orderBy(desc(articles.publishedAt))
        .limit(30),
    ])
    return new Response(buildLlmsTxt(cats, recent), { headers: HEADERS })
  } catch (error) {
    console.error('llms.txt error:', error)
    return new Response(buildLlmsTxt([], []), { headers: HEADERS })
  }
}
