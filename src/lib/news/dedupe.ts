/**
 * Same-story guard for the news schedule (owner decision 25 Nov 2026).
 *
 * The weekly SEO audit of 24 Nov found the same story published 2-4 times (Nvidia/Jensen Huang x4,
 * Delhi constable dowry x3, COP31 x3): each run sees a new publisher headline for it, and our own
 * rewritten headline is too different from that headline for `titleSimilarity` to catch. Here the
 * publisher headlines of a story are compared with our recent articles' headline AND excerpt, so the
 * key words of a story we already wrote are found. Pure functions: no network, unit-tested.
 */
import { titleSimilarity, titleTokens } from './cluster'

/** How far back our own articles count as "already written" for the same story. */
export const SAME_STORY_WINDOW_MS = 48 * 60 * 60 * 1000

/** A publisher headline whose words are this much inside one of our articles is the same story. */
export const CONTAINMENT_THRESHOLD = 0.6
/** ...and at least this many distinctive words must be shared (so a 2-word overlap never decides). */
export const MIN_SHARED = 3
/** Headline-to-headline similarity that is enough on its own (lower than clustering's 0.55). */
export const HEADLINE_THRESHOLD = 0.45

/**
 * Words that appear in many different stories, so sharing them says nothing about being the same story.
 * Kept short on purpose: names, places and numbers are what identify a story.
 */
const GENERIC = new Set([
  'india', 'indian', 'indians', 'delhi', 'government', 'govt', 'centre', 'state', 'states', 'minister', 'chief', 'pm',
  'cm', 'police', 'court', 'people', 'year', 'years', 'day', 'days', 'week', 'month', 'first', 'two', 'three', 'one',
  'crore', 'lakh', 'rs', 'per', 'cent', 'percent', 'report', 'reports', 'amid', 'set', 'get', 'gets', 'big', 'back',
  'top', 'major', 'key', 'country', 'world', 'global', 'national', 'official', 'officials', 'case', 'issue', 'plan',
  'make', 'makes', 'made', 'take', 'takes', 'like', 'also', 'still', 'just', 'know', 'here', 'there', 'their', 'them',
])

export function distinctiveTokens(text: string): string[] {
  return [...new Set(titleTokens(text).filter((t) => !GENERIC.has(t)))]
}

export interface OwnArticle {
  title: string
  excerpt?: string | null
  tags?: string[] | null
}

export interface StoryHeadlines {
  /** Headlines of every publisher report in the story cluster. */
  titles: string[]
}

/**
 * Our article that already covers this story, or null. A story matches when one of its publisher headlines
 * is close to our headline, or when most of the distinctive words of one of its headlines (at least
 * `MIN_SHARED`) are in our headline + excerpt + tags.
 */
export function findSameStory(story: StoryHeadlines, recent: OwnArticle[]): OwnArticle | null {
  for (const own of recent) {
    const ownWords = new Set(distinctiveTokens([own.title, own.excerpt ?? '', ...(own.tags ?? [])].join(' ')))
    for (const headline of story.titles) {
      if (titleSimilarity(headline, own.title) >= HEADLINE_THRESHOLD) return own
      const words = distinctiveTokens(headline)
      if (words.length === 0) continue
      const shared = words.filter((w) => ownWords.has(w)).length
      if (shared >= MIN_SHARED && shared / words.length >= CONTAINMENT_THRESHOLD) return own
    }
  }
  return null
}
