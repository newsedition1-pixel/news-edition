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

/** Category <title>: avoids "Haryana News News" when the category name already ends in "News". */
export function categoryTitle(name: string, page = 1): string {
  const base = /\bnews$/i.test(name.trim()) ? `${name.trim()} Today` : `${name.trim()} News Today`
  return page > 1 ? `${base} – Page ${page}` : base
}

export function categoryDescription(name: string, description?: string | null): string {
  const d = clip(description, 155)
  if (d) return d
  return `Latest ${name} news today: top stories, updates and analysis from NewsEdition.`
}

/** Article <title>: ≤60 chars. Short titles take the " | NewsEdition" suffix from the layout template; long ones opt out of it so the total stays near 60. */
export function articleTitleField(rawTitle: string): string | { absolute: string } {
  const t = clip(rawTitle, 60)
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
    correctionsPolicy: `${siteUrl}/corrections`,
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
      ? [{ '@type': 'Person', name: cleanName(a.author.name), url: `${siteUrl}${authorPath(a.author)}` }]
      : [{ '@type': 'Organization', name: SITE_NAME, url: siteUrl }],
    publisher: publisherJsonLd(),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    keywords: a.tags?.join(', '),
    articleSection: a.category?.name,
  }
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  }
}
