/**
 * Metadata finishing for generated articles: tags, SEO fields, slug and internal-link candidates.
 * Pure and unit-tested.
 */
import type { InternalCandidate } from './links'
import { titleTokens } from './cluster'

/** Lowercase, de-duplicated tags with the focus keyword first; 3 to 8 entries. */
export function finalizeTags(tags: string[], focusKeyword: string | null | undefined, extra: string[] = []): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (raw: string | null | undefined) => {
    const t = String(raw ?? '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ\s&'-]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (t.length < 3 || t.length > 40 || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  push(focusKeyword)
  tags.forEach(push)
  extra.forEach(push)
  return out.slice(0, 8)
}

function trimAtWord(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max + 1)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : text.slice(0, max)).replace(/[\s,;:\-–—]+$/, '')
}

export function finalizeSeo(
  fields: { title: string; seoTitle?: string; seoDescription?: string; excerpt?: string }
): { seoTitle: string; seoDescription: string; excerpt: string } {
  const seoTitle = trimAtWord((fields.seoTitle || fields.title).trim(), 60)
  const descSource = (fields.seoDescription || fields.excerpt || fields.title).replace(/\s+/g, ' ').trim()
  let seoDescription = trimAtWord(descSource, 155)
  if (seoDescription.length < descSource.length && !/[.!?]$/.test(seoDescription)) seoDescription = `${seoDescription}…`
  const excerpt = trimAtWord((fields.excerpt || fields.seoDescription || fields.title).replace(/\s+/g, ' ').trim(), 200)
  return { seoTitle, seoDescription, excerpt }
}

/** A readable slug: the headline, capped near 80 characters at a word boundary. */
export function slugFromTitle(title: string, max = 80): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (base.length <= max) return base
  const cut = base.slice(0, max + 1)
  const dash = cut.lastIndexOf('-')
  return (dash > max * 0.6 ? cut.slice(0, dash) : base.slice(0, max)).replace(/-+$/, '')
}

const WEAK_WORDS = new Set(['india', 'indian', 'indians', 'government', 'minister', 'ministry', 'state', 'states', 'court', 'police', 'party', 'news', 'says', 'over', 'amid', 'after', 'with', 'from', 'that', 'this', 'will', 'have', 'been', 'their', 'more', 'than', 'govt', 'delhi', 'centre', 'union', 'crore', 'lakh', 'politics', 'political', 'governance', 'business', 'entertainment', 'world', 'latest', 'update', 'updates', 'report', 'reports', 'management', 'authority', 'board', 'commission', 'committee', 'scheme', 'policy'])

/** One shared word is usually a section label or a place name; two is a shared topic. */
const MIN_SHARED_WORDS = 2

export interface PublishedRow extends InternalCandidate {
  categoryId: number | null
}

/**
 * The published articles most related to a new one: shared distinctive words between the new
 * article's headline + tags and the candidate's headline + tags, with a bonus for the same category.
 */
export function rankInternalCandidates(
  subject: { title: string; tags: string[]; categoryId: number | null },
  rows: PublishedRow[],
  limit = 6
): InternalCandidate[] {
  const keep = (w: string) => w.length >= 4 && !WEAK_WORDS.has(w)
  const subjectWords = new Set([...titleTokens(subject.title), ...subject.tags.flatMap((t) => titleTokens(t))].filter(keep))
  const scored = rows
    .map((r) => {
      const words = new Set([...titleTokens(r.title), ...(r.tags ?? []).flatMap((t) => titleTokens(t))].filter(keep))
      let shared = 0
      for (const w of words) if (subjectWords.has(w)) shared++
      const score = shared * 2 + (subject.categoryId !== null && r.categoryId === subject.categoryId ? 1 : 0)
      return { r, shared, score }
    })
    .filter((x) => x.shared >= MIN_SHARED_WORDS)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  return scored.map((x) => ({ title: x.r.title, slug: x.r.slug, tags: x.r.tags }))
}
