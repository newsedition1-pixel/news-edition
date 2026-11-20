import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/dal'
import { discoverStories } from '@/lib/news/feeds'
import { dropCoveredStories } from '@/lib/news/fresh'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_CANDIDATES = 40

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const { query } = (await request.json().catch(() => ({ query: '' }))) as { query?: unknown }
    const hint = typeof query === 'string' ? query.slice(0, 120) : ''

    const { stories, failedPublishers } = await discoverStories(hint)
    if (stories.length === 0) {
      return NextResponse.json({
        candidates: [],
        message: hint
          ? 'None of the latest stories from the trusted publishers match your hint. Try a broader word, or leave it empty for the top stories.'
          : 'No stories could be loaded from the trusted publishers right now. Try again in a few minutes.',
        failedPublishers,
      })
    }

    // Skip stories we already have: any of the story's report URLs already saved, or a near-identical headline.
    const fresh = await dropCoveredStories(stories)
    if (fresh.length === 0) {
      return NextResponse.json({ candidates: [], message: 'All matching stories have already been covered. Try a different hint.', failedPublishers })
    }

    const candidates = fresh.slice(0, MAX_CANDIDATES).map((s) => ({
      id: s.id,
      title: s.lead.title,
      snippet: s.lead.summary,
      score: s.score,
      publisherCount: s.publisherCount,
      publishers: s.publishers.map((p) => p.name),
      trendTerm: s.trendMatch,
      isExplainer: s.isExplainer,
      publishedAt: s.newestAt,
      sources: s.publishers.map((p) => ({ name: p.name, url: p.url, title: p.title })),
    }))

    return NextResponse.json({ candidates, failedPublishers })
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) throw error
    console.error('News candidates error:', error)
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 })
  }
}
