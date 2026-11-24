// Shared SEO helpers: one place for site identity, title/description rules and
// JSON-LD builders, so home / category / article / author pages stay consistent.
// Pure functions only (no DB, no Next imports) so they are easy to unit-test.

import { slugify } from './utils'

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'
export const SITE_NAME = 'NewsEdition'
export const SITE_LOCALE = 'en_IN'
export const SITE_LANGUAGE = 'en-IN'
// Must match the X handle the footer links to (https://x.com/NewsEdition_1).
export const TWITTER_HANDLE = '@NewsEdition_1'
export const FEED_PATH = '/feed.xml'

// Publisher logo (rendered by src/app/logo.png/route.tsx, 200x60 — within Google's 600x60 limit).
export const LOGO = { url: `${siteUrl}/logo.png`, width: 200, height: 60 }

// Only profiles that exist. The About page marks LinkedIn as "coming soon", so no LinkedIn URL is listed.
export const SAME_AS = [
  'https://newsedition.medium.com',
  'https://t.me/newsedition',
  'https://x.com/NewsEdition_1',
  'https://www.facebook.com/newsedition/',
  'https://www.instagram.com/news_edition1',
  'https://www.youtube.com/@newsedition1',
]

/** Whitespace-normalise and cut at a word boundary with an ellipsis. */
export function clip(text: string | null | undefined, max: number): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const at = cut.lastIndexOf(' ')
  return cut.slice(0, at > max - 20 ? at : max - 1).replace(/[,:;\- ]+$/, '') + '…'
}

/** Plain text from article HTML (for description fallbacks). */
export function htmlToText(html: string | null | undefined): string {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "amit gautam" -> "Amit Gautam". Names that already contain capitals are left alone. */
export function cleanName(name: string | null | undefined): string {
  const n = String(name ?? '').trim()
  if (!n || n !== n.toLowerCase()) return n
  return n.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
}

/** Same URL shape as before: /author/{id}/{name-slug}. The slug comes from the raw name, because the page canonical-redirects on it. */
export function authorPath(author: { id: string; name: string }): string {
  return `/author/${author.id}/${slugify(author.name)}`
}

/** Public job title for an author, from the account role. Used on the article author box and the author page. */
export function authorRoleLabel(role: string | null | undefined): string {
  return role === 'owner' ? 'Editor-in-Chief' : role === 'admin' ? 'Editor' : 'Contributor'
}

/** Category <title>: avoids "Haryana News News" when the category name already ends in "News". */
export function categoryTitle(name: string, page = 1): string {
  const base = /\bnews$/i.test(name.trim()) ? `${name.trim()} Today` : `${name.trim()} News Today`
  return page > 1 ? `${base} – Page ${page}` : base
}

export function categoryDescription(name: string, description?: string | null): string {
  const d = clip(description, 155)
  if (d) return d
  // "Haryana News" -> "Latest Haryana News today", not "Latest Haryana News news today".
  const label = /\bnews$/i.test(name.trim()) ? name.trim() : `${name.trim()} news`
  return `Latest ${label} today: top stories, updates and analysis from NewsEdition.`
}

// A headline cannot end on one of these: a title cut after them reads as broken ("... dozens injured in").
const DANGLING_END = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'as',
  'into', 'onto', 'over', 'after', 'before', 'amid', 'against', 'about', 'via', 'than', 'vs', 'during', 'between',
  'among', 'despite', 'while', 'its', 'their', 'his', 'her', 'our', 'your', 'is', 'are', 'was', 'were', 'be', 'has',
  'have', 'had', 'will', 'would', 'can', 'could', 'may', 'might',
])

function titleWords(s: string): string[] {
  return s.toLowerCase().split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}$₹]+|[^\p{L}\p{N}%]+$/gu, '')).filter(Boolean)
}

/**
 * True when a stored SEO title looks cut mid-phrase: it ends with "…", on a word like "in" / "and" / "after",
 * or (when it is near the 60-character cut) on a word the headline continues after ("... after historic" for
 * "... after historic debut"). The news pipeline trims SEO titles to 60 characters at a word, which can leave these.
 */
export function seoTitleLooksCut(seoTitle: string, headline: string): boolean {
  const s = seoTitle.replace(/\s+/g, ' ').trim()
  if (!s) return false
  if (/(…|\.\.\.)$/.test(s)) return true
  if (/[.!?"'”’)]$/.test(s)) return false
  const words = titleWords(s)
  const last = words[words.length - 1]
  if (!last) return false
  if (DANGLING_END.has(last)) return true
  if (s.length < 55) return false
  const h = titleWords(headline)
  if (h.length <= words.length) return false
  const at = h.lastIndexOf(last)
  return at >= 0 && at < h.length - 1
}

/** Drops trailing punctuation and dangling words ("... dozens injured in" -> "... dozens injured"). */
function dropDanglingEnd(text: string): string {
  let t = text.replace(/[\s,;:\-–—&|/]+$/, '')
  for (let i = 0; i < 4; i++) {
    const m = t.match(/^(.*\S)\s+(\S+)$/)
    if (!m || !DANGLING_END.has(titleWords(m[2])[0] ?? '')) break
    t = m[1].replace(/[\s,;:\-–—&|/]+$/, '')
  }
  return t
}

/**
 * Text for an article's <title>, og:title and twitter:title. The SEO title is used unless it looks cut
 * mid-phrase; then the full headline is used when it is at most `max` characters (Google shortens long titles
 * itself with an ellipsis, which reads better than a title that ends on "in"), else the headline is shortened
 * at a word with an ellipsis.
 */
export function articleTitleText(seoTitle: string | null | undefined, headline: string, max = 75): string {
  const h = String(headline ?? '').replace(/\s+/g, ' ').trim()
  const s = String(seoTitle ?? '').replace(/\s+/g, ' ').trim()
  if (s && !seoTitleLooksCut(s, h)) return s
  if (!h) return dropDanglingEnd(s.replace(/(…|\.\.\.)$/, ''))
  if (h.length <= max) return h
  const cut = h.slice(0, max - 1)
  const at = cut.lastIndexOf(' ')
  return `${dropDanglingEnd(at > max * 0.6 ? cut.slice(0, at) : cut)}…`
}

/** Article <title> field. Short titles take the " | NewsEdition" suffix from the layout template; longer ones opt out of it. */
export function articleTitleField(text: string): string | { absolute: string } {
  const t = clip(text, 75)
  return t.length <= 45 ? t : { absolute: t }
}

export function articleDescription(opts: { seoDescription?: string | null; excerpt?: string | null; content?: string | null }): string {
  return clip(opts.seoDescription || opts.excerpt || htmlToText(opts.content), 155)
}

/** True when an article was edited meaningfully after publication (ignores the few seconds between publish and first save). */
export function wasUpdated(publishedAt?: Date | null, updatedAt?: Date | null, minGapMinutes = 10): boolean {
  if (!publishedAt || !updatedAt) return false
  return updatedAt.getTime() - publishedAt.getTime() > minGapMinutes * 60_000
}

/** Canonical + RSS discovery link. Pages that set `alternates` replace the layout's, so every page must include `types`. */
export function pageAlternates(canonical: string) {
  return { canonical, types: { 'application/rss+xml': `${siteUrl}${FEED_PATH}` } }
}

// ─── JSON-LD ────────────────────────────────────────────────────────────────

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsMediaOrganization',
    '@id': `${siteUrl}/#organization`,
    name: SITE_NAME,
    url: siteUrl,
    logo: { '@type': 'ImageObject', url: LOGO.url, width: LOGO.width, height: LOGO.height },
    foundingDate: '2024',
    founder: { '@type': 'Person', name: 'Amit Gautam' },
    sameAs: SAME_AS,
    publishingPrinciples: `${siteUrl}/editorial-policy`,
    ethicsPolicy: `${siteUrl}/editorial-policy`,
    correctionsPolicy: `${siteUrl}/corrections`,
    // Entity facts for AI answer engines and Google: who the publisher is, where it reports and how to reach it.
    areaServed: { '@type': 'Country', name: 'India' },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'editorial',
      url: `${siteUrl}/contact`,
      areaServed: 'IN',
      availableLanguage: 'English',
    },
  }
}

/** Full publisher object for article pages (Google reads each page on its own, so an @id reference alone is not enough). */
export function publisherJsonLd() {
  return {
    '@type': 'NewsMediaOrganization',
    '@id': `${siteUrl}/#organization`,
    name: SITE_NAME,
    url: siteUrl,
    logo: { '@type': 'ImageObject', url: LOGO.url, width: LOGO.width, height: LOGO.height },
  }
}

/** Number of words in article HTML (tags removed). Used for the NewsArticle `wordCount`. */
export function wordCountOf(html: string | null | undefined): number {
  const text = htmlToText(html)
  return text ? text.split(' ').length : 0
}

function codePoint(n: number): string {
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
}

/** Turns HTML entities (&#39; &quot; &amp; ...) back into characters, for text that goes into JSON-LD. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => codePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/**
 * The links an article cites: the "Further reading" list and the "Source:" line of its sources block
 * (the cover image credit is not a citation of a fact). Links to this site are left out. Used for the
 * NewsArticle `citation`, so a machine reader sees what the story is based on.
 */
export function sourceCitations(sourcesHtml: string | null | undefined, max = 8): { url: string; name: string }[] {
  const html = String(sourcesHtml ?? '')
  const parts: string[] = []
  const further = html.match(/<h2>\s*Further reading\s*<\/h2>\s*<ul>((?:(?!<\/ul>)[\s\S])*)<\/ul>/i)
  if (further) parts.push(further[1])
  const source = html.match(/<p>\s*<strong>\s*Source:\s*<\/strong>((?:(?!<\/p>)[\s\S])*)<\/p>/i)
  if (source) parts.push(source[1])

  const host = new URL(siteUrl).hostname
  const seen = new Set<string>()
  const out: { url: string; name: string }[] = []
  for (const part of parts) {
    for (const m of part.matchAll(/<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      let u: URL
      try {
        u = new URL(m[1].replace(/&amp;/g, '&'))
      } catch {
        continue
      }
      if (u.hostname === host || u.hostname.endsWith(`.${host}`)) continue
      if (seen.has(u.href)) continue
      seen.add(u.href)
      out.push({ url: u.href, name: clip(decodeEntities(htmlToText(m[2])), 120) || u.hostname })
      if (out.length >= max) return out
    }
  }
  return out
}

export interface ArticleLdInput {
  slug: string
  title: string
  excerpt?: string | null
  coverImage?: string | null
  coverImageAlt?: string | null
  publishedAt?: Date | null
  updatedAt?: Date | null
  tags?: string[] | null
  category?: { name: string } | null
  author?: { id: string; name: string } | null
  wordCount?: number
  citations?: { url: string; name: string }[]
}

export function newsArticleJsonLd(a: ArticleLdInput) {
  const url = `${siteUrl}/article/${a.slug}`
  const published = a.publishedAt?.toISOString()
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': `${url}#article`,
    headline: clip(a.title, 110),
    description: clip(a.excerpt, 200),
    image: a.coverImage
      ? [{ '@type': 'ImageObject', url: a.coverImage, caption: a.coverImageAlt || a.title }]
      : [],
    datePublished: published,
    // updatedAt only moves when the article is edited through the admin API.
    dateModified: (a.updatedAt ?? a.publishedAt)?.toISOString() ?? published,
    inLanguage: SITE_LANGUAGE,
    isAccessibleForFree: true,
    author: a.author
      ? [{
          '@type': 'Person',
          // Same @id as the Person on the author page, so the article and the author are one entity.
          '@id': `${siteUrl}${authorPath(a.author)}#person`,
          name: cleanName(a.author.name),
          url: `${siteUrl}${authorPath(a.author)}`,
        }]
      : [{ '@type': 'Organization', name: SITE_NAME, url: siteUrl }],
    publisher: publisherJsonLd(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    keywords: a.tags?.join(', '),
    articleSection: a.category?.name,
    ...(a.wordCount ? { wordCount: a.wordCount } : {}),
    ...(a.citations?.length
      ? { citation: a.citations.map((c) => ({ '@type': 'CreativeWork', name: c.name, url: c.url })) }
      : {}),
  }
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  }
}
