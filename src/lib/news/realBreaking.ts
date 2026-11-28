/**
 * "Real" breaking news for X (owner decision 28 Nov 2026, after the Diljit Dosanjh concert "bomb threats" story went out as
 * BREAKING: "jo breaking news ho usi ko breaking post krna hai"; answer to "kar du?": "Haan krdo").
 *
 * The site's own rule (`isUrgentHeadline` in placement.ts) is wide on purpose: it feeds the breaking ticker and the fast lane,
 * and it also matches routine court and crime words ("arrested", "verdict", "sentenced") and a bare "bomb". For X that is too
 * loose. This module is the stricter test used for the X alert, for an official account's post and for the article tweet:
 *   - the headline has an urgent word from a SMALLER list (no "arrested", "verdict", "sentenced", no bare "bomb");
 *   - a bomb threat, scare or hoax is not breaking news unless somebody was hurt or killed;
 *   - an entertainment or sports story is not breaking news unless something grave happened (a stampede, a blast, a death toll,
 *     a shooting, a star's death).
 * `isUrgentHeadline` and the site's ticker are NOT changed. Pure and unit-tested.
 */
import type { Story } from './cluster'
import { classifyStory, categoryScores } from './desks'

/** Desks whose stories are not breaking news for X unless something grave happened. */
export const QUIET_DESKS = new Set(['entertainment', 'sports'])

// Everything in the site's URGENT_RE except routine court/crime words ("arrested", "verdict", "sentenced") and a bare "bomb(s)".
const STRICT_URGENT_RE =
  /\b(killed|dead|dies|died|passes away|passed away|demise|death toll|deaths?|attack(?:s|ed)?|blasts?|explosions?|bombings?|missiles?|drone strikes?|air ?strikes?|gunmen|gunman|shooting|earthquake|quakes?|tsunami|cyclone|floods?|landslides?|stampede|wildfires?|derail\w*|hijack\w*|crash(?:es|ed)?|collapse[sd]?|capsiz\w+|resigns?|resignation|ceasefire|invasion|invade[sd]?|coup|martial law|state of emergency|dissolved|curfew|evacuat\w+|hostages?|assassinat\w+|terror\w*|massacre|shot dead|lockdown)\b/i

/** A threat, scare or hoax: not news of an event, unless people were hurt (see GRAVE_RE). */
const ROUTINE_RE = /\b(bomb|hoax|fake)\s+(threats?|scares?|calls?|alerts?|mails?|emails?)\b|\bthreats?\s+(call|mail|email)s?\b|\b(received|gets|got|get)\s+(bomb\s+)?threats?\b/i

/**
 * What still makes an entertainment or sports story breaking: a mass-casualty event or a death. Words that mean something else
 * in sport ("crash out", "dead rubber", "collapsed to 80 all out", "killed the game") are left out on purpose.
 */
const GRAVE_RE =
  /\b(death toll|stampede|blasts?|explosions?|shooting|shot dead|earthquake|terror\w*|massacre|(?:plane|air|helicopter|bus|train|car) crash(?:es|ed)?|building collapse[sd]?|dies|died|passes away|passed away|demise)\b/i

/** The headline carries a word from the strict list (and is not a threat/scare/hoax without any harm). */
export function hasRealUrgentWords(title: string): boolean {
  if (!STRICT_URGENT_RE.test(title)) return false
  if (ROUTINE_RE.test(title) && !GRAVE_RE.test(title)) return false
  return true
}

export function isGraveHeadline(title: string): boolean {
  return GRAVE_RE.test(title)
}

export interface BreakingText {
  /** The headlines (or the post text) of the story. */
  titles: string[]
  summary?: string
  /** The category slug when it is known (an article); otherwise it is worked out from the words. */
  categorySlug?: string | null
  publisherKeys?: string[]
}

/** The desk of a story, or null when no desk keyword matches at all (then nothing is guessed). */
export function deskOf(t: Pick<BreakingText, 'titles' | 'summary' | 'categorySlug' | 'publisherKeys'>): string | null {
  if (t.categorySlug) return t.categorySlug
  const title = t.titles[0] ?? ''
  const story = { title, summary: t.summary, publisherKeys: t.publisherKeys }
  return categoryScores(story).length ? classifyStory(story) : null
}

/** An entertainment or sports story with nothing grave in it: not breaking news for X, whatever words it uses. */
export function isQuietStory(t: BreakingText): boolean {
  const desk = deskOf(t)
  return !!desk && QUIET_DESKS.has(desk) && !t.titles.some(isGraveHeadline)
}

/** Breaking news for X: a strict urgent word in a headline, and not a quiet-desk story without anything grave. */
export function isRealBreaking(t: BreakingText): boolean {
  if (!t.titles.some(hasRealUrgentWords)) return false
  return !isQuietStory(t)
}

/** The same for a clustered story (the headlines of every publisher that carries it). */
export function isRealBreakingStory(story: Story): boolean {
  return isRealBreaking({
    titles: [story.lead.title, ...story.items.map((i) => i.title).filter((t) => t !== story.lead.title)],
    summary: story.lead.summary,
    publisherKeys: story.items.map((i) => i.publisherKey),
  })
}
