import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/dal'
import { db } from '@/lib/db'
import { articles, assets, categories } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { slugify, sanitizeFaqs } from '@/lib/utils'
import { notifyIndexing } from '@/lib/googleIndexing'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { fetchSourcePage } from '@/lib/news/sourcePage'
import { rewriteArticle, generateCoverImage } from '@/lib/ai/openai'
import { clampWordLength, getNewsWordLength, setSetting, NEWS_WORD_LENGTH_KEY } from '@/lib/settings'
import type { NewsCandidate } from '@/lib/news/googleNews'

export const runtime = 'nodejs'
export const maxDuration = 300 // seconds; Vercel caps this by plan — keep batches small.

const MAX_ITEMS = 10

const MAX_FAQS = 20
const DEFAULT_FAQS = 10

interface ItemResult {
  title: string
  sourceUrl: string
  status: 'published' | 'draft' | 'skipped' | 'failed'
  id?: number
  slug?: string
  imageSource?: 'source' | 'generated' | 'none'
  faqCount?: number
  reason?: string
}

async function storeImage(src: string, uploadedBy: string) {
  const result = await uploadToCloudinary(src, 'newsedition/articles')
  await db.insert(assets).values({
    name: `ai-news-${Date.now()}`,
    url: result.secure_url,
    publicId: result.public_id,
    type: 'image',
    format: result.format,
    size: result.bytes,
    width: result.width,
    height: result.height,
    uploadedBy,
  })
  return { url: result.secure_url, publicId: result.public_id, alt: '' }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin()
    const body = await request.json()
    const items: NewsCandidate[] = Array.isArray(body?.items) ? body.items : []

    if (items.length === 0) return NextResponse.json({ error: 'No items to process' }, { status: 400 })
    if (items.length > MAX_ITEMS) return NextResponse.json({ error: `Too many items (max ${MAX_ITEMS} per run)` }, { status: 400 })

    // Word length: use the admin's value if supplied and persist it as the new
    // default; otherwise fall back to the stored default.
    let wordLength: number
    if (body?.wordLength !== undefined && body?.wordLength !== null && body?.wordLength !== '') {
      wordLength = clampWordLength(body.wordLength)
      await setSetting(NEWS_WORD_LENGTH_KEY, String(wordLength))
    } else {
      wordLength = await getNewsWordLength()
    }

    // Per-run options (not persisted). Defaults chosen so a bare request is safe:
    // no paid AI image, draft (not live), 10 FAQs.
    const allowImageGen = body?.generateImage === true
    const publishNow = body?.publishNow === true
    const rawFaq = body?.faqCount
    const faqCount = rawFaq === undefined || rawFaq === null || rawFaq === ''
      ? DEFAULT_FAQS
      : Math.min(MAX_FAQS, Math.max(0, Math.round(Number(rawFaq)) || 0))
    const targetStatus: 'published' | 'draft' = publishNow ? 'published' : 'draft'

    const cats = await db.select({ id: categories.id, slug: categories.slug, name: categories.name }).from(categories).where(eq(categories.isActive, true))
    const catBySlug = new Map(cats.map((c) => [c.slug, c.id]))
    const categoryChoices = cats.map((c) => ({ slug: c.slug, name: c.name }))

    const results: ItemResult[] = []
    let created = 0

    for (const item of items) {
      if (!item?.sourceUrl || !item?.title) {
        results.push({ title: item?.title || '(unknown)', sourceUrl: item?.sourceUrl || '', status: 'failed', reason: 'Malformed item' })
        continue
      }

      try {
        // Re-check dedup at write time (guards against races between the
        // candidate fetch and now); the unique index is the final backstop.
        const dupe = await db.select({ id: articles.id }).from(articles).where(eq(articles.sourceUrl, item.sourceUrl)).limit(1)
        if (dupe.length > 0) {
          results.push({ title: item.title, sourceUrl: item.sourceUrl, status: 'skipped', reason: 'Already published' })
          continue
        }

        const page = await fetchSourcePage(item.sourceUrl)
        const rewritten = await rewriteArticle({
          title: item.title,
          snippet: item.snippet || '',
          sourceDescription: page.description,
          categories: categoryChoices,
          wordLength,
          faqCount,
        })

        // Image: always use a free source og:image when present. AI generation
        // is opt-in (costs money), so only fall back to it when enabled.
        let cover: { url: string; publicId: string } | null = null
        let imageSource: ItemResult['imageSource'] = 'none'
        if (page.imageUrl) {
          try {
            cover = await storeImage(page.imageUrl, session.user.id)
            imageSource = 'source'
          } catch {
            cover = null
          }
        }
        if (!cover && allowImageGen) {
          try {
            const dataUri = await generateCoverImage(rewritten.imagePrompt)
            cover = await storeImage(dataUri, session.user.id)
            imageSource = 'generated'
          } catch {
            cover = null
            imageSource = 'none'
          }
        }

        const faqs = sanitizeFaqs(rewritten.faqs)

        // Unique slug (same approach as the manual create route).
        let slug = slugify(rewritten.title)
        const slugTaken = await db.select({ slug: articles.slug }).from(articles).where(eq(articles.slug, slug)).limit(1)
        if (slugTaken.length > 0) slug = `${slug}-${Date.now()}`

        const now = new Date()
        const [article] = await db.insert(articles).values({
          title: rewritten.title,
          slug,
          content: rewritten.content,
          excerpt: rewritten.excerpt || null,
          coverImage: cover?.url || null,
          coverImageAlt: rewritten.imageAlt || null,
          coverImagePublicId: cover?.publicId || null,
          categoryId: rewritten.categorySlug ? catBySlug.get(rewritten.categorySlug) ?? null : null,
          authorId: session.user.id,
          status: targetStatus,
          tags: rewritten.tags.length ? rewritten.tags : null,
          faqs,
          seoTitle: rewritten.seoTitle || null,
          seoDescription: rewritten.seoDescription || null,
          sourceUrl: item.sourceUrl,
          isAiGenerated: true,
          publishedAt: targetStatus === 'published' ? now : null,
          createdAt: now,
          updatedAt: now,
        }).returning()

        if (targetStatus === 'published') {
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'
          notifyIndexing(`${siteUrl}/article/${article.slug}`, 'URL_UPDATED')
          revalidatePath(`/article/${article.slug}`)
        }
        created++
        results.push({
          title: article.title,
          sourceUrl: item.sourceUrl,
          status: targetStatus,
          id: article.id,
          slug: article.slug,
          imageSource,
          faqCount: faqs?.length ?? 0,
        })
      } catch (err) {
        console.error('Generate item error:', item.sourceUrl, err)
        results.push({
          title: item.title,
          sourceUrl: item.sourceUrl,
          status: 'failed',
          reason: err instanceof Error ? err.message : 'Processing failed',
        })
      }
    }

    if (created > 0) {
      if (publishNow) revalidatePath('/')
      revalidatePath('/admin/articles')
    }

    return NextResponse.json({ created, total: items.length, results })
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) throw error
    console.error('News generate error:', error)
    return NextResponse.json({ error: 'Failed to generate articles' }, { status: 500 })
  }
}
