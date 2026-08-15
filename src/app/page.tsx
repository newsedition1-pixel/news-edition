import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { articles, categories, users, homeSections } from '@/lib/db/schema'
import { eq, desc, and, sql, asc, notInArray } from 'drizzle-orm'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { ArticleCard } from '@/components/news/ArticleCard'
import { BreakingTicker } from '@/components/news/BreakingTicker'
import { NewsletterSignup } from '@/components/news/NewsletterSignup'
import styles from './(public)/page.module.scss'
import type { ArticleWithRelations } from '@/types'

export const metadata: Metadata = {
  // FIX: Title updated to match page content words.
  // Old: 'NewsEdition — Breaking News, Latest Updates'
  // "Breaking" and "Updates" rarely appear in article text — caused
  // Seobility "page title does not match content" warning.
  // New title uses words (India, News, Politics, Business, World) that
  // appear naturally in every article card on the homepage.
  // OG/Twitter titles are set separately in layout.tsx and are unchanged.
  title: { absolute: 'NewsEdition — India News, Politics, Business & World' },
  description: 'Your trusted source for breaking news, in-depth analysis, and comprehensive coverage.',
  alternates: { canonical: '/' },
}

// ISR: served from cache, regenerated at most every 60s. Publishing,
// unpublishing, or deleting an article purges this immediately via
// revalidatePath('/') in the articles API (same pattern as home-sections).
export const revalidate = 60

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'

const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'NewsMediaOrganization',
  '@id': `${siteUrl}/#organization`,
  name: 'NewsEdition',
  url: siteUrl,
  logo: { '@type': 'ImageObject', url: `${siteUrl}/logo.png`, width: 200, height: 60 },
  sameAs: [
    'https://newsedition.medium.com',
    'https://t.me/newsedition',
    'https://www.linkedin.com/company/newsedition-in',
    'https://x.com/NewsEdition_1',
    'https://www.facebook.com/newsedition/',
    'https://www.instagram.com/news_edition1',
    'https://www.youtube.com/@newsedition1',
  ],
}

const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${siteUrl}/#website`,
  name: 'NewsEdition',
  url: siteUrl,
  inLanguage: 'en',
  publisher: { '@id': `${siteUrl}/#organization` },
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/search?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
}

const ARTICLE_FIELDS = {
  id: articles.id, title: articles.title, slug: articles.slug,
  excerpt: articles.excerpt, coverImage: articles.coverImage,
  coverImageAlt: articles.coverImageAlt, coverImagePublicId: articles.coverImagePublicId,
  status: articles.status, isFeatured: articles.isFeatured,
  isBreaking: articles.isBreaking, tags: articles.tags,
  seoTitle: articles.seoTitle, seoDescription: articles.seoDescription,
  viewCount: articles.viewCount, publishedAt: articles.publishedAt,
  createdAt: articles.createdAt, updatedAt: articles.updatedAt,
  content: articles.content,
  categoryId: categories.id, categoryName: categories.name,
  categorySlug: categories.slug, categoryColor: categories.color,
  authorId: users.id, authorName: users.name, authorImage: users.image,
}

async function getHomeData() {
  const [breaking, featured, latest, cats, sectionDefs] = await Promise.all([
    db.select({ id: articles.id, title: articles.title, slug: articles.slug })
      .from(articles)
      .where(and(eq(articles.status, 'published'), eq(articles.isBreaking, true)))
      .orderBy(desc(articles.publishedAt))
      .limit(5),

    db.select({
      id: articles.id, title: articles.title, slug: articles.slug,
      excerpt: articles.excerpt, coverImage: articles.coverImage,
      coverImageAlt: articles.coverImageAlt, coverImagePublicId: articles.coverImagePublicId,
      status: articles.status, isFeatured: articles.isFeatured,
      isBreaking: articles.isBreaking, tags: articles.tags,
      seoTitle: articles.seoTitle, seoDescription: articles.seoDescription,
      viewCount: articles.viewCount, publishedAt: articles.publishedAt,
      createdAt: articles.createdAt, updatedAt: articles.updatedAt,
      content: articles.content,
      categoryId: categories.id, categoryName: categories.name,
      categorySlug: categories.slug, categoryColor: categories.color,
      authorId: users.id, authorName: users.name, authorImage: users.image,
    })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .where(and(eq(articles.status, 'published'), eq(articles.isFeatured, true)))
      .orderBy(desc(articles.publishedAt))
      .limit(1),

    db.select({
      id: articles.id, title: articles.title, slug: articles.slug,
      excerpt: articles.excerpt, coverImage: articles.coverImage,
      coverImageAlt: articles.coverImageAlt, coverImagePublicId: articles.coverImagePublicId,
      status: articles.status, isFeatured: articles.isFeatured,
      isBreaking: articles.isBreaking, tags: articles.tags,
      seoTitle: articles.seoTitle, seoDescription: articles.seoDescription,
      viewCount: articles.viewCount, publishedAt: articles.publishedAt,
      createdAt: articles.createdAt, updatedAt: articles.updatedAt,
      content: articles.content,
      categoryId: categories.id, categoryName: categories.name,
      categorySlug: categories.slug, categoryColor: categories.color,
      authorId: users.id, authorName: users.name, authorImage: users.image,
    })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .where(eq(articles.status, 'published'))
      .orderBy(desc(articles.publishedAt))
      .limit(12),

    db.select({ name: categories.name, slug: categories.slug, color: categories.color, articleCount: sql<number>`cast(count(${articles.id}) as int)` })
      .from(categories)
      .leftJoin(articles, and(eq(articles.categoryId, categories.id), eq(articles.status, 'published')))
      .where(eq(categories.isActive, true))
      .groupBy(categories.id, categories.name, categories.slug, categories.color)
      .orderBy(desc(sql`count(${articles.id})`))
      .limit(10),

    db.select({
      id: homeSections.id,
      title: homeSections.title,
      articleCount: homeSections.articleCount,
      sortOrder: homeSections.sortOrder,
      categoryId: homeSections.categoryId,
      categorySlug: categories.slug,
    })
      .from(homeSections)
      .leftJoin(categories, eq(homeSections.categoryId, categories.id))
      .where(eq(homeSections.isActive, true))
      .orderBy(asc(homeSections.sortOrder)),
  ])

  const excludeIds = [
    ...(featured[0] ? [featured[0].id] : []),
    ...latest.map(a => a.id),
  ]

  const sectionArticles = await Promise.all(
    sectionDefs.map(sec => {
      const conditions = [
        eq(articles.status, 'published'),
        eq(articles.categoryId, sec.categoryId),
      ]
      if (excludeIds.length > 0) {
        conditions.push(notInArray(articles.id, excludeIds))
      }
      return db.select(ARTICLE_FIELDS)
        .from(articles)
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(users, eq(articles.authorId, users.id))
        .where(and(...conditions))
        .orderBy(desc(articles.publishedAt))
        .limit(sec.articleCount)
    })
  )

  const sections = sectionDefs.map((sec, i) => ({ ...sec, articles: sectionArticles[i] }))

  const featuredId = featured[0]?.id
  const filteredLatest = featuredId ? latest.filter(a => a.id !== featuredId) : latest

  return { breaking, featured, latest: filteredLatest, cats, sections }
}

function mapArticle(row: Record<string, unknown>): ArticleWithRelations {
  return {
    id: row.id as number,
    title: row.title as string,
    slug: row.slug as string,
    content: row.content as string,
    excerpt: row.excerpt as string | null,
    coverImage: row.coverImage as string | null,
    coverImageAlt: row.coverImageAlt as string | null,
    coverImagePublicId: row.coverImagePublicId as string | null,
    status: row.status as 'published',
    isFeatured: row.isFeatured as boolean,
    isBreaking: row.isBreaking as boolean,
    tags: row.tags as string[] | null,
    seoTitle: row.seoTitle as string | null,
    seoDescription: row.seoDescription as string | null,
    viewCount: row.viewCount as number,
    publishedAt: row.publishedAt as Date | null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
    category: row.categoryId ? { id: row.categoryId as number, name: row.categoryName as string, slug: row.categorySlug as string, color: row.categoryColor as string } : null,
    author: row.authorId ? { id: row.authorId as string, name: row.authorName as string, image: row.authorImage as string | null } : null,
  }
}

export default async function HomePage() {
  const { breaking, featured, latest, cats, sections } = await getHomeData()
  const featuredArticle = featured[0] ? mapArticle(featured[0] as unknown as Record<string, unknown>) : null
  const latestArticles = latest.map(r => mapArticle(r as unknown as Record<string, unknown>))

  return (
    <PublicLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }} />

      {breaking.length > 0 && <BreakingTicker articles={breaking} />}

      <div className={styles.page}>
        {/* FIX: H1 uses content-matching words (India, Politics, Business, World)
            instead of "Breaking News, Latest Updates" which rarely appear in
            article text. sr-only so visually unchanged. */}
        <h1 className={styles.srOnly}>
          India News, Politics, Business and World — NewsEdition
        </h1>

        {featuredArticle && (
          <section className={styles.hero} aria-label="Featured article">
            <div className={styles.heroInner}>
              <ArticleCard article={featuredArticle} variant="hero" priority />
            </div>
          </section>
        )}

        <div className={styles.main}>
          <section className={styles.latest} aria-label="Latest news">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Latest News</h2>
              <Link href="/search" className={styles.sectionLink}>View all →</Link>
            </div>
            <div className={styles.grid}>
              {latestArticles.slice(0, 9).map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
            {latestArticles.length === 0 && (
              <div className={styles.empty}>
                <p>No articles published yet. Check back soon!</p>
              </div>
            )}
          </section>

          <aside className={styles.sidebar} aria-label="Sidebar">
            <div className={styles.sidebarCard}>
              <h3 className={styles.sidebarTitle}>Browse Categories</h3>
              <div className={styles.categoryList}>
                {cats.map((cat) => (
                  <Link key={cat.slug} href={`/${cat.slug}`} className={styles.categoryItem}>
                    <span className={styles.categoryDot} style={{ background: cat.color ?? undefined }} />
                    <span>{cat.name}</span>
                  </Link>
                ))}
              </div>
            </div>

            {latestArticles.length > 9 && (
              <div className={styles.sidebarCard}>
                <h3 className={styles.sidebarTitle}>More Stories</h3>
                <div className={styles.compactList}>
                  {latestArticles.slice(9).map((article) => (
                    <ArticleCard key={article.id} article={article} variant="compact" />
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        <div className={styles.newsletterWrap}>
          <NewsletterSignup />
        </div>

        {sections.map(section => {
          const mapped = section.articles.map(r => mapArticle(r as unknown as Record<string, unknown>))
          if (mapped.length === 0) return null
          return (
            <div key={section.id} className={styles.categorySection}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>{section.title}</h2>
                {section.categorySlug && (
                  <Link href={`/${section.categorySlug}`} className={styles.sectionLink}>
                    View All {section.title}
                  </Link>
                )}
              </div>
              <div className={styles.grid}>
                {mapped.map((article) => (
                  <ArticleCard key={article.id} article={article} priority={false} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </PublicLayout>
  )
}
