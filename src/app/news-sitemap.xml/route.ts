import { db } from '@/lib/db'
import { articles } from '@/lib/db/schema'
import { and, desc, eq, gte } from 'drizzle-orm'

// Google News sitemap: only articles published in the last 48 hours,
// max 1,000 URLs, with the <news:news> namespace.
export const revalidate = 900

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  let rows: { slug: string; title: string; publishedAt: Date | null }[] = []

  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000)
    rows = await db
      .select({ slug: articles.slug, title: articles.title, publishedAt: articles.publishedAt })
      .from(articles)
      .where(and(eq(articles.status, 'published'), gte(articles.publishedAt, since)))
      .orderBy(desc(articles.publishedAt))
      .limit(1000)
  } catch (error) {
    console.error('News sitemap generation error:', error)
  }

  const urls = rows
    .filter((a) => a.publishedAt)
    .map(
      (a) => `  <url>
    <loc>${siteUrl}/article/${escapeXml(a.slug)}</loc>
    <news:news>
      <news:publication>
        <news:name>NewsEdition</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${a.publishedAt!.toISOString()}</news:publication_date>
      <news:title>${escapeXml(a.title)}</news:title>
    </news:news>
  </url>`,
    )
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
