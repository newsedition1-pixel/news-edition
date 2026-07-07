import { db } from '@/lib/db'
import { articles } from '@/lib/db/schema'
import { and, desc, eq, gte } from 'drizzle-orm'

// Google News sitemap: only articles published in the last 48 hours,
// max 1,000 URLs, with the <news:news> namespace.
export const revalidate = 300

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'
const publicationName = 'NewsEdition'
const language = 'en'

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const XML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">`

export async function GET() {
  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000)

    const recentArticles = await db
      .select({ slug: articles.slug, title: articles.title, publishedAt: articles.publishedAt })
      .from(articles)
      .where(and(eq(articles.status, 'published'), gte(articles.publishedAt, since)))
      .orderBy(desc(articles.publishedAt))
      .limit(1000)

    const urlEntries = recentArticles
      .map((article) => {
        const pubDate = (article.publishedAt ?? new Date()).toISOString()
        return `  <url>
    <loc>${siteUrl}/article/${escapeXml(article.slug)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(publicationName)}</news:name>
        <news:language>${language}</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>
  </url>`
      })
      .join('\n')

    return new Response(`${XML_HEADER}\n${urlEntries}\n</urlset>`, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  } catch (error) {
    console.error('News sitemap error:', error)
    return new Response(`${XML_HEADER}\n</urlset>`, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }
}
