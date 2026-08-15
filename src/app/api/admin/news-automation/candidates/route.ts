import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/dal'
import { db } from '@/lib/db'
import { articles } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import { fetchGoogleNews } from '@/lib/news/googleNews'

export const runtime = 'nodejs'

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const { query } = await request.json().catch(() => ({ query: '' }))

    const candidates = await fetchGoogleNews(typeof query === 'string' ? query : '')
    if (candidates.length === 0) {
      return NextResponse.json({ candidates: [], message: 'No news found for your preference. Try a different or broader hint.' })
    }

    // Dedup against already-imported articles by source URL, and against any
    // article by normalized title (catches re-runs where the URL differs).
    const urls = candidates.map((c) => c.sourceUrl)
    const existing = await db
      .select({ sourceUrl: articles.sourceUrl, title: articles.title })
      .from(articles)
      .where(inArray(articles.sourceUrl, urls))

    const seenUrls = new Set(existing.map((e) => e.sourceUrl))
    const recentTitles = await db.select({ title: articles.title }).from(articles).limit(1000)
    const seenTitles = new Set(recentTitles.map((r) => normalizeTitle(r.title)))

    const fresh = candidates.filter(
      (c) => !seenUrls.has(c.sourceUrl) && !seenTitles.has(normalizeTitle(c.title))
    )

    if (fresh.length === 0) {
      return NextResponse.json({ candidates: [], message: 'All matching news has already been published. Try a different hint.' })
    }

    return NextResponse.json({ candidates: fresh })
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) throw error
    console.error('News candidates error:', error)
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 })
  }
}
