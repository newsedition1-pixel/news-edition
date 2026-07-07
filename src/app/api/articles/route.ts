import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/dal'
import { db } from '@/lib/db'
import { articles, categories } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { slugify, sanitizeFaqs } from '@/lib/utils'
import { notifyIndexing } from '@/lib/googleIndexing'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin()
    const body = await request.json()

    const {
      title, content, excerpt, coverImage, coverImageAlt, coverImagePublicId,
      categoryId, status, isFeatured, isBreaking, tags, faqs,
      seoTitle, seoDescription, publishedAt, slug: customSlug,
    } = body

    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    if (!content?.trim()) return NextResponse.json({ error: 'Content is required' }, { status: 400 })

    let slug = customSlug?.trim() ? slugify(customSlug) : slugify(title)

    // Ensure unique slug
    const existing = await db.select({ slug: articles.slug }).from(articles).where(eq(articles.slug, slug))
    if (existing.length > 0) {
      slug = `${slug}-${Date.now()}`
    }

    const now = new Date()
    const [article] = await db.insert(articles).values({
      title: title.trim(),
      slug,
      content,
      excerpt: excerpt?.trim() || null,
      coverImage: coverImage || null,
      coverImageAlt: coverImageAlt?.trim() || null,
      coverImagePublicId: coverImagePublicId || null,
      categoryId: categoryId ? Number(categoryId) : null,
      authorId: session.user.id,
      status: status || 'draft',
      isFeatured: Boolean(isFeatured),
      isBreaking: Boolean(isBreaking),
      tags: tags?.length ? tags : null,
      faqs: sanitizeFaqs(faqs),
      seoTitle: seoTitle?.trim() || null,
      seoDescription: seoDescription?.trim() || null,
      publishedAt: status === 'published' ? (publishedAt ? new Date(publishedAt) : now) : null,
      createdAt: now,
      updatedAt: now,
    }).returning()

    if (article.status === 'published') {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'
      notifyIndexing(`${siteUrl}/article/${article.slug}`, 'URL_UPDATED')
      revalidatePath(`/article/${article.slug}`)
    }

    return NextResponse.json({ id: article.id, slug: article.slug })
  } catch (error) {
    console.error('Create article error:', error)
    return NextResponse.json({ error: 'Failed to create article' }, { status: 500 })
  }
}
