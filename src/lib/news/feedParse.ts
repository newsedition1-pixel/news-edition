/**
 * Minimal RSS 2.0 / Atom parser for the news automation. Pure (no network, no server-only) so it
 * can be unit-tested. Regex based on purpose: the feeds we read are simple and well formed, and a
 * malformed item is skipped rather than failing the whole feed.
 */

export interface RawFeedItem {
  title: string
  link: string
  summary: string
  /** ISO timestamp, or null when the feed gave none or an unreadable date. */
  publishedAt: string | null
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  ndash: '–', mdash: '—', hellip: '…',
}

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

function stripCdata(value: string): string {
  return value.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '')
}

/** Plain text from an HTML fragment: scripts/styles dropped, tags removed, entities decoded. */
export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function tagInner(block: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i')
  const m = block.match(re)
  return m ? stripCdata(m[1]) : null
}

function parseDate(raw: string | null): string | null {
  if (!raw) return null
  const d = new Date(decodeEntities(stripCdata(raw)).trim())
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function linkOf(block: string): string {
  const text = tagInner(block, 'link')
  if (text) {
    const t = decodeEntities(stripCdata(text)).trim()
    if (/^https?:\/\//i.test(t)) return t
  }
  // Atom: <link rel="alternate" href="..."/>
  const links = block.match(/<link\b[^>]*>/gi) || []
  let fallback = ''
  for (const l of links) {
    const href = l.match(/href=["']([^"']+)["']/i)?.[1]
    if (!href) continue
    const rel = l.match(/rel=["']([^"']+)["']/i)?.[1]?.toLowerCase()
    if (!rel || rel === 'alternate') return decodeEntities(href).trim()
    if (!fallback) fallback = decodeEntities(href).trim()
  }
  if (fallback) return fallback
  const guid = tagInner(block, 'guid')
  if (guid) {
    const g = decodeEntities(stripCdata(guid)).trim()
    if (/^https?:\/\//i.test(g)) return g
  }
  return ''
}

export function parseFeed(xml: string): RawFeedItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []
  const out: RawFeedItem[] = []
  for (const block of blocks) {
    const rawTitle = tagInner(block, 'title')
    const link = linkOf(block)
    if (!rawTitle || !link) continue
    const title = stripTags(rawTitle)
    if (!title) continue
    const rawSummary = tagInner(block, 'description') ?? tagInner(block, 'summary') ?? tagInner(block, 'content:encoded') ?? ''
    out.push({
      title,
      link,
      summary: stripTags(rawSummary).slice(0, 600),
      publishedAt: parseDate(tagInner(block, 'pubDate') ?? tagInner(block, 'dc:date') ?? tagInner(block, 'published') ?? tagInner(block, 'updated')),
    })
  }
  return out
}

/** Titles from the Google Trends RSS (`<ht:...>` extras are ignored). */
export function parseTrendTerms(xml: string): string[] {
  return parseFeed(xml).map((i) => i.title).filter(Boolean)
}
