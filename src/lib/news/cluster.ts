/**
 * Story clustering and ranking for the news automation.
 *
 * A story that several independent trusted publishers carry at the same time is confirmed news, so
 * the number of distinct publishers is the main ranking signal. The rest of the score rewards
 * freshness, a match with what India is searching for right now (Google Trends), and explainer or
 * analysis pieces ("deep information"). Pure functions: no network, no server-only, unit-tested.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'is', 'are',
  'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'after', 'over', 'amid', 'into', 'than',
  'says', 'said', 'say', 'news', 'live', 'updates', 'update', 'latest', 'today', 'how', 'what', 'why', 'will', 'has',
  'have', 'had', 'not', 'no', 'up', 'out', 'new', 'now', 'may', 'can', 'who', 'all', 'more', 'about', 'his', 'her',
])

export interface StoryItem {
  title: string
  link: string
  summary: string
  publishedAt: string | null
  publisherKey: string
  publisherName: string
}

export interface Story {
  /** Stable id: the normalized lead title. */
  id: string
  /** The item shown as the headline (longest summary, then most trusted order). */
  lead: StoryItem
  items: StoryItem[]
  publishers: { key: string; name: string; url: string; title: string }[]
  publisherCount: number
  score: number
  trendMatch: string | null
  isExplainer: boolean
  newestAt: string | null
}

export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/&amp;/g, ' ')
    .replace(/[^a-z0-9ऀ-ॿ\s]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

export function normalizeTitle(title: string): string {
  return titleTokens(title).join(' ')
}

/** Overlap of two token sets: shared / smaller set, so a short headline contained in a longer one matches. */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(titleTokens(a))
  const tb = new Set(titleTokens(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  const jaccard = shared / (ta.size + tb.size - shared)
  const containment = shared / Math.min(ta.size, tb.size)
  // Containment alone over-matches two-word headlines, so blend it with Jaccard.
  return Math.max(jaccard, containment * 0.85 - (Math.min(ta.size, tb.size) < 4 ? 0.2 : 0))
}

export const SAME_STORY_THRESHOLD = 0.55

const EXPLAINER_RE = /\b(explained|explainer|explains|what is|what are|what to know|why|how (does|do|did|will|the)|analysis|decoded|understanding|everything you need|key takeaways|all you need to know|behind the)\b/i

export function looksLikeExplainer(title: string): boolean {
  return EXPLAINER_RE.test(title)
}

/** Opinion, listicle and live-blog items are poor rewrite material: low facts, high opinion. */
const SKIP_RE = /\b(live updates?|live blog|live:|horoscope|rashifal|astrology|opinion|editorial|letters to the editor|photos?:|watch:|video:|podcast|quiz|crossword|sudoku|wordle|panchang|gold rate today|ipl auction live)\b/i

export function isRewriteWorthy(item: Pick<StoryItem, 'title'>): boolean {
  return !SKIP_RE.test(item.title) && item.title.trim().length >= 25
}

export function clusterItems(items: StoryItem[]): StoryItem[][] {
  const groups: StoryItem[][] = []
  for (const item of items) {
    let placed = false
    for (const g of groups) {
      if (g.some((m) => m.publisherKey !== item.publisherKey && titleSimilarity(m.title, item.title) >= SAME_STORY_THRESHOLD)
        || g.some((m) => m.publisherKey === item.publisherKey && m.link === item.link)) {
        // Same publisher repeating a story adds no confirmation; only add a different publisher.
        if (!g.some((m) => m.publisherKey === item.publisherKey)) g.push(item)
        placed = true
        break
      }
    }
    if (!placed) groups.push([item])
  }
  return groups
}

const GENERIC_TREND_WORDS = new Set(['weather', 'today', 'score', 'price', 'prices', 'match', 'results', 'result', 'offer', 'sale', 'movie', 'ticket', 'tickets', 'status', 'schedule', 'holiday', 'holidays', 'rates'])

/** Which Google Trends term (if any) the story is about: all of the term's words appear in the headline. */
export function matchTrend(titles: string[], trendTerms: string[]): string | null {
  const bag = new Set(titles.flatMap((t) => titleTokens(t)))
  let best: string | null = null
  let bestLen = 0
  for (const term of trendTerms) {
    const tokens = titleTokens(term)
    if (tokens.length === 0) continue
    // A single generic word ("weather") is too weak a match; need 2+ words, or one distinctive 5+ letter word.
    if (tokens.length === 1 && (tokens[0].length < 5 || GENERIC_TREND_WORDS.has(tokens[0]))) continue
    if (tokens.every((t) => bag.has(t)) && tokens.length >= bestLen) {
      best = term
      bestLen = tokens.length
    }
  }
  return best
}

export function scoreStory(
  parts: { publisherCount: number; newestAt: string | null; summaryLength: number; isExplainer: boolean; trendMatch: string | null },
  now: number
): number {
  const ageHours = parts.newestAt ? Math.max(0, (now - new Date(parts.newestAt).getTime()) / 3_600_000) : 24
  const freshness = Math.max(0, 1 - ageHours / 36) // 1 now → 0 at 36h
  let score = Math.min(parts.publisherCount, 5) * 3
  score += freshness * 4
  score += Math.min(parts.summaryLength, 400) / 400 * 1.5
  if (parts.isExplainer) score += 2
  if (parts.trendMatch) score += 5
  return Math.round(score * 100) / 100
}

export function buildStories(
  items: StoryItem[],
  opts: { trendTerms?: string[]; now?: number; maxAgeHours?: number } = {}
): Story[] {
  const now = opts.now ?? Date.now()
  const maxAge = (opts.maxAgeHours ?? 48) * 3_600_000
  const trendTerms = opts.trendTerms ?? []

  const fresh = items.filter((i) => {
    if (!isRewriteWorthy(i)) return false
    if (!i.publishedAt) return true
    return now - new Date(i.publishedAt).getTime() <= maxAge
  })

  // Newest first so the lead of a cluster is stable.
  fresh.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))

  return clusterItems(fresh)
    .map((group): Story => {
      const lead = [...group].sort((a, b) => b.summary.length - a.summary.length)[0]
      const newestAt = group.map((g) => g.publishedAt).filter((d): d is string => !!d).sort().pop() ?? null
      const isExplainer = group.some((g) => looksLikeExplainer(g.title))
      const trendMatch = matchTrend(group.map((g) => g.title), trendTerms)
      return {
        id: normalizeTitle(lead.title),
        lead,
        items: group,
        publishers: group.map((g) => ({ key: g.publisherKey, name: g.publisherName, url: g.link, title: g.title })),
        publisherCount: group.length,
        score: scoreStory({ publisherCount: group.length, newestAt, summaryLength: lead.summary.length, isExplainer, trendMatch }, now),
        trendMatch,
        isExplainer,
        newestAt,
      }
    })
    .sort((a, b) => b.score - a.score)
}

/** Narrow stories to an admin's search hint: every hint word must appear in some item's title or summary. */
export function filterByHint(stories: Story[], hint: string): Story[] {
  const tokens = titleTokens(hint)
  if (tokens.length === 0) return stories
  return stories.filter((s) => {
    const bag = new Set(s.items.flatMap((i) => titleTokens(`${i.title} ${i.summary}`)))
    return tokens.every((t) => bag.has(t))
  })
}
