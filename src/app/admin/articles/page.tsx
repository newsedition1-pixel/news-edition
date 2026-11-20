import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { articles, categories, users } from '@/lib/db/schema'
import { eq, and, desc, sql, ilike } from 'drizzle-orm'
import { requireAdmin } from '@/lib/dal'
import { formatDate } from '@/lib/utils'
import { DeleteArticleBtn } from '@/components/admin/DeleteArticleBtn'
import styles from './page.module.scss'

export const metadata: Metadata = { title: 'Articles' }

interface Props {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>
}

const PAGE_SIZE = 20

export default async function ArticlesPage({ searchParams }: Props) {
  await requireAdmin()
  const { status, page: pageStr, q } = await searchParams
  const page = Math.max(1, Number(pageStr) || 1)

  const conditions = []
  if (status && ['draft', 'preview', 'published'].includes(status)) {
    conditions.push(eq(articles.status, status))
  }
  if (q) {
    conditions.push(ilike(articles.title, `%${q}%`))
  }

  const rows = await db.select({
    id: articles.id, title: articles.title, slug: articles.slug,
    status: articles.status, isFeatured: articles.isFeatured, isAiGenerated: articles.isAiGenerated,
    isBreaking: articles.isBreaking, viewCount: articles.viewCount,
    publishedAt: articles.publishedAt, createdAt: articles.createdAt, updatedAt: articles.updatedAt,
    categoryName: categories.name, categoryColor: categories.color,
    authorName: users.name,
  })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .leftJoin(users, eq(articles.authorId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(articles.updatedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  const hasMore = rows.length === PAGE_SIZE

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Articles</h1>
        <Link href="/admin/articles/new" className={styles.newBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Article
        </Link>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.statusTabs}>
          {[['', 'All'], ['published', 'Published'], ['draft', 'Draft'], ['preview', 'Preview']].map(([val, label]) => (
            <Link
              key={val}
              href={val ? `/admin/articles?status=${val}` : '/admin/articles'}
              className={`${styles.tab} ${status === val || (!status && !val) ? styles.activeTab : ''}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <form className={styles.searchForm}>
          <input name="q" defaultValue={q} placeholder="Search articles…" className={styles.searchInput} />
          {status && <input type="hidden" name="status" value={status} />}
        </form>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th className={styles.colHideOnMobile}>Author</th>
              <th>Status</th>
              <th className={styles.colHideOnMobile}>Views</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={styles.titleCell}>
                  <div className={styles.titleWrapper}>
                    {a.isBreaking && <span className={styles.breakingDot} title="Breaking News" />}
                    {a.isFeatured && <span className={styles.featuredDot} title="Featured" />}
                    <Link href={`/admin/articles/${a.id}/edit`} className={styles.articleTitle}>{a.title}</Link>
                  </div>
                </td>
                <td>
                  {a.categoryName && (
                    <span className={styles.catBadge} style={{ borderColor: a.categoryColor || '#ccc' }}>
                      {a.categoryName}
                    </span>
                  )}
                </td>
                <td className={`${styles.authorCell} ${styles.colHideOnMobile}`}>{a.authorName || '—'}</td>
                <td>
                  <span className={`${styles.badge} ${styles[a.status]}`}>{a.status}</span>
                  {a.isAiGenerated && (
                    <span
                      className={`${styles.badge} ${styles.ai}`}
                      title={a.status === 'published' ? 'Created with AI tools' : 'AI draft: read and edit before publishing'}
                    >
                      AI
                    </span>
                  )}
                </td>
                <td className={styles.colHideOnMobile}>{a.viewCount.toLocaleString()}</td>
                <td className={styles.dateCell}>{formatDate(a.updatedAt, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td>
                  <div className={styles.actions}>
                    <Link href={`/admin/articles/${a.id}/edit`} className={styles.actionBtn} title="Edit">✏️</Link>
                    <Link href={`/admin/articles/${a.id}/preview`} className={styles.actionBtn} title="Preview" target="_blank">👁</Link>
                    {a.status === 'published' && (
                      <Link href={`/article/${a.slug}`} className={styles.actionBtn} title="View" target="_blank">🔗</Link>
                    )}
                    <DeleteArticleBtn id={a.id} title={a.title} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className={styles.empty}>No articles found.</div>}
      </div>

      <div className={styles.pagination}>
        {page > 1 && <Link href={`/admin/articles?page=${page - 1}${status ? `&status=${status}` : ''}`} className={styles.pageBtn}>← Prev</Link>}
        <span className={styles.pageInfo}>Page {page}</span>
        {hasMore && <Link href={`/admin/articles?page=${page + 1}${status ? `&status=${status}` : ''}`} className={styles.pageBtn}>Next →</Link>}
      </div>
    </div>
  )
}
