import type { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { articles, categories, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { slugify } from '@/lib/utils'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'

export const revalidate = 3600
export const dynamic = 'force-dynamic'

// Static, evergreen pages. Dates are intentionally omitted: a fake "modified now"
// teaches Google to ignore lastmod for the whole sitemap.
const STATIC_PAGES = ['about', 'editorial-policy', 'corrections', 'grievance', 'contact', 'advertise', 'privacy', 'terms']

function latest(a: Date | undefined, b: Date | null | undefined): Date | undefined {
  if (!b) return a
  return !a || b > a ? b : a
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    // Check if database URL is available
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL not found')
      return getFallbackSitemap()
    }

    const [publishedArticles, activeCategories] = await Promise.all([
      db.select({
        slug: articles.slug,
        updatedAt: articles.updatedAt,
        publishedAt: articles.publishedAt,
        categoryId: articles.categoryId,
        authorId: articles.authorId,
      })
        .from(articles)
        .where(eq(articles.status, 'published')),
      db.select({ id: categories.id, slug: categories.slug, parentId: categories.parentId })
        .from(categories)
        .where(eq(categories.isActive, true)),
    ])

    const activeAuthors = await db.selectDistinct({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(articles, eq(articles.authorId, users.id))
      .where(eq(articles.status, 'published'))

    // lastmod must reflect real content changes: latest article activity per category / author / site.
    const latestByCategory = new Map<number, Date>()
    const latestByAuthor = new Map<string, Date>()
    let latestOverall: Date | undefined
    for (const a of publishedArticles) {
      const when = latest(a.publishedAt ?? undefined, a.updatedAt)
      if (!when) continue
      latestOverall = latest(latestOverall, when)
      if (a.categoryId != null) latestByCategory.set(a.categoryId, latest(latestByCategory.get(a.categoryId), when)!)
      if (a.authorId) latestByAuthor.set(a.authorId, latest(latestByAuthor.get(a.authorId), when)!)
    }
    // A parent category page also lists its subcategories' articles.
    const categoryLastmod = (cat: { id: number }) => {
      let d = latestByCategory.get(cat.id)
      for (const child of activeCategories) {
        if (child.parentId === cat.id) d = latest(d, latestByCategory.get(child.id))
      }
      return d
    }

    const staticRoutes: MetadataRoute.Sitemap = [
      { url: siteUrl, lastModified: latestOverall, changeFrequency: 'hourly', priority: 1.0 },
      ...STATIC_PAGES.map((p) => ({ url: `${siteUrl}/${p}`, changeFrequency: 'yearly' as const, priority: 0.3 })),
    ]

    const categoryRoutes: MetadataRoute.Sitemap = activeCategories.map((cat) => ({
      url: `${siteUrl}/${cat.slug}`,
      lastModified: categoryLastmod(cat),
      changeFrequency: 'hourly',
      priority: 0.8,
    }))

    const articleRoutes: MetadataRoute.Sitemap = publishedArticles.map((a) => ({
      url: `${siteUrl}/article/${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.9,
    }))

    const authorRoutes: MetadataRoute.Sitemap = activeAuthors.map((a) => ({
      url: `${siteUrl}/author/${a.id}/${slugify(a.name)}`,
      lastModified: latestByAuthor.get(a.id),
      changeFrequency: 'weekly',
      priority: 0.5,
    }))

    return [...staticRoutes, ...categoryRoutes, ...articleRoutes, ...authorRoutes]
  } catch (error) {
    console.error('Sitemap generation error:', error)
    return getFallbackSitemap()
  }
}

function getFallbackSitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, lastModified: new Date(), changeFrequency: 'hourly', priority: 1.0 },
  ]
}
