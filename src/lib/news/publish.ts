import 'server-only'
import { db } from '@/lib/db'
import { articles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { notifyIndexing } from '@/lib/googleIndexing'
import { shareArticle } from '@/lib/social/share'
import { slugFromTitle } from './meta'
import { decidePlacement, type Placement } from './placement'
import { loadPlacementContext } from './placementDb'
import { recordAudit } from './auditDb'
import type { BuiltArticle } from './pipeline'

export interface SavedArticle {
  id: number
  slug: string
  title: string
  published: boolean
  /** Why the article was kept as a draft although publishing was on, if it was. */
  holdReason: string | null
  /** Whether the article was marked featured and/or breaking (chosen by rules, see placement.ts). */
  placement: Placement
}

/**
 * Saves a finished article. When `autoPublish` is on and the article has nothing left to doubt
 * (`stats.holdReason` is empty) it goes live: Google is told and the home and article pages are
 * refreshed and, when sharing is on, the article goes out on social media. Otherwise it is a draft for an editor.
 */
export async function saveBuiltArticle(
  built: BuiltArticle,
  authorId: string,
  autoPublish: boolean,
  /**
   * `strength`: how many trusted publishers carried the story (+1 if trending); leave out for an editor's own run.
   * `publishers`: how many trusted publishers carried it (falls back to the reports the article was written from).
   */
  opts: { strength?: number; publishers?: number } = {},
): Promise<SavedArticle> {
  const baseSlug = slugFromTitle(built.title)
  const taken = await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, baseSlug)).limit(1)
  const slug = taken.length > 0 ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug

  const holdReason = built.stats.holdReason
  const publish = autoPublish && !holdReason
  const now = new Date()

  // Featured / breaking are chosen by rules (placement.ts); a draft gets neither.
  let placement: Placement = { featured: false, breaking: false, reason: 'not published' }
  if (publish) {
    try {
      placement = decidePlacement(
        {
          publishers: opts.publishers ?? built.stats.sourcesUsed.length,
          title: built.title,
          wordCount: built.stats.wordCount,
          cover: built.stats.imageSource,
          auditScore: built.stats.audit?.score ?? null,
        },
        await loadPlacementContext(built.categoryId, now),
      )
    } catch (err) {
      console.error('Placement error:', err)
      placement = { featured: false, breaking: false, reason: 'placement failed' }
    }
  }

  const [article] = await db
    .insert(articles)
    .values({
      title: built.title,
      slug,
      content: built.content,
      excerpt: built.excerpt || null,
      coverImage: built.coverImage,
      coverImageAlt: built.coverImageAlt,
      coverImagePublicId: built.coverImagePublicId,
      categoryId: built.categoryId,
      authorId,
      status: publish ? 'published' : 'draft',
      tags: built.tags.length ? built.tags : null,
      faqs: built.faqs,
      seoTitle: built.seoTitle || null,
      seoDescription: built.seoDescription || null,
      sourceUrl: built.sourceUrl,
      isAiGenerated: true,
      isFeatured: placement.featured,
      isBreaking: placement.breaking,
      publishedAt: publish ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (publish) {
    console.log(`Placement: ${article.slug}: ${placement.reason}`)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'
    notifyIndexing(`${siteUrl}/article/${article.slug}`, 'URL_UPDATED')
    revalidatePath(`/article/${article.slug}`)
    revalidatePath('/')
    // Social media (off unless the owner turned it on); never throws.
    await shareArticle(article.id, { strength: opts.strength, publishers: opts.publishers })
  }
  revalidatePath('/admin/articles')

  // What the audit found, for the admin screen (never throws).
  const audit = built.stats.audit
  if (audit && audit.mode !== 'off') {
    await recordAudit({
      at: now.toISOString(),
      title: article.title,
      slug: article.slug,
      mode: audit.mode,
      attempts: built.stats.attempts,
      published: publish,
      held: holdReason,
      summary: audit,
    })
  }

  return { id: article.id, slug: article.slug, title: article.title, published: publish, holdReason, placement }
}
