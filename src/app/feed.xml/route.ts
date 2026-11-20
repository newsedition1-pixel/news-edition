import { db } from '@/lib/db'
import { articles, categories, users } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { buildRss, type RssItem } from '@/lib/rss'
import { clip, cleanName, htmlToText } from '@/lib/seo'

// RSS feed of the 50 newest published articles (summary only, links back to the site).
export const revalidate = 300

const HEADERS = { 'Content-Type': 'application/rss+xml; charset=utf-8' }

export async function GET() {
  try {
    const rows = await db
      .select({
        slug: articles.slug,
        title: articles.title,
        excerpt: articles.excerpt,
        seoDescription: articles.seoDescription,
        content: articles.content,
        coverImage: articles.coverImage,
        publishedAt: articles.publishedAt,
        categoryName: categories.name,
        authorName: users.name,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .where(eq(articles.status, 'published'))
      .orderBy(desc(articles.publishedAt))
      .limit(50)

    const items: RssItem[] = rows
      .filter((r) => r.publishedAt)
      .map((r) => ({
        slug: r.slug,
        title: r.title,
        summary: clip(r.excerpt || r.seoDescription || htmlToText(r.content), 300),
        publishedAt: r.publishedAt as Date,
        categoryName: r.categoryName,
        authorName: r.authorName ? cleanName(r.authorName) : null,
        imageUrl: r.coverImage,
      }))

    return new Response(buildRss(items), { headers: HEADERS })
  } catch (error) {
    console.error('RSS feed error:', error)
    return new Response(buildRss([]), { headers: HEADERS })
  }
}
