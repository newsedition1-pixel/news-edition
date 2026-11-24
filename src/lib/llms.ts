// Builds /llms.txt: the plain-text guide for AI answer engines (ChatGPT, Claude, Perplexity, Gemini).
// It is generated from the database, so a new category or a new story shows up without a code change
// (the old static public/llms.txt had no Sports or Technology and was never updated). Pure function:
// pass rows in, get the text back.

import { siteUrl } from './seo'

export interface LlmsCategory {
  name: string
  slug: string
  description?: string | null
}

export interface LlmsArticle {
  slug: string
  title: string
  publishedAt: Date | null
  categoryName?: string | null
}

// Used when the database cannot be read. Same sections the site has.
export const FALLBACK_CATEGORIES: LlmsCategory[] = [
  { name: 'India', slug: 'india' },
  { name: 'World', slug: 'world' },
  { name: 'Politics', slug: 'politics' },
  { name: 'Business', slug: 'business' },
  { name: 'Entertainment', slug: 'entertainment' },
  { name: 'Sports', slug: 'sports' },
  { name: 'Technology', slug: 'technology' },
  { name: 'Governance', slug: 'governance' },
  { name: 'State', slug: 'state' },
  { name: 'Haryana News', slug: 'haryana-news' },
]

// One honest line per known section (what the section carries). Unknown sections use their own
// description from the admin panel, or a plain default.
const SECTION_LINES: Record<string, string> = {
  india: 'national news and updates',
  world: 'international news and its impact on India',
  politics: 'parties, Parliament, elections and policy',
  business: 'markets, economy, companies and startups',
  entertainment: 'film, television and culture',
  sports: 'cricket, football and other sport: results, tournaments and players',
  technology: 'AI, software, devices, cybersecurity and technology companies',
  governance: 'government decisions, schemes and administration',
  state: 'news from Indian states',
  'haryana-news': 'local news from Haryana',
}

/** Markdown link text cannot hold square brackets or line breaks. */
function linkText(s: string): string {
  return s.replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim()
}

function oneLine(s: string | null | undefined, max = 140): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : t.slice(0, max - 1).replace(/[,:;\- ]+$/, '') + '…'
}

function day(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : ''
}

export function buildLlmsTxt(categories: LlmsCategory[], recent: LlmsArticle[]): string {
  const cats = categories.length > 0 ? categories : FALLBACK_CATEGORIES
  const names = cats.map((c) => c.name).join(', ')

  const sections = cats.map((c) => {
    const line = SECTION_LINES[c.slug] || oneLine(c.description) || `latest ${c.name} news`
    return `- [${linkText(c.name)}](${siteUrl}/${c.slug}): ${line}`
  })

  const latest = recent
    .filter((a) => a.title && a.slug)
    .map((a) => {
      const meta = [a.categoryName, day(a.publishedAt)].filter(Boolean).join(', ')
      return `- [${linkText(a.title)}](${siteUrl}/article/${a.slug})${meta ? `: ${meta}` : ''}`
    })

  return [
    '# NewsEdition',
    '',
    `> NewsEdition is an independent Indian digital news platform founded in 2024 by Amit Gautam (Founder and Editor-in-Chief). It publishes news in English: ${names}.`,
    '',
    'NewsEdition articles carry a named author, a publication time and a last-updated time. Author pages list each author\'s published work. Every article ends with a sources block that links to the reports it is based on.',
    '',
    '## Sections',
    '',
    ...sections,
    '',
    ...(latest.length > 0 ? ['## Latest stories', '', ...latest, ''] : []),
    '## About the publisher',
    '',
    `- [About NewsEdition](${siteUrl}/about): who runs the site and why it exists`,
    `- [Editorial Policy](${siteUrl}/editorial-policy): who runs the site, how AI tools are used`,
    `- [Corrections Policy](${siteUrl}/corrections): how to report an error`,
    `- [Grievance Officer](${siteUrl}/grievance): who handles complaints about content, and how to reach them`,
    `- [Contact](${siteUrl}/contact): how to reach the newsroom`,
    `- [Privacy Policy](${siteUrl}/privacy)`,
    `- [Terms of Service](${siteUrl}/terms)`,
    '',
    '## For crawlers and feeds',
    '',
    `- [RSS feed](${siteUrl}/feed.xml): the 50 newest articles`,
    `- [XML sitemap](${siteUrl}/sitemap.xml): all published pages`,
    `- [Google News sitemap](${siteUrl}/news-sitemap.xml): stories from the last two days`,
    '',
    '## Optional',
    '',
    '- [Telegram channel](https://t.me/newsedition)',
    '- [YouTube](https://www.youtube.com/@newsedition1)',
    '- [Instagram](https://www.instagram.com/news_edition1)',
    '',
  ].join('\n')
}
