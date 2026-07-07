import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireAdmin } from '@/lib/dal'
import { db } from '@/lib/db'
import { articles, categories } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ArticleEditor } from '@/components/admin/ArticleEditor'
import styles from './page.module.scss'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const [article] = await db.select({ title: articles.title }).from(articles).where(eq(articles.id, Number(id)))
  return { title: article ? `Edit: ${article.title}` : 'Edit Article' }
}

export default async function EditArticlePage({ params }: Props) {
  await requireAdmin()
  const { id } = await params
  const articleId = Number(id)

  if (isNaN(articleId)) notFound()

  const [article] = await db.select().from(articles).where(eq(articles.id, articleId))
  if (!article) notFound()

  const cats = await db.select().from(categories).where(eq(categories.isActive, true)).orderBy(categories.sortOrder)

  const initialData = {
    title: article.title,
    slug: article.slug,
    content: article.content,
    excerpt: article.excerpt ?? '',
    coverImage: article.coverImage,
    coverImageAlt: article.coverImageAlt ?? '',
    coverImagePublicId: article.coverImagePublicId,
    categoryId: article.categoryId,
    status: article.status,
    isFeatured: article.isFeatured,
    isBreaking: article.isBreaking,
    tags: article.tags ?? [],
    faqs: article.faqs ?? [],
    seoTitle: article.seoTitle ?? '',
    seoDescription: article.seoDescription ?? '',
    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : null,
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.breadcrumb}>
          <Link href="/admin/articles" className={styles.breadcrumbLink}>Articles</Link>
          <span className={styles.sep}>/</span>
          <span className={styles.breadcrumbCurrent}>Edit</span>
        </div>
        <div className={styles.headerActions}>
          <Link href={`/admin/articles/${articleId}/preview`} target="_blank" className={styles.previewBtn}>
            Preview ↗
          </Link>
          {article.status === 'published' && (
            <Link href={`/article/${article.slug}`} target="_blank" className={styles.viewBtn}>
              View Live ↗
            </Link>
          )}
        </div>
      </div>
      <ArticleEditor articleId={articleId} initialData={initialData} categories={cats} />
    </div>
  )
}
