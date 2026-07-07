import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/dal'
import { db } from '@/lib/db'
import { articles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { slugify, sanitizeFaqs } from '@/lib/utils'
import { deleteFromCloudinary } from '@/lib/cloudinary'
import { notifyIndexing } from '@/lib/googleIndexing'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const articleId = Number(id)
    if (isNaN(articleId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const [existing] = await db.select().from(articles).where(eq(articles.id, articleId))
    if (!existing) return NextResponse.json({ error: 'Article not found' }, { status: 404 })

    const body = await request.json()
    const {
      title, content, excerpt, coverImage, coverImageAlt, coverImagePublicId,
      categoryId, status, isFeatured, isBreaking, tags, faqs,
      seoTitle, seoDescription, publishedAt, slug: customSlug,
    } = body

    let slug = existing.slug
    if (customSlug?.trim() && customSlug.trim() !== existing.slug) {
      const newSlug = slugify(customSlug)
      const conflict = await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, newSlug))
      if (conflict.length === 0 || conflict[0].id === articleId) slug = newSlug
    }

    const wasPublished = existing.status === 'published'
    const becomingPublished = status === 'published' && !wasPublished
    const resolvedPublishedAt = becomingPublished
      ? (publishedAt ? new Date(publishedAt) : new Date())
      : (status === 'published' ? existing.publishedAt : null)

    const [updated] = await db.update(articles).set({
      title: title?.trim() ?? existing.title,
      slug,
      content: content ?? existing.content,
      excerpt: excerpt?.trim() || null,
      coverImage: coverImage ?? existing.coverImage,
      coverImageAlt: coverImageAlt?.trim() || null,
      coverImagePublicId: coverImagePublicId ?? existing.coverImagePublicId,
      categoryId: categoryId !== undefined ? (categoryId ? Number(categoryId) : null) : existing.categoryId,
      status: status ?? existing.status,
      isFeatured: isFeatured !== undefined ? Boolean(isFeatured) : existing.isFeatured,
      isBreaking: isBreaking !== undefined ? Boolean(isBreaking) : existing.isBreaking,
      tags: tags !== undefined ? (tags?.length ? tags : null) : existing.tags,
      faqs: faqs !== undefined ? sanitizeFaqs(faqs) : existing.faqs,
      seoTitle: seoTitle?.trim() || null,
      seoDescription: seoDescription?.trim() || null,
      publishedAt: resolvedPublishedAt,
      updatedAt: new Date(),
    }).where(eq(articles.id, articleId)).returning()

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'
    const articleUrl = `${siteUrl}/article/${updated.slug}`

    // Article pages cache indefinitely (revalidate = false) — purge on edit
    revalidatePath(`/article/${updated.slug}`)
    if (existing.slug !== updated.slug) revalidatePath(`/article/${existing.slug}`)
    // Keep the ISR homepage fresh when published content changes
    if (wasPublished || updated.status === 'published') revalidatePath('/')

    if (becomingPublished) {
      // Draft/preview → published
      notifyIndexing(articleUrl, 'URL_UPDATED')
    } else if (wasPublished && updated.status !== 'published') {
      // Published → unpublished (draft/preview)
      notifyIndexing(articleUrl, 'URL_DELETED')
    } else if (wasPublished && updated.status === 'published') {
      // Published → still published (content updated)
      notifyIndexing(articleUrl, 'URL_UPDATED')
    }

    return NextResponse.json({ id: updated.id, slug: updated.slug })
  } catch (error) {
    console.error('Update article error:', error)
    return NextResponse.json({ error: 'Failed to update article' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const articleId = Number(id)
    if (isNaN(articleId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })

    const [existing] = await db.select().from(articles).where(eq(articles.id, articleId))
    if (!existing) return NextResponse.json({ error: 'Article not found' }, { status: 404 })

    if (existing.coverImagePublicId) {
      await deleteFromCloudinary(existing.coverImagePublicId).catch(() => {})
    }

    await db.delete(articles).where(eq(articles.id, articleId))

    revalidatePath(`/article/${existing.slug}`)

    if (existing.status === 'published') {
      revalidatePath('/')
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'
      notifyIndexing(`${siteUrl}/article/${existing.slug}`, 'URL_DELETED')
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete article error:', error)
    return NextResponse.json({ error: 'Failed to delete article' }, { status: 500 })
  }
}
