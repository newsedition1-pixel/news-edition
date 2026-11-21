import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { articles, categories } from '@/lib/db/schema'
import { coverOf, isSlug, reelPhotoUrl } from '@/lib/reel/asset'
import { siteUrl } from '@/lib/seo'

/**
 * Read-only helper for the automatic Reel: the cover credit of a published article and a small copy of
 * its cover picture as base64 JSON. The Reel task can only read Vercel pages as text, not download
 * images from Cloudinary, so the picture travels through here. Only published articles, only their
 * own stored cover, nothing else.
 */
const MAX_BYTES = 1_500_000
const HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  'X-Robots-Tag': 'noindex',
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!isSlug(slug)) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })

  try {
    const [row] = await db
      .select({
        slug: articles.slug,
        title: articles.title,
        content: articles.content,
        coverImage: articles.coverImage,
        publishedAt: articles.publishedAt,
        categoryName: categories.name,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(and(eq(articles.slug, slug), eq(articles.status, 'published')))
      .limit(1)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const cover = coverOf(row.content)
    const base = {
      slug: row.slug,
      title: row.title,
      url: `${siteUrl}/article/${row.slug}`,
      category: row.categoryName,
      publishedAt: row.publishedAt,
      coverKind: cover.kind,
      coverCredit: cover.credit,
    }

    // Only a credited photo is sent; an AI illustration or a cover without a credit line is not.
    const photoUrl = cover.kind === 'photo' ? reelPhotoUrl(row.coverImage) : null
    if (!photoUrl) return NextResponse.json({ ...base, photo: null, photoNote: cover.kind === 'photo' ? 'cover is not a Cloudinary upload' : `cover kind: ${cover.kind}` }, { headers: HEADERS })

    try {
      const res = await fetch(photoUrl, { signal: AbortSignal.timeout(10_000) })
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || !type.startsWith('image/')) {
        return NextResponse.json({ ...base, photo: null, photoNote: `picture not available (HTTP ${res.status})` }, { headers: HEADERS })
      }
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length === 0 || bytes.length > MAX_BYTES) {
        return NextResponse.json({ ...base, photo: null, photoNote: `picture size ${bytes.length} bytes is not usable` }, { headers: HEADERS })
      }
      return NextResponse.json(
        { ...base, photo: { mime: type.split(';')[0], width: 1080, height: 640, bytes: bytes.length, base64: bytes.toString('base64') } },
        { headers: HEADERS },
      )
    } catch (e) {
      return NextResponse.json({ ...base, photo: null, photoNote: `picture fetch failed: ${e instanceof Error ? e.message : 'error'}` }, { headers: HEADERS })
    }
  } catch (error) {
    console.error('reel-asset error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
