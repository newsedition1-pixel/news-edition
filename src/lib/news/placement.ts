/**
 * Which published article is "featured" or "breaking" on the site, chosen by rules instead of by
 * hand (owner decision, 21 Nov 2026: "tum apne aap choose krna"). Pure and unit-tested; the counts it
 * needs come from the database (`placementDb.ts`).
 *
 *   breaking  rare: carried by 3+ trusted publishers AND the headline reports something urgent
 *             (a death, attack, disaster, arrest, resignation, ceasefire, verdict ...). At most two at a
 *             time, and the flag is removed again after `BREAKING_HOURS`.
 *   featured  the strongest stories: 2+ publishers, a real photograph (not an AI illustration), a full
 *             article, a good audit score. At most six a day, two per category.
 *   neither   everything else (single-publisher stories, illustrated covers, thin pieces).
 */

export type CoverKind = 'commons' | 'publisher' | 'generated' | 'none'

export interface PlacementInput {
  /** Trusted publishers that carried the story. */
  publishers: number
  title: string
  wordCount: number
  cover: CoverKind
  /** Pre-publication audit score (0 to 100), or null when there is none. */
  auditScore: number | null
}

export interface PlacementContext {
  /** Breaking articles published less than `BREAKING_HOURS` ago. */
  breakingNow: number
  /** Featured articles published in the last 24 hours, in all categories and in this one. */
  featuredToday: number
  featuredTodayInCategory: number
}

export interface Placement {
  featured: boolean
  breaking: boolean
  /** One line for the logs: why, or why not. */
  reason: string
}

export const BREAKING_HOURS = 6
export const BREAKING_MIN_PUBLISHERS = 3
export const BREAKING_MAX_AT_ONCE = 2
export const FEATURED_MIN_PUBLISHERS = 2
export const FEATURED_MIN_WORDS = 700
export const FEATURED_MIN_AUDIT = 80
export const FEATURED_MAX_PER_DAY = 6
export const FEATURED_MAX_PER_CATEGORY_PER_DAY = 2

// Widened on 28 Nov 2026 (owner: whatever breaks anywhere in the world should reach X): quakes, tsunamis, landslides,
// stampedes, wildfires, shootings, bombings, missiles, air strikes, invasions, coups, martial law, a notable person's death.
const URGENT_RE =
  /\b(killed|dead|dies|died|passes away|passed away|demise|death toll|deaths?|attack(?:s|ed)?|blasts?|explosions?|bombings?|bombs?|missiles?|drone strikes?|air ?strikes?|gunmen|gunman|shooting|earthquake|quakes?|tsunami|cyclone|floods?|landslides?|stampede|wildfires?|derail\w*|hijack\w*|crash(?:es|ed)?|collapse[sd]?|capsiz\w+|arrested|resigns?|resignation|ceasefire|invasion|invade[sd]?|coup|martial law|state of emergency|verdict|sentenced|dissolved|curfew|evacuat\w+|hostages?|assassinat\w+|terror\w*|massacre|shot dead|lockdown)\b/i

/** The headline reports something urgent (a death, attack, disaster, arrest, verdict ...). Also used by the X planner. */
export function isUrgentHeadline(title: string): boolean {
  return URGENT_RE.test(title)
}

export function decidePlacement(input: PlacementInput, ctx: PlacementContext): Placement {
  const notes: string[] = []

  const urgent = isUrgentHeadline(input.title)
  let breaking = false
  if (input.publishers < BREAKING_MIN_PUBLISHERS) notes.push(`not breaking: ${input.publishers} publisher(s), needs ${BREAKING_MIN_PUBLISHERS}`)
  else if (!urgent) notes.push('not breaking: headline is not urgent news')
  else if (ctx.breakingNow >= BREAKING_MAX_AT_ONCE) notes.push(`not breaking: ${ctx.breakingNow} already breaking`)
  else {
    breaking = true
    notes.push(`breaking: ${input.publishers} publishers, urgent headline`)
  }

  const realPhoto = input.cover === 'commons' || input.cover === 'publisher'
  let featured = false
  if (input.publishers < FEATURED_MIN_PUBLISHERS) notes.push(`not featured: ${input.publishers} publisher(s), needs ${FEATURED_MIN_PUBLISHERS}`)
  else if (!realPhoto) notes.push(`not featured: cover is ${input.cover === 'generated' ? 'an AI illustration' : 'missing'}`)
  else if (input.wordCount < FEATURED_MIN_WORDS) notes.push(`not featured: ${input.wordCount} words, needs ${FEATURED_MIN_WORDS}`)
  else if (input.auditScore !== null && input.auditScore < FEATURED_MIN_AUDIT) notes.push(`not featured: audit score ${input.auditScore}, needs ${FEATURED_MIN_AUDIT}`)
  else if (ctx.featuredToday >= FEATURED_MAX_PER_DAY) notes.push(`not featured: ${ctx.featuredToday} already featured today`)
  else if (ctx.featuredTodayInCategory >= FEATURED_MAX_PER_CATEGORY_PER_DAY) notes.push(`not featured: ${ctx.featuredTodayInCategory} already featured today in this category`)
  else {
    featured = true
    notes.push('featured: confirmed by several publishers, real photo, full article')
  }

  return { featured, breaking, reason: notes.join('; ') }
}
