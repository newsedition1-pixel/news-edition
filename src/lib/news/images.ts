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

/** Publisher "images" that are really the site logo, a placeholder or a tracking pixel, not a news photo. */
export function looksLikePlaceholderImage(url: string | null | undefined): boolean {
  if (!url) return true
  const u = url.toLowerCase()
  return (
    /(logo|placeholder|default[-_.]?(image|og|share|thumb)|favicon|sprite|blank|spacer|1x1|pixel|avatar|icon[-_.]|brand[-_.]?image|no[-_]?image|fallback|masthead|watermark|og[-_.]?(image|default)|social[-_.]?(share|image|card)|share[-_.]?(image|card)|sharing[-_.]?image)/.test(u) ||
    /\/(theme|themes|static\/(theme|themes|img|images|assets|default))\//.test(u.replace(/^https?:\/\/[^/]+/, '')) ||
    /\.(svg|gif)(\?|$)/.test(u)
  )
}

/** Host + path of an image URL without the query, so the same file compares equal across size and CDN parameters. */
export function imageKey(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

/**
 * True when the picture is the publisher's site-wide share image (its logo card), which pages without
 * a photo of their own fall back to. `siteImageUrl` is the og:image of the publisher's home page.
 */
export function isSiteDefaultImage(url: string | null | undefined, siteImageUrl: string | null | undefined): boolean {
  const a = imageKey(url)
  const b = imageKey(siteImageUrl)
  return !!a && !!b && a === b
}

/**
 * True for an https URL on a public-looking host: not an IP address, not localhost, not a one-label
 * host. Guards the one place the server downloads a picture itself (the logo check's fallback).
 */
export function isPublicHttpsUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false
    const host = u.hostname.toLowerCase()
    if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[')) return false
    return true
  } catch {
    return false
  }
}

/** Logos and banners are very wide, very tall or very short; a news photo is none of those. */
export function looksLikeLogoShape(width: number | null | undefined, height: number | null | undefined): boolean {
  const w = width ?? 0
  const h = height ?? 0
  if (w <= 0 || h <= 0) return false
  const ratio = w / h
  return h < 300 || ratio > 3.2 || ratio < 0.5
}

/** The one size every stored cover has: the Open Graph / Google Discover size the article page and meta tags announce. */
export const COVER_WIDTH = 1200
export const COVER_HEIGHT = 630
/** A picture needing more enlargement than this to reach the cover size would look soft, so the next picture is tried instead. */
export const MAX_COVER_UPSCALE = 2
/** Below this width/height ratio the picture is near-square or portrait: cropping it to the wide cover would cut off most of it. */
const CROP_MIN_RATIO = 1.25

export type CoverPlan =
  | {
      /** `fill`: smart crop to the cover shape. `pad`: the whole picture on a blurred copy of itself (portrait and near-square pictures). */
      mode: 'fill' | 'pad'
      /** How much the picture is enlarged (1 = not at all, below 1 = reduced). */
      scale: number
    }
  | { mode: 'reject'; reason: string }

/**
 * Decides how a picture of the given size becomes a 1200x630 cover. Every accepted picture ends up exactly
 * that size, so the page, the Open Graph tags and the share cards all agree; a picture that cannot get
 * there without a visible loss of quality is rejected and the next candidate (another picture, Wikimedia,
 * the AI illustration) is used.
 */
export function planCover(width: number | null | undefined, height: number | null | undefined): CoverPlan {
  const w = width ?? 0
  const h = height ?? 0
  if (w <= 0 || h <= 0) return { mode: 'reject', reason: 'picture size unknown' }
  if (looksLikeLogoShape(w, h)) return { mode: 'reject', reason: `shape ${w}x${h} looks like a logo or banner, not a news photo` }
  const mode = w / h >= CROP_MIN_RATIO ? 'fill' : 'pad'
  // fill covers the whole cover (the larger of the two ratios); pad fits inside it (the smaller).
  const scale = mode === 'fill' ? Math.max(COVER_WIDTH / w, COVER_HEIGHT / h) : Math.min(COVER_WIDTH / w, COVER_HEIGHT / h)
  if (scale > MAX_COVER_UPSCALE) return { mode: 'reject', reason: `picture ${w}x${h} is too small for a ${COVER_WIDTH}x${COVER_HEIGHT} cover` }
  return { mode, scale }
}

/**
 * The Cloudinary resize step that turns a picture into the {@link COVER_WIDTH}x{@link COVER_HEIGHT} cover.
 * `fill` is the smart crop, `pad` keeps the whole picture on a blurred copy of itself, and `plain` is the
 * last resort: a centre crop with no gravity or background option for Cloudinary to refuse.
 */
export function coverResizeStep(mode: 'fill' | 'pad' | 'plain'): Record<string, unknown> {
  if (mode === 'pad') return { width: COVER_WIDTH, height: COVER_HEIGHT, crop: 'pad', background: 'blurred:400:15' }
  if (mode === 'plain') return { width: COVER_WIDTH, height: COVER_HEIGHT, crop: 'fill' }
  return { width: COVER_WIDTH, height: COVER_HEIGHT, crop: 'fill', gravity: 'auto' }
}

/** A prompt for the last-resort illustration that image models do not refuse: abstract, no people, nothing violent. */
export function safeCoverPrompt(categorySlug: string | null | undefined): string {
  const topic = (categorySlug || 'news').replace(/[-_]+/g, ' ').trim() || 'news'
  return `A calm, realistic editorial illustration for a ${topic} news story: an abstract symbolic scene with no people, no faces, no text, no logos, no flags and nothing violent.`
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
