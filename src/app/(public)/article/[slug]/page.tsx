import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { db } from '@/lib/db'
import { articles, categories, users, comments } from '@/lib/db/schema'
import { eq, and, desc, ne } from 'drizzle-orm'
import { ShareButtons } from '@/components/news/ShareButtons'
import { ArticleCard } from '@/components/news/ArticleCard'
import { NewsletterSignup } from '@/components/news/NewsletterSignup'
import { formatDate } from '@/lib/utils'
import { splitSources, unlinkPublisherLinks } from '@/lib/news/sourcesBlock'
import {
  siteUrl, SITE_NAME, SITE_LOCALE, TWITTER_HANDLE, pageAlternates, cleanName, authorPath, authorRoleLabel, clip,
  articleTitleField, articleDescription, newsArticleJsonLd, breadcrumbJsonLd, wasUpdated,
  wordCountOf, sourceCitations,
} from '@/lib/seo'
import styles from './page.module.scss'
import type { ArticleWithRelations } from '@/types'

interface Props {
  params: Promise<{ slug: string }>
}

async function getArticle(slug: string) {
  const rows = await db.select({
    id: articles.id, title: articles.title, slug: articles.slug,
    content: articles.content, excerpt: articles.excerpt,
    coverImage: articles.coverImage, coverImageAlt: articles.coverImageAlt,
    coverImagePublicId: articles.coverImagePublicId,
    status: articles.status, isFeatured: articles.isFeatured,
    isBreaking: articles.isBreaking, tags: articles.tags, faqs: articles.faqs,
    seoTitle: articles.seoTitle, seoDescription: articles.seoDescription,
    viewCount: articles.viewCount, publishedAt: articles.publishedAt,
    createdAt: articles.createdAt, updatedAt: articles.updatedAt,
    isAiGenerated: articles.isAiGenerated,
    categoryId: categories.id, categoryName: categories.name,
    categorySlug: categories.slug, categoryColor: categories.color,
    authorId: users.id, authorName: users.name, authorImage: users.image,
    authorBio: users.bio, authorRole: users.role,
  })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .leftJoin(users, eq(articles.authorId, users.id))
    .where(and(eq(articles.slug, slug), eq(articles.status, 'published')))
    .limit(1)

  return rows[0] ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const row = await getArticle(slug)
  if (!row) return { title: 'Article Not Found' }

  const url = `${siteUrl}/article/${slug}`
  const headline = row.seoTitle || row.title
  const description = articleDescription({ seoDescription: row.seoDescription, excerpt: row.excerpt, content: row.content })
  const authorName = row.authorName ? cleanName(row.authorName) : null

  return {
    title: articleTitleField(headline),
    description,
    alternates: pageAlternates(url),
    openGraph: {
      type: 'article',
      url,
      siteName: SITE_NAME,
      locale: SITE_LOCALE,
      title: headline,
      description,
      images: row.coverImage ? [{ url: row.coverImage, width: 1200, height: 630, alt: row.coverImageAlt || row.title }] : [],
      publishedTime: row.publishedAt?.toISOString(),
      modifiedTime: (row.updatedAt ?? row.publishedAt)?.toISOString(),
      authors: authorName ? [authorName] : [],
      section: row.categoryName || undefined,
      tags: row.tags || undefined,
    },
    twitter: { card: 'summary_large_image', site: TWITTER_HANDLE, title: headline, description },
  }
}

export async function generateStaticParams() {
  const rows = await db.select({ slug: articles.slug }).from(articles).where(eq(articles.status, 'published'))
  return rows.map((r) => ({ slug: r.slug }))
}

export const revalidate = false

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const row = await getArticle(slug)
  if (!row) notFound()

  const article: ArticleWithRelations = {
    id: row.id, title: row.title, slug: row.slug, content: row.content,
    excerpt: row.excerpt, coverImage: row.coverImage, coverImageAlt: row.coverImageAlt,
    coverImagePublicId: row.coverImagePublicId, status: row.status as 'published',
    isFeatured: row.isFeatured, isBreaking: row.isBreaking, tags: row.tags,
    faqs: row.faqs, seoTitle: row.seoTitle, seoDescription: row.seoDescription,
    viewCount: row.viewCount, publishedAt: row.publishedAt,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    category: row.categoryId ? { id: row.categoryId, name: row.categoryName!, slug: row.categorySlug!, color: row.categoryColor! } : null,
    author: row.authorId ? { id: row.authorId, name: row.authorName!, image: row.authorImage } : null,
  }

  // Fetch related articles & approved comments in parallel
  const [related, approvedComments] = await Promise.all([
    db.select({
      id: articles.id, title: articles.title, slug: articles.slug,
      excerpt: articles.excerpt, coverImage: articles.coverImage,
      coverImageAlt: articles.coverImageAlt, coverImagePublicId: articles.coverImagePublicId,
      content: articles.content, status: articles.status, isFeatured: articles.isFeatured,
      isBreaking: articles.isBreaking, tags: articles.tags, seoTitle: articles.seoTitle,
      seoDescription: articles.seoDescription, viewCount: articles.viewCount,
      publishedAt: articles.publishedAt, createdAt: articles.createdAt, updatedAt: articles.updatedAt,
      categoryId: categories.id, categoryName: categories.name, categorySlug: categories.slug, categoryColor: categories.color,
      authorId: users.id, authorName: users.name, authorImage: users.image,
    })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .where(and(
        eq(articles.status, 'published'),
        ne(articles.slug, slug),
        row.categoryId ? eq(articles.categoryId, row.categoryId) : undefined,
      ))
      .orderBy(desc(articles.publishedAt))
      .limit(3),

    db.select({
      id: comments.id, content: comments.content, createdAt: comments.createdAt,
      guestName: comments.guestName, userId: comments.userId,
      userName: users.name, userImage: users.image,
    })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(and(eq(comments.articleId, row.id), eq(comments.status, 'approved')))
      .orderBy(desc(comments.createdAt))
      .limit(50),
  ])

  const articleUrl = `${siteUrl}/article/${slug}`
  const showUpdated = wasUpdated(article.publishedAt, article.updatedAt)

  // Sources and image credit are shown small, at the very bottom of the page. Older AI articles also link
  // publisher names inside the text; those links are dropped here (the same links are in the sources block).
  const { body: splitBody, sources: sourcesHtml } = splitSources(article.content)
  const contentHtml = row.isAiGenerated ? unlinkPublisherLinks(splitBody) : splitBody

  const jsonLd = newsArticleJsonLd({
    slug,
    title: article.title,
    excerpt: article.excerpt || article.seoDescription,
    coverImage: article.coverImage,
    coverImageAlt: article.coverImageAlt,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
    tags: article.tags,
    category: article.category,
    author: article.author,
    wordCount: wordCountOf(splitBody),
    citations: sourceCitations(sourcesHtml),
  })

  const faqs = article.faqs ?? []
  const faqLd = faqs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  } : null

  const breadcrumbLd = breadcrumbJsonLd([
    { name: 'Home', url: siteUrl },
    ...(article.category ? [{ name: article.category.name, url: `${siteUrl}/${article.category.slug}` }] : []),
    { name: article.title, url: articleUrl },
  ])

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}

      <div className={styles.page}>
        <article className={styles.article}>
          {/* Breadcrumb */}
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            {article.category && (
              <>
                <span aria-hidden="true">›</span>
                <Link href={`/${article.category.slug}`}>{article.category.name}</Link>
              </>
            )}
            <span aria-hidden="true">›</span>
            <span aria-current="page">{article.title}</span>
          </nav>

          {/* Meta */}
          <div className={styles.meta}>
            {article.category && (
              <Link href={`/${article.category.slug}`} className={styles.category} style={{ background: article.category.color }}>
                {article.category.name}
              </Link>
            )}
            {article.isBreaking && <span className={styles.breaking}>Breaking</span>}
          </div>

          <h1 className={styles.title}>{article.title}</h1>
          {article.excerpt && <p className={styles.excerpt}>{article.excerpt}</p>}

          <div className={styles.byline}>
            {article.author && (
              <Link href={authorPath(article.author)} className={styles.author}>
                <div className={styles.authorAvatar}>
                  {article.author.image ? (
                    <Image src={article.author.image} alt={cleanName(article.author.name)} width={40} height={40} />
                  ) : article.author.name.charAt(0)}
                </div>
                <div>
                  <span className={styles.authorName}>{cleanName(article.author.name)}</span>
                  {article.publishedAt && (
                    <time className={styles.date} dateTime={article.publishedAt.toISOString()}>
                      {formatDate(article.publishedAt, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </time>
                  )}
                  {showUpdated && article.updatedAt && (
                    <time className={styles.date} dateTime={article.updatedAt.toISOString()}>
                      Updated {formatDate(article.updatedAt, { timeZone: 'Asia/Kolkata' })}
                    </time>
                  )}
                </div>
              </Link>
            )}
            <ShareButtons title={article.title} url={articleUrl} />
          </div>

          {/* Cover Image */}
          {article.coverImage && (
            <figure className={styles.coverImage}>
              <Image
                src={article.coverImage}
                alt={article.coverImageAlt || article.title}
                width={1200}
                height={630}
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 75vw, 800px"
                priority
                className={styles.img}
              />
              {article.coverImageAlt && <figcaption>{article.coverImageAlt}</figcaption>}
            </figure>
          )}

          {/* Content */}
          <div
            className={`article-content ${styles.content}`}
            dangerouslySetInnerHTML={{ __html: contentHtml }}
          />

          {/* Author box: who published this, with a link to the full profile */}
          {article.author && (
            <aside className={styles.authorBox} aria-label={row.isAiGenerated ? 'Published by' : 'About the author'}>
              <div className={styles.authorAvatar}>
                {article.author.image ? (
                  <Image src={article.author.image} alt={cleanName(article.author.name)} width={40} height={40} />
                ) : article.author.name.charAt(0)}
              </div>
              <div className={styles.authorBoxText}>
                <p className={styles.authorBoxLabel}>{row.isAiGenerated ? 'Published by' : 'About the author'}</p>
                <Link href={authorPath(article.author)} className={styles.authorBoxName}>
                  {cleanName(article.author.name)}
                </Link>
                <span className={styles.authorBoxRole}>{authorRoleLabel(row.authorRole)}</span>
                {row.authorBio && <p className={styles.authorBoxBio}>{clip(row.authorBio, 240)}</p>}
                <Link href={authorPath(article.author)} className={styles.authorBoxMore}>
                  More articles by {cleanName(article.author.name)}
                </Link>
              </div>
            </aside>
          )}

          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div className={styles.tags}>
              <span className={styles.tagsLabel}>Tags:</span>
              {article.tags.map((tag) => (
                <Link key={tag} href={`/search?q=${encodeURIComponent(tag)}`} className={styles.tag}>{tag}</Link>
              ))}
            </div>
          )}

          {/* FAQ */}
          {faqs.length > 0 && (
            <section className={styles.faqSection} aria-label="Frequently asked questions">
              <h2 className={styles.faqTitle}>Frequently Asked Questions</h2>
              <div className={styles.faqList}>
                {faqs.map((faq, i) => (
                  <details key={i} className={styles.faqItem}>
                    <summary className={styles.faqQuestion}>{faq.question}</summary>
                    <p className={styles.faqAnswer}>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          <div className={styles.shareBottom}>
            <ShareButtons title={article.title} url={articleUrl} />
          </div>

          <div className={styles.newsletterWrap}>
            <NewsletterSignup />
          </div>

          {sourcesHtml && (
            <aside
              className={styles.sources}
              aria-label="Sources and image credits"
              dangerouslySetInnerHTML={{ __html: sourcesHtml }}
            />
          )}
        </article>

        <aside className={styles.sidebar} aria-label="Article sidebar">
          {related.length > 0 && (
            <div className={styles.sidebarCard}>
              <h3 className={styles.sidebarTitle}>Related Stories</h3>
              <div className={styles.relatedList}>
                {related.map((r) => (
                  <ArticleCard key={r.id} article={{
                    ...r,
                    status: r.status as 'published',
                    category: r.categoryId ? { id: r.categoryId, name: r.categoryName!, slug: r.categorySlug!, color: r.categoryColor! } : null,
                    author: r.authorId ? { id: r.authorId, name: r.authorName!, image: r.authorImage } : null,
                  }} variant="compact" />
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Comments */}
      <section className={styles.commentsSection} aria-label="Comments">
        <div className={styles.commentsInner}>
          <h2 className={styles.commentsTitle}>
            Comments ({approvedComments.length})
          </h2>
          <CommentForm articleId={article.id} />
          <div className={styles.commentsList}>
            {approvedComments.map((c) => (
              <div key={c.id} className={styles.comment}>
                <div className={styles.commentAvatar}>
                  {c.userImage ? (
                    <Image src={c.userImage} alt={c.userName || ''} width={36} height={36} />
                  ) : (c.userName || c.guestName || 'A').charAt(0).toUpperCase()}
                </div>
                <div className={styles.commentBody}>
                  <div className={styles.commentMeta}>
                    <span className={styles.commentAuthor}>{c.userName || c.guestName || 'Anonymous'}</span>
                    <time className={styles.commentDate}>{formatDate(c.createdAt)}</time>
                  </div>
                  <p className={styles.commentContent}>{c.content}</p>
                </div>
              </div>
            ))}
            {approvedComments.length === 0 && (
              <p className={styles.noComments}>Be the first to comment!</p>
            )}
          </div>
        </div>
      </section>
    </>
  )
}

// Inline comment form (client component)
import { CommentFormInline as CommentForm } from './CommentForm'
