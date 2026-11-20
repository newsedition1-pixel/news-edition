/**
 * Deterministic link building for generated articles. Pure and unit-tested.
 *
 * The model never writes links (the sanitiser strips them). Links are added here from data we
 * trust: published NewsEdition articles for internal links, and the publishers (and official
 * documents) the story actually came from for external links. Nothing is invented.
 */
import { buildSourceNote, cleanSourceName, safeHttpUrl } from '../sources'
import { isPrimarySourceUrl } from './publishers'
import { wrapSources } from './sourcesBlock'

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface InternalCandidate {
  title: string
  slug: string
  tags: string[] | null
}

export interface ExternalSource {
  name: string
  url: string
  title?: string
}

/** Replaces the first whole-word, case-insensitive occurrence of `phrase` in text that is not already inside a tag. */
function linkFirstOccurrence(paragraphInner: string, phrase: string, anchor: (matched: string) => string): string | null {
  const re = new RegExp(`(^|[^\\w>])(${escapeRegExp(phrase)})(?=$|[^\\w<])`, 'i')
  // Work only on text outside existing tags/anchors.
  const parts = paragraphInner.split(/(<a\b[\s\S]*?<\/a>|<[^>]+>)/i)
  for (let i = 0; i < parts.length; i += 2) {
    const m = parts[i].match(re)
    if (!m || m.index === undefined) continue
    const start = m.index + m[1].length
    const matched = m[2]
    parts[i] = parts[i].slice(0, start) + anchor(matched) + parts[i].slice(start + matched.length)
    return parts.join('')
  }
  return null
}

function phrasesFor(c: InternalCandidate): string[] {
  const tags = (c.tags ?? []).map((t) => t.trim()).filter(Boolean)
  const good = tags.filter((t) => t.includes(' ') ? t.length >= 6 : t.length >= 6)
  return good.sort((a, b) => b.length - a.length).slice(0, 4)
}

/**
 * Links the first natural mention of a related published article's topic. At most one link per
 * paragraph, one per candidate, never in the opening paragraph or inside a heading/anchor.
 */
export function insertInternalLinks(html: string, candidates: InternalCandidate[], max = 3): { html: string; linked: InternalCandidate[] } {
  const linked: InternalCandidate[] = []
  let first = true
  const out = html.replace(/<p>([\s\S]*?)<\/p>/g, (full, inner: string) => {
    if (first) { first = false; return full }
    if (linked.length >= max || /<a\b/i.test(inner) || /<strong>\s*Source:/i.test(inner)) return full
    for (const c of candidates) {
      if (linked.includes(c)) continue
      for (const phrase of phrasesFor(c)) {
        const replaced = linkFirstOccurrence(inner, phrase, (m) => `<a href="/article/${escapeHtml(c.slug)}">${m}</a>`)
        if (replaced) {
          linked.push(c)
          return `<p>${replaced}</p>`
        }
      }
    }
    return full
  })
  return { html: out, linked }
}

/** Links the first mention of each named publisher to that publisher's report. */
export function linkSourceMentions(html: string, sources: ExternalSource[]): string {
  let out = html
  const done = new Set<string>()
  for (const s of sources) {
    const name = cleanSourceName(s.name)
    const url = safeHttpUrl(s.url)
    if (!name || !url || done.has(name.toLowerCase())) continue
    let replacedAny = false
    out = out.replace(/<p>([\s\S]*?)<\/p>/g, (full, inner: string) => {
      if (replacedAny) return full
      const replaced = linkFirstOccurrence(inner, name, (m) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${m}</a>`)
      if (!replaced) return full
      replacedAny = true
      return `<p>${replaced}</p>`
    })
    if (replacedAny) done.add(name.toLowerCase())
  }
  return out
}

export function relatedArticlesBlock(candidates: InternalCandidate[], exclude: InternalCandidate[] = [], max = 3): string {
  const picks = candidates.filter((c) => !exclude.includes(c)).slice(0, max)
  if (picks.length === 0) return ''
  const items = picks.map((c) => `<li><a href="/article/${escapeHtml(c.slug)}">${escapeHtml(c.title)}</a></li>`).join('')
  return `<h2>Related reading on NewsEdition</h2><ul>${items}</ul>`
}

export interface FurtherReadingItem {
  label: string
  url: string
}

/** Official documents the source reports link to (government, regulators, courts, UN/WHO). Max three. */
export function primaryDocumentLinks(links: { url: string; text: string }[], max = 3): FurtherReadingItem[] {
  const out: FurtherReadingItem[] = []
  const seen = new Set<string>()
  for (const l of links) {
    const url = safeHttpUrl(l.url)
    if (!url || seen.has(url) || !isPrimarySourceUrl(url)) continue
    seen.add(url)
    let host = ''
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch { continue }
    out.push({ label: l.text && l.text.length > 3 ? `${l.text} (${host})` : `Official document (${host})`, url })
    if (out.length >= max) break
  }
  return out
}

/** "Further reading": the other publishers that carried the story, plus official documents. */
export function furtherReadingBlock(otherSources: ExternalSource[], documents: FurtherReadingItem[]): string {
  const items: string[] = []
  for (const s of otherSources) {
    const url = safeHttpUrl(s.url)
    const name = cleanSourceName(s.name)
    if (!url || !name) continue
    const label = s.title ? `${name}: ${s.title}` : name
    items.push(`<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label.slice(0, 160))}</a></li>`)
  }
  for (const d of documents) {
    const url = safeHttpUrl(d.url)
    if (!url) continue
    items.push(`<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.label.slice(0, 160))}</a></li>`)
  }
  if (items.length === 0) return ''
  return `<h2>Further reading</h2><ul>${items.join('')}</ul>`
}

export interface AssembleInput {
  bodyHtml: string
  internal: InternalCandidate[]
  primary: ExternalSource
  others: ExternalSource[]
  documents: FurtherReadingItem[]
  /** Credit paragraph for the cover image, already HTML. */
  imageCreditHtml?: string
}

export interface Assembled {
  html: string
  internalLinks: number
  externalLinks: number
}

/**
 * Final article HTML: body with inline internal links and publisher links, then related reading,
 * then one sources block: further reading, the image credit and the standard "Source:" line
 * (the Reel automation reads that line).
 */
export function assembleArticleHtml(input: AssembleInput): Assembled {
  const withInternal = insertInternalLinks(input.bodyHtml, input.internal, 3)
  const withPublishers = linkSourceMentions(withInternal.html, [input.primary, ...input.others])
  const related = relatedArticlesBlock(input.internal, withInternal.linked, 3)
  const further = furtherReadingBlock(input.others, input.documents)
  const credit = input.imageCreditHtml ?? ''
  const sourceNote = buildSourceNote({ name: input.primary.name, url: input.primary.url })
  // Further reading, the image credit and the Source line go into one marked block at the very end;
  // the article page shows that block small, at the bottom of the page (see sourcesBlock.ts).
  const html = [withPublishers.trimEnd(), related, wrapSources([further, credit, sourceNote])].filter(Boolean).join('\n')

  const count = (re: RegExp) => (html.match(re) || []).length
  return {
    html,
    internalLinks: count(/<a href="\/article\//g),
    externalLinks: count(/<a href="https?:\/\//g),
  }
}
