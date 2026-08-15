import 'server-only'

export interface NewsCandidate {
  /** Stable Google News article URL — used as the dedup key (articles.sourceUrl). */
  sourceUrl: string
  title: string
  snippet: string
  source: string | null
  publishedAt: string | null
}

const LOCALE = 'hl=en-IN&gl=IN&ceid=IN:en'

function stripCdata(v: string): string {
  return v.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()
}

function decodeEntities(v: string): string {
  return v
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decodeEntities(stripCdata(m[1])) : null
}

/**
 * Fetch Google News RSS for a query (or top headlines when empty) and return
 * parsed candidates. Google News titles are "Headline - Publisher"; we split the
 * trailing publisher off into `source`.
 */
export async function fetchGoogleNews(query: string): Promise<NewsCandidate[]> {
  const q = query.trim()
  const url = q
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${LOCALE}`
    : `https://news.google.com/rss?${LOCALE}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  let xml: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsEditionBot/1.0)' },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Google News RSS returned ${res.status}`)
    xml = await res.text()
  } finally {
    clearTimeout(timer)
  }

  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || []
  const candidates: NewsCandidate[] = []

  for (const block of items) {
    const rawTitle = tag(block, 'title')
    const link = tag(block, 'link')
    if (!rawTitle || !link) continue

    // Title is "Headline - Publisher" — peel the publisher off the end.
    let title = rawTitle
    let source = tag(block, 'source')
    const dash = rawTitle.lastIndexOf(' - ')
    if (dash > 0) {
      title = rawTitle.slice(0, dash).trim()
      source = source || rawTitle.slice(dash + 3).trim()
    }

    candidates.push({
      sourceUrl: link.trim(),
      title,
      snippet: stripTags(tag(block, 'description') || '').slice(0, 500),
      source: source || null,
      publishedAt: tag(block, 'pubDate'),
    })
  }

  return candidates
}
