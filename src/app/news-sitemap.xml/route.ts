import { db } from '@/lib/db'
import { articles } from '@/lib/db/schema'
import { eq, and, gte, desc } from 'drizzle-orm'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'
const publicationName = 'NewsEdition'
const language = 'en'

export const revalidate = 300
export const dynamic = 'force-dynamic'

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  try {
    const twoDaysAgo = new Date()
    twoDaysAgo.setHours(twoDaysAgo.getHours() - 48)

    const recentArticles = await db
      .select({
        slug: articles.slug,
        title: articles.title,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          gte(articles.publishedAt, twoDaysAgo)
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(1000)

    const urlEntries = recentArticles
      .map((article) => {
        const pubDate = article.publishedAt
          ? new Date(article.publishedAt).toISOString()
          : new Date().toISOString()
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

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urlEntries}
</urlset>`

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    })
  } catch (error) {
    console.error('News sitemap error:', error)
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
</urlset>`
    return new Response(emptyXml, {
      headers: { 'Content-Type': 'application/xml' },
    })
  }
}
