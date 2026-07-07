import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { requireAdmin } from '@/lib/dal'
import { db } from '@/lib/db'
import { articles, categories, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { formatDate } from '@/lib/utils'
import styles from './page.module.scss'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ArticlePreviewPage({ params }: Props) {
  await requireAdmin()
  const { id } = await params
  const articleId = Number(id)
  if (isNaN(articleId)) notFound()

  const [row] = await db
    .select({
      id: articles.id, title: articles.title, slug: articles.slug,
      content: articles.content, excerpt: articles.excerpt,
      coverImage: articles.coverImage, coverImageAlt: articles.coverImageAlt,
      status: articles.status, isFeatured: articles.isFeatured, isBreaking: articles.isBreaking,
      tags: articles.tags, faqs: articles.faqs,
      publishedAt: articles.publishedAt, updatedAt: articles.updatedAt,
      categoryName: categories.name, categoryColor: categories.color, categorySlug: categories.slug,
      authorName: users.name, authorImage: users.image,
    })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .leftJoin(users, eq(articles.authorId, users.id))
    .where(eq(articles.id, articleId))

  if (!row) notFound()

  return (
    <div className={styles.preview}>
      {/* Preview banner */}
      <div className={styles.banner}>
        <div className={styles.bannerInner}>
          <div className={styles.bannerLeft}>
            <span className={styles.bannerBadge}>Preview Mode</span>
            <span className={styles.bannerStatus}>Status: <strong>{row.status}</strong></span>
          </div>
          <div className={styles.bannerRight}>
            <Link href={`/admin/articles/${articleId}/edit`} className={styles.editBtn}>Edit Article</Link>
            {row.status === 'published' && (
              <Link href={`/article/${row.slug}`} target="_blank" className={styles.liveBtn}>View Live ↗</Link>
            )}
          </div>
        </div>
      </div>

      {/* Article content */}
      <article className={styles.article}>
        <div className={styles.container}>
          {/* Badges */}
          <div className={styles.badges}>
            {row.isBreaking && <span className={styles.breaking}>Breaking</span>}
            {row.isFeatured && <span className={styles.featured}>Featured</span>}
            {row.categoryName && (
              <span className={styles.category} style={{ borderColor: row.categoryColor || '#ccc' }}>
                {row.categoryName}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className={styles.title}>{row.title}</h1>

          {/* Byline */}
          <div className={styles.byline}>
            {row.authorImage && (
              <Image src={row.authorImage} alt={row.authorName || ''} width={32} height={32} className={styles.authorImg} />
            )}
            <div>
              <span className={styles.authorName}>{row.authorName || 'Admin'}</span>
              <span className={styles.bylineSep}> · </span>
              <time className={styles.date}>{formatDate(row.publishedAt || row.updatedAt)}</time>
            </div>
          </div>

          {/* Cover */}
          {row.coverImage && (
            <div className={styles.cover}>
              <Image src={row.coverImage} alt={row.coverImageAlt || row.title} fill style={{ objectFit: 'cover' }} priority />
            </div>
          )}

          {/* Content */}
          <div
            className={`${styles.content} article-content`}
            dangerouslySetInnerHTML={{ __html: row.content }}
          />

          {/* FAQ */}
          {row.faqs && row.faqs.length > 0 && (
            <section className={styles.faqSection}>
              <h2 className={styles.faqTitle}>Frequently Asked Questions</h2>
              {row.faqs.map((faq, i) => (
                <details key={i} className={styles.faqItem} open>
                  <summary className={styles.faqQuestion}>{faq.question}</summary>
                  <p className={styles.faqAnswer}>{faq.answer}</p>
                </details>
              ))}
            </section>
          )}

          {/* Tags */}
          {row.tags && row.tags.length > 0 && (
            <div className={styles.tags}>
              {row.tags.map((tag) => (
                <span key={tag} className={styles.tag}>{tag}</span>
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  )
}
