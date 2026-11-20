// RSS 2.0 builder for /feed.xml. Pure function: pass rows in, get an XML string back.

import { siteUrl, SITE_NAME, FEED_PATH } from './seo'

export interface RssItem {
  slug: string
  title: string
  summary: string
  publishedAt: Date
  categoryName?: string | null
  authorName?: string | null
  imageUrl?: string | null
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// "]]>" cannot appear inside CDATA, so split it across two sections.
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`

function imageType(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

export function buildRss(items: RssItem[], now: Date = new Date()): string {
  const body = items
    .map((a) => {
      const link = `${siteUrl}/article/${a.slug}`
      return [
        '    <item>',
        `      <title>${cdata(a.title)}</title>`,
        `      <link>${esc(link)}</link>`,
        `      <guid isPermaLink="true">${esc(link)}</guid>`,
        `      <pubDate>${a.publishedAt.toUTCString()}</pubDate>`,
        a.authorName ? `      <dc:creator>${cdata(a.authorName)}</dc:creator>` : null,
        a.categoryName ? `      <category>${cdata(a.categoryName)}</category>` : null,
        `      <description>${cdata(a.summary)}</description>`,
        a.imageUrl ? `      <enclosure url="${esc(a.imageUrl)}" type="${imageType(a.imageUrl)}" length="0"/>` : null,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${esc(SITE_NAME)}</title>
    <link>${esc(siteUrl)}</link>
    <description>Latest India news today: politics, business, world, entertainment and Haryana headlines from NewsEdition.</description>
    <language>en-in</language>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
    <atom:link href="${esc(siteUrl + FEED_PATH)}" rel="self" type="application/rss+xml"/>
${body}
  </channel>
</rss>
`
}
