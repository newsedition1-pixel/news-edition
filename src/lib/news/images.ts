/**
 * Licensed news images from Wikimedia Commons. Pure parsing and credit-building here (unit tested);
 * the network call is `searchCommonsImage`.
 *
 * Why Commons: wire and publisher photos (PTI, ANI, Getty, Reuters, AP) are copyrighted, so copying
 * a publisher's og:image onto our site risks takedowns and copyright strikes. Commons files carry
 * an explicit licence. We accept only public-domain / CC0 / CC BY / CC BY-SA (attribution is
 * printed under the article) and reject NonCommercial, NoDerivatives and "fair use" files.
 */
import { escapeHtml } from './links'
import { decodeEntities, stripTags } from './feedParse'

export interface CommonsImage {
  /** Direct image URL (a 1600px rendition, or the original when smaller). */
  url: string
  width: number
  height: number
  title: string
  author: string
  license: string
  licenseUrl: string | null
  /** The file's Commons page, where the author and licence are stated. */
  pageUrl: string
  description: string
  /** Free to use with no attribution duty (public domain / CC0). */
  attributionRequired: boolean
}

interface CommonsPage {
  title?: string
  imageinfo?: {
    url?: string
    thumburl?: string
    thumbwidth?: number
    thumbheight?: number
    width?: number
    height?: number
    mime?: string
    descriptionurl?: string
    extmetadata?: Record<string, { value?: string } | undefined>
  }[]
}

const OK_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

function metaValue(meta: Record<string, { value?: string } | undefined> | undefined, key: string): string {
  return stripTags(String(meta?.[key]?.value ?? ''))
}

/** Licence short names we may use, and whether the licence demands attribution. */
export function classifyLicense(shortName: string, usageTerms = ''): { ok: boolean; attribution: boolean } {
  const s = `${shortName} ${usageTerms}`.toLowerCase()
  if (!s.trim()) return { ok: false, attribution: true }
  if (/\b(nc|non-?commercial|nd|no-?derivs?|noderivatives|fair use|non-free|copyrighted|all rights reserved|gfdl only)\b/.test(s) || /cc[- ]by[- ](nc|nd)/.test(s)) {
    return { ok: false, attribution: true }
  }
  if (/public domain|\bpd\b|cc0|cc[- ]zero|no known copyright|pd-|government of india|gov(ernment)? (work|of india)/.test(s)) {
    return { ok: true, attribution: false }
  }
  if (/cc[- ]by(-sa)?[ -]?\d/.test(s) || /cc[- ]by(-sa)?\b/.test(s)) return { ok: true, attribution: true }
  return { ok: false, attribution: true }
}

export function parseCommonsPages(pages: CommonsPage[], minWidth = 900): CommonsImage[] {
  const out: CommonsImage[] = []
  for (const p of pages) {
    const info = p.imageinfo?.[0]
    if (!info || !info.mime || !OK_MIME.has(info.mime)) continue
    const width = info.width ?? 0
    const height = info.height ?? 0
    if (width < minWidth || height < 500) continue
    // Landscape images crop well to the 16:9 cover.
    if (width / height < 1.15) continue
    const meta = info.extmetadata
    const lic = classifyLicense(metaValue(meta, 'LicenseShortName'), metaValue(meta, 'UsageTerms'))
    if (!lic.ok) continue
    const author = metaValue(meta, 'Artist') || metaValue(meta, 'Credit') || 'Unknown author'
    const url = info.thumburl || info.url
    if (!url || !info.descriptionurl) continue
    out.push({
      url,
      width: info.thumbwidth ?? width,
      height: info.thumbheight ?? height,
      title: (p.title || '').replace(/^File:/i, '').replace(/\.[a-z0-9]{3,4}$/i, '').replace(/_/g, ' '),
      author: author.slice(0, 120),
      license: metaValue(meta, 'LicenseShortName') || 'Wikimedia Commons',
      licenseUrl: metaValue(meta, 'LicenseUrl') || null,
      pageUrl: info.descriptionurl,
      description: metaValue(meta, 'ImageDescription').slice(0, 300),
      attributionRequired: lic.attribution,
    })
  }
  return out
}

const GENERIC = new Set(['india', 'indian', 'news', 'government', 'minister', 'party', 'state', 'city', 'people', 'police', 'court'])

/** Keep an image only if its title or description names a distinctive word of the story's subject. */
export function relevantImages(images: CommonsImage[], subjectTerms: string[]): CommonsImage[] {
  const terms = subjectTerms
    .flatMap((t) => t.toLowerCase().split(/[^a-z0-9]+/))
    .filter((t) => t.length >= 4 && !GENERIC.has(t))
  if (terms.length === 0) return []
  return images
    .map((img) => {
      const hay = `${img.title} ${img.description}`.toLowerCase()
      const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0)
      return { img, score }
    })
    .filter((x) => x.score >= Math.min(2, terms.length))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.img)
}

export function buildImageCredit(img: CommonsImage): string {
  const licence = img.licenseUrl
    ? `<a href="${escapeHtml(img.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(img.license)}</a>`
    : escapeHtml(img.license)
  const author = img.author && img.author !== 'Unknown author' ? ` by ${escapeHtml(decodeEntities(img.author))}` : ''
  return `<p><em>Cover image: <a href="${escapeHtml(img.pageUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(img.title.slice(0, 100))}</a>${author}, ${licence}, via Wikimedia Commons.</em></p>`
}

/** Credit line for the opt-in "use the publisher's own image" mode. */
export function buildPublisherImageCredit(publisherName: string, articleUrl: string): string {
  return `<p><em>Cover image: courtesy <a href="${escapeHtml(articleUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(publisherName)}</a>.</em></p>`
}

export async function searchCommonsImage(subjectTerms: string[], opts: { timeoutMs?: number } = {}): Promise<CommonsImage | null> {
  const query = subjectTerms.map((t) => t.trim()).filter(Boolean).slice(0, 3).join(' ')
  if (!query) return null
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '12',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1600',
    origin: '*',
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 9000)
  try {
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
      headers: { 'User-Agent': 'NewsEditionBot/1.0 (https://newsedition.in; editorial image lookup)' },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { query?: { pages?: CommonsPage[] } }
    const pages = data.query?.pages ?? []
    const best = relevantImages(parseCommonsPages(pages), subjectTerms)[0]
    return best ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
