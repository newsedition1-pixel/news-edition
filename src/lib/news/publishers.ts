/**
 * Trusted publishers the news automation may read from.
 *
 * Only pages on these hosts are ever fetched (this also stops the automation from being pointed
 * at arbitrary URLs). Feeds are the publishers' own public RSS feeds, so every item links to the
 * real article on the publisher's site. Wire agencies (PTI, ANI, Reuters, AP) have no public feed;
 * their copy reaches us through these publishers.
 *
 * Pure data + helpers: no server-only import, so it can be unit-tested.
 */

export interface Publisher {
  key: string
  /** Name as shown to readers and used in attribution. */
  name: string
  /** Hostnames (and their subdomains) that belong to this publisher. */
  hosts: string[]
  /** Public RSS feed URLs. A feed that fails to load is skipped, never fatal. */
  feeds: string[]
}

export const PUBLISHERS: Publisher[] = [
  {
    key: 'the-hindu',
    name: 'The Hindu',
    hosts: ['thehindu.com'],
    feeds: [
      'https://www.thehindu.com/news/national/feeder/default.rss',
      'https://www.thehindu.com/news/international/feeder/default.rss',
      'https://www.thehindu.com/business/feeder/default.rss',
    ],
  },
  {
    key: 'the-hindu-businessline',
    name: 'The Hindu BusinessLine',
    hosts: ['thehindubusinessline.com'],
    feeds: ['https://www.thehindubusinessline.com/?service=rss'],
  },
  {
    key: 'indian-express',
    name: 'The Indian Express',
    hosts: ['indianexpress.com'],
    feeds: ['https://indianexpress.com/feed/'],
  },
  {
    key: 'hindustan-times',
    name: 'Hindustan Times',
    hosts: ['hindustantimes.com'],
    feeds: ['https://www.hindustantimes.com/feeds/rss/latest/rssfeed.xml'],
  },
  {
    key: 'ndtv',
    name: 'NDTV',
    hosts: ['ndtv.com'],
    feeds: ['https://feeds.feedburner.com/NDTV-LatestNews'],
  },
  {
    key: 'times-of-india',
    name: 'The Times of India',
    hosts: ['timesofindia.indiatimes.com', 'indiatimes.com'],
    feeds: ['https://timesofindia.indiatimes.com/rssfeedstopstories.cms'],
  },
  {
    key: 'business-standard',
    name: 'Business Standard',
    hosts: ['business-standard.com'],
    feeds: ['https://www.business-standard.com/rss/latest.rss'],
  },
  {
    key: 'india-today',
    name: 'India Today',
    hosts: ['indiatoday.in'],
    feeds: ['https://www.indiatoday.in/rss/1206578'],
  },
  {
    key: 'news18',
    name: 'News18',
    hosts: ['news18.com'],
    feeds: ['https://www.news18.com/commonfeeds/v1/eng/rss/text.xml'],
  },
  {
    key: 'scroll',
    name: 'Scroll.in',
    hosts: ['scroll.in'],
    feeds: ['https://feeds.feedburner.com/ScrollinArticles.rss'],
  },
  {
    key: 'bbc',
    name: 'BBC News',
    hosts: ['bbc.com', 'bbc.co.uk'],
    feeds: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://feeds.bbci.co.uk/news/business/rss.xml',
      'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml',
    ],
  },
  {
    key: 'al-jazeera',
    name: 'Al Jazeera',
    hosts: ['aljazeera.com'],
    feeds: ['https://www.aljazeera.com/xml/rss/all.xml'],
  },
]

/** Google Trends "trending now" RSS for India. Optional signal; failures are ignored. */
export const TRENDS_FEED = 'https://trends.google.com/trending/rss?geo=IN'

function hostOf(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(String(raw).trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.hostname.toLowerCase()
  } catch {
    return null
  }
}

/** The trusted publisher a URL belongs to, or null. Matches the host and its subdomains only. */
export function publisherForUrl(raw: string | null | undefined): Publisher | null {
  const host = hostOf(raw)
  if (!host) return null
  for (const p of PUBLISHERS) {
    if (p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return p
  }
  return null
}

export function isTrustedUrl(raw: string | null | undefined): boolean {
  return publisherForUrl(raw) !== null
}

/** Hosts whose pages count as primary/official documents when a source article links to them. */
const PRIMARY_HOST_PATTERNS: RegExp[] = [
  /(^|\.)gov\.in$/i,
  /(^|\.)nic\.in$/i,
  /(^|\.)gov$/i,
  /(^|\.)gov\.uk$/i,
  /(^|\.)europa\.eu$/i,
  /(^|\.)un\.org$/i,
  /(^|\.)who\.int$/i,
  /(^|\.)imf\.org$/i,
  /(^|\.)worldbank\.org$/i,
  /(^|\.)rbi\.org\.in$/i,
  /(^|\.)sci\.gov\.in$/i,
  /(^|\.)pib\.gov\.in$/i,
]

export function isPrimarySourceUrl(raw: string | null | undefined): boolean {
  const host = hostOf(raw)
  if (!host) return false
  return PRIMARY_HOST_PATTERNS.some((re) => re.test(host))
}
