/**
 * Hashtags for a news post. Few and specific on purpose: in 2026 tags only categorise a post (the
 * headline and summary carry the keywords), Instagram allows five at most, and X and Facebook do
 * best with one or two. Pure and unit-tested.
 */

export type FeedChannel = 'telegram' | 'x' | 'facebook' | 'instagram'

export const BRAND_TAG = '#NewsEdition'

/** Most tags per platform. */
export const MAX_TAGS: Record<FeedChannel, number> = { instagram: 5, telegram: 4, facebook: 2, x: 2 }

/** One-word mega tags say nothing about the story. */
const GENERIC = new Set([
  'news', 'latest', 'latestnews', 'breaking', 'breakingnews', 'viral', 'trending', 'fyp', 'foryou', 'explore',
  'today', 'update', 'updates', 'live', 'india', 'world', 'story', 'headlines', 'newsupdate',
])

/** A niche tag for each desk; unknown categories fall back to "<Name> News". */
const CATEGORY_TAGS: Record<string, string> = {
  india: '#IndiaNews',
  business: '#BusinessNews',
  world: '#WorldNews',
  politics: '#IndianPolitics',
  state: '#StateNews',
  governance: '#Governance',
  'haryana-news': '#HaryanaNews',
  entertainment: '#EntertainmentNews',
}

const MAX_WORDS = 4
const MAX_LENGTH = 30

/** "Cauvery water dispute" -> "#CauveryWaterDispute"; null when it would be empty, numeric, too long or generic. */
export function toHashtag(phrase: string): string | null {
  const words = phrase
    .normalize('NFKC')
    .replace(/['’`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  if (words.length === 0 || words.length > MAX_WORDS) return null
  // "NEW DELHI" is shouting, so it is lower-cased first; a lone acronym ("RBI") or one inside a mixed phrase ("GST council") stays as it is.
  const shouting = words.length > 1 && words.every((w) => w === w.toUpperCase())
  const body = words
    .map((w) => {
      const base = shouting || (w.length > 4 && w === w.toUpperCase()) ? w.toLowerCase() : w
      return base.charAt(0).toUpperCase() + base.slice(1)
    })
    .join('')
  if (body.length < 3 || body.length > MAX_LENGTH) return null
  if (/^\p{N}+$/u.test(body)) return null
  if (GENERIC.has(body.toLowerCase())) return null
  return `#${body}`
}

/** The topic tags of an article as hashtags, in the given order, without duplicates. */
export function topicHashtags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tags) {
    const h = toHashtag(t)
    if (!h) continue
    const key = h.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(h)
  }
  return out
}

/** The niche tag of a category, or null when there is no usable one. */
export function categoryHashtag(slug: string | null, name: string | null): string | null {
  if (slug && CATEGORY_TAGS[slug]) return CATEGORY_TAGS[slug]
  return name ? toHashtag(`${name} news`) : null
}

export interface TagSource {
  tags: string[]
  categorySlug: string | null
  categoryName: string | null
}

/** The hashtags for one platform: topic tags first, then the desk tag, then the brand tag. */
export function pickHashtags(channel: FeedChannel, src: TagSource): string[] {
  const max = MAX_TAGS[channel]
  const topics = topicHashtags(src.tags)
  const category = categoryHashtag(src.categorySlug, src.categoryName)
  const wanted: string[] = []
  if (channel === 'facebook' || channel === 'x') {
    // One or two tags: the most specific topic, then the brand (or the desk tag when there is no topic).
    wanted.push(topics[0] ?? category ?? BRAND_TAG, BRAND_TAG)
  } else {
    wanted.push(...topics.slice(0, Math.max(0, max - 2)))
    if (category) wanted.push(category)
    wanted.push(BRAND_TAG)
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const h of wanted) {
    const key = h.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(h)
    if (out.length >= max) break
  }
  return out
}
