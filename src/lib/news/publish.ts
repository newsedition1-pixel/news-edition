import 'server-only'
import { db } from '@/lib/db'
import { articles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { notifyIndexing } from '@/lib/googleIndexing'
import { slugFromTitle } from './meta'
import type { BuiltArticle } from './pipeline'

export interface SavedArticle {
  id: number
  slug: string
  title: string
  published: boolean
  /** Why the article was kept as a draft although publishing was on, if it was. */
  holdReason: string | null
}

/**
 * Saves a finished article. When `autoPublish` is on and the article has nothing left to doubt
 * (`stats.holdReason` is empty) it goes live: Google is told and the home and article pages are
 * refreshed. Otherwise it is a draft for an editor.
 */
export async function saveBuiltArticle(built: BuiltArticle, authorId: string, autoPublish: boolean): Promise<SavedArticle> {
  const baseSlug = slugFromTitle(built.title)
  const taken = await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, baseSlug)).limit(1)
  const slug = taken.length > 0 ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug

  const holdReason = built.stats.holdReason
  const publish = autoPublish && !holdReason
  const now = new Date()
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
      publishedAt: publish ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  if (publish) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'
    notifyIndexing(`${siteUrl}/article/${article.slug}`, 'URL_UPDATED')
    revalidatePath(`/article/${article.slug}`)
    revalidatePath('/')
  }
  revalidatePath('/admin/articles')

  return { id: article.id, slug: article.slug, title: article.title, published: publish, holdReason }
}
