import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/dal'
import { db } from '@/lib/db'
import { articles, categories } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { clampWordLength, getNewsWordLength, setSetting, NEWS_WORD_LENGTH_KEY } from '@/lib/settings'
import { buildArticleFromStory, SkipStory, type ImageMode, type StoryRef } from '@/lib/news/pipeline'
import { isTrustedUrl } from '@/lib/news/publishers'
import { slugFromTitle } from '@/lib/news/meta'
import { safeHttpUrl } from '@/lib/sources'

export const runtime = 'nodejs'
export const maxDuration = 300 // seconds; Vercel caps this by plan — keep batches small.

const MAX_ITEMS = 6
const CONCURRENCY = 2
/** Stop starting new stories after this long so the response always returns before the platform timeout. */
const START_BUDGET_MS = 230_000

const MAX_FAQS = 20
const DEFAULT_FAQS = 6

interface ItemResult {
  title: string
  sourceUrl: string
  status: 'draft' | 'skipped' | 'failed'
  id?: number
  slug?: string
  imageSource?: 'commons' | 'publisher' | 'generated' | 'none'
  faqCount?: number
  wordCount?: number
  internalLinks?: number
  externalLinks?: number
  warnings?: string[]
  reason?: string
}

function parseStories(input: unknown): StoryRef[] {
  if (!Array.isArray(input)) return []
  const out: StoryRef[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, 300) : ''
    const sources = Array.isArray(r.sources)
      ? r.sources
          .map((s) => {
            const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>
            const url = safeHttpUrl(typeof o.url === 'string' ? o.url : null)
            return url && isTrustedUrl(url)
              ? { name: String(o.name ?? '').slice(0, 80), url, title: String(o.title ?? title).slice(0, 300) }
              : null
          })
          .filter((s): s is { name: string; url: string; title: string } => !!s)
          .slice(0, 6)
      : []
    if (!title || sources.length === 0) continue
    out.push({ title, sources, trendTerm: typeof r.trendTerm === 'string' ? r.trendTerm.slice(0, 80) : null })
  }
  return out
}

function parseImageMode(body: Record<string, unknown>): ImageMode {
  if (body.imageMode === 'licensed_or_ai' || body.imageMode === 'source' || body.imageMode === 'licensed') return body.imageMode
  // Older clients sent a boolean.
  return body.generateImage === true ? 'licensed_or_ai' : 'licensed'
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin()
    const body = (await request.json()) as Record<string, unknown>
    const stories = parseStories(body?.stories)

    if (stories.length === 0) return NextResponse.json({ error: 'No valid stories to process' }, { status: 400 })
    if (stories.length > MAX_ITEMS) return NextResponse.json({ error: `Too many stories (max ${MAX_ITEMS} per run)` }, { status: 400 })

    // Word length: use the admin's value if supplied and persist it as the new default.
    let wordLength: number
    if (body.wordLength !== undefined && body.wordLength !== null && body.wordLength !== '') {
      wordLength = clampWordLength(body.wordLength)
      await setSetting(NEWS_WORD_LENGTH_KEY, String(wordLength))
    } else {
      wordLength = await getNewsWordLength()
    }

    const imageMode = parseImageMode(body)
    const rawFaq = body.faqCount
    const faqCount = rawFaq === undefined || rawFaq === null || rawFaq === ''
      ? DEFAULT_FAQS
      : Math.min(MAX_FAQS, Math.max(0, Math.round(Number(rawFaq)) || 0))

    // Editorial review: AI-generated articles are ALWAYS saved as drafts. An editor reads and
    // publishes each one from Admin → Articles. A `publishNow` flag in the request is ignored.
    const cats = await db
      .select({ id: categories.id, slug: categories.slug, name: categories.name })
      .from(categories)
      .where(eq(categories.isActive, true))

    const startedAt = Date.now()
    let created = 0

    const results = await mapPool(stories, CONCURRENCY, async (story): Promise<ItemResult> => {
      const leadUrl = story.sources[0].url
      if (Date.now() - startedAt > START_BUDGET_MS) {
        return { title: story.title, sourceUrl: leadUrl, status: 'skipped', reason: 'Run time limit reached; run this story again.' }
      }
      try {
        // Re-check dedup at write time; the unique index on sourceUrl is the final backstop.
        const urls = story.sources.map((s) => s.url)
        const dupe = await db.select({ id: articles.id }).from(articles).where(inArray(articles.sourceUrl, urls)).limit(1)
        if (dupe.length > 0) return { title: story.title, sourceUrl: leadUrl, status: 'skipped', reason: 'Already covered' }

        const built = await buildArticleFromStory(story, { categories: cats, wordLength, faqCount, imageMode, uploadedBy: session.user.id })

        const baseSlug = slugFromTitle(built.title)
        const taken = await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, baseSlug)).limit(1)
        const slug = taken.length > 0 ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug

        const now = new Date()
        const [article] = await db.insert(articles).values({
          title: built.title,
          slug,
          content: built.content,
          excerpt: built.excerpt || null,
          coverImage: built.coverImage,
          coverImageAlt: built.coverImageAlt,
          coverImagePublicId: built.coverImagePublicId,
          categoryId: built.categoryId,
          authorId: session.user.id,
          status: 'draft',
          tags: built.tags.length ? built.tags : null,
          faqs: built.faqs,
          seoTitle: built.seoTitle || null,
          seoDescription: built.seoDescription || null,
          sourceUrl: built.sourceUrl,
          isAiGenerated: true,
          publishedAt: null,
          createdAt: now,
          updatedAt: now,
        }).returning()

        created++
        return {
          title: article.title,
          sourceUrl: built.sourceUrl,
          status: 'draft',
          id: article.id,
          slug: article.slug,
          imageSource: built.stats.imageSource,
          faqCount: built.faqs?.length ?? 0,
          wordCount: built.stats.wordCount,
          internalLinks: built.stats.internalLinks,
          externalLinks: built.stats.externalLinks,
          warnings: built.stats.warnings,
        }
      } catch (err) {
        if (err instanceof SkipStory) return { title: story.title, sourceUrl: leadUrl, status: 'skipped', reason: err.message }
        console.error('Generate story error:', leadUrl, err)
        return { title: story.title, sourceUrl: leadUrl, status: 'failed', reason: err instanceof Error ? err.message : 'Processing failed' }
      }
    })

    if (created > 0) revalidatePath('/admin/articles')

    return NextResponse.json({ created, total: stories.length, results })
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) throw error
    console.error('News generate error:', error)
    return NextResponse.json({ error: 'Failed to generate articles' }, { status: 500 })
  }
}
