import Link from 'next/link'
import Image from 'next/image'
import styles from './ArticleCard.module.scss'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { ArticleWithRelations } from '@/types'

interface ArticleCardProps {
  article: ArticleWithRelations
  variant?: 'default' | 'hero' | 'compact'
  priority?: boolean
}

export function ArticleCard({ article, variant = 'default', priority = false }: ArticleCardProps) {
  const { title, slug, excerpt, coverImage, coverImageAlt, category, author, publishedAt, viewCount, isBreaking } = article

  return (
    /*
      FIX 1: aria-label removed — it was making anchor text = full title
      string which Seobility flagged as "anchor text too long".
      The link's visible text content (the <p> title below) serves as
      the accessible name automatically.

      FIX 2: <h3> → <p> for article card titles.
      Homepage had 35 headings for ~1037 words — Seobility warns this
      ratio is too high. Article titles in cards are NOT document-outline
      headings; they are list items inside labelled sections (Latest News,
      Politics, etc.). Using <p> removes ~25 heading tags, bringing the
      total down to ~10 which is proportionate to the text volume.
      Visual appearance is unchanged — same CSS class applied.
    */
    <Link
      href={`/article/${slug}`}
      className={cn(styles.card, variant === 'hero' && styles.hero, variant === 'compact' && styles.compact)}
    >
      <div className={styles.imageWrapper}>
        {coverImage ? (
          <Image
            src={coverImage}
            alt={coverImageAlt || title}
            fill
            sizes={
              variant === 'compact'
                ? '100px'
                : variant === 'hero'
                ? '(max-width: 768px) 100vw, 55vw'
                : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'
            }
            className={styles.img}
            priority={priority}
          />
        ) : (
          <div className={styles.placeholder}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
        {category && (
          <span className={styles.categoryBadge} style={{ background: category.color }}>
            {category.name}
          </span>
        )}
        {isBreaking && <span className={styles.breakingBadge}>Breaking</span>}
      </div>

      <div className={styles.body}>
        <div className={styles.meta}>
          {category && <span>{category.name}</span>}
          {category && publishedAt && <span className={styles.dot}>·</span>}
          {publishedAt && (
            <time dateTime={new Date(publishedAt).toISOString()}>
              {formatRelativeTime(publishedAt)}
            </time>
          )}
        </div>

        {/* FIX: h3 → p. Card titles are not document-structure headings. */}
        <p className={styles.title}>{title}</p>

        {variant !== 'compact' && excerpt && (
          <p className={styles.excerpt}>{excerpt}</p>
        )}

        <div className={styles.footer}>
          {author && (
            <div className={styles.author}>
              <div className={styles.avatar}>
                {author.image ? (
                  <Image src={author.image} alt={author.name} width={24} height={24} />
                ) : (
                  author.name.charAt(0)
                )}
              </div>
              <span>{author.name}</span>
            </div>
          )}
          {viewCount > 0 && (
            <div className={styles.views}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>{viewCount.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
