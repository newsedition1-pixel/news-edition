import 'server-only'
import { PUBLISHERS, TRENDS_FEED, isTrustedUrl, publisherForUrl, type Publisher } from './publishers'
import { parseFeed, parseTrendTerms } from './feedParse'
import { buildStories, filterByHint, type Story, type StoryItem } from './cluster'
import { extractArticle, type ExtractedArticle } from './articleText'

const UA = 'Mozilla/5.0 (compatible; NewsEditionBot/1.0; +https://newsedition.in/editorial-policy)'
const MAX_BYTES = 1_500_000

/** `why` (optional) is filled with a short reason when the fetch fails, for the runtime log. */
export async function fetchText(url: string, timeoutMs: number, why?: { reason?: string }): Promise<{ text: string; finalUrl: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'en-IN,en;q=0.9' },
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
    })
    if (!res.ok) {
      if (why) why.reason = `HTTP ${res.status}`
      return null
    }
    const text = (await res.text()).slice(0, MAX_BYTES)
    return { text, finalUrl: res.url || url }
  } catch (e) {
    if (why) why.reason = e instanceof Error && e.name === 'AbortError' ? `no answer within ${timeoutMs} ms` : e instanceof Error ? e.message.slice(0, 80) : 'network error'
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** One feed, with a single longer retry after a timeout or a server error. Returns why it failed, if it did. */
async function loadFeed(url: string): Promise<{ page: { text: string; finalUrl: string } | null; reason?: string }> {
  const why: { reason?: string } = {}
  let page = await fetchText(url, 8000, why)
  if (!page && (why.reason?.startsWith('no answer') || /^HTTP 5/.test(why.reason ?? ''))) {
    page = await fetchText(url, 15000, why)
  }
  return { page, reason: page ? undefined : why.reason }
}

async function loadPublisherFeeds(p: Publisher): Promise<StoryItem[]> {
  const loaded = await Promise.all(p.feeds.map((f) => loadFeed(f)))
  const results = loaded.map((l) => l.page)
  const unloaded = p.feeds.map((f, i) => ({ f, reason: loaded[i].reason })).filter((_, i) => !results[i])
  // The reason (HTTP 403, timeout ...) tells a blocked feed from a slow or moved one.
  if (unloaded.length > 0) console.warn(`Feed not loaded (${p.name}): ${unloaded.map((u) => `${u.f} [${u.reason ?? 'unknown'}]`).join(' ')}`)
  const items: StoryItem[] = []
  const seen = new Set<string>()
  for (const r of results) {
    if (!r) continue
    for (const raw of parseFeed(r.text)) {
      // Only keep links that really belong to the publisher whose feed this is.
      if (publisherForUrl(raw.link)?.key !== p.key || seen.has(raw.link)) continue
      seen.add(raw.link)
      items.push({ title: raw.title, link: raw.link, summary: raw.summary, publishedAt: raw.publishedAt, publisherKey: p.key, publisherName: p.name })
    }
  }
  return items
}

export interface DiscoverResult {
  stories: Story[]
  /** Publishers whose feeds returned nothing (blocked, down or changed). */
  failedPublishers: string[]
  trendTerms: number
}

/** Latest stories from the trusted publishers, clustered by story and ranked. */
export async function discoverStories(hint = ''): Promise<DiscoverResult> {
  const [perPublisher, trends] = await Promise.all([
    Promise.all(PUBLISHERS.map((p) => loadPublisherFeeds(p).then((items) => ({ p, items })))),
    fetchText(TRENDS_FEED, 6000),
  ])
  const items = perPublisher.flatMap((x) => x.items)
  const failedPublishers = perPublisher.filter((x) => x.items.length === 0).map((x) => x.p.name)
  const trendTerms = trends ? parseTrendTerms(trends.text) : []
  let stories = buildStories(items, { trendTerms })
  if (hint.trim()) stories = filterByHint(stories, hint)
  return { stories, failedPublishers, trendTerms: trendTerms.length }
}

export interface TrustedArticle extends ExtractedArticle {
  finalUrl: string
  publisher: Publisher
}

/** Fetches one report. Refuses any URL (before or after redirects) that is not a trusted publisher's. */
export async function fetchTrustedArticle(url: string): Promise<TrustedArticle | null> {
  if (!isTrustedUrl(url)) return null
  const page = await fetchText(url, 12000)
  if (!page) return null
  const publisher = publisherForUrl(page.finalUrl)
  if (!publisher) return null
  return { ...extractArticle(page.text, page.finalUrl), finalUrl: page.finalUrl, publisher }
}
