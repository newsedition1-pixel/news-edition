/**
 * Extracts the readable text of a news article from its HTML so the rewrite works from the full
 * report, not a headline. Pure (no network) so it can be unit-tested. Tries, in order: JSON-LD
 * `articleBody`, then the paragraphs inside <article>, then paragraphs anywhere on the page.
 */
import { decodeEntities, stripTags } from './feedParse'

export interface ExtractedArticle {
  text: string
  paragraphs: string[]
  wordCount: number
  imageUrl: string | null
  imageCredit: string | null
  description: string | null
  /** Absolute links found inside the article body (used to find primary documents). */
  links: { url: string; text: string }[]
  /** True when the page looks like a paywall / subscriber gate rather than a full article. */
  paywalled: boolean
}

export function countWords(text: string): number {
  const t = text.replace(/<[^>]+>/g, ' ').trim()
  if (!t) return 0
  return t.split(/\s+/).filter((w) => /[A-Za-z0-9ऀ-ॿ]/.test(w)).length
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*?(?:property|name)=["']${key}["'][^>]*?>`, 'i')
  const tag = html.match(re)?.[0]
  if (!tag) return null
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1]
  return content ? decodeEntities(content).trim() || null : null
}

function jsonLdBodies(html: string): string[] {
  const out: string[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try {
      const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return
        if (Array.isArray(node)) { node.forEach(walk); return }
        const obj = node as Record<string, unknown>
        if (typeof obj.articleBody === 'string') out.push(obj.articleBody)
        for (const v of Object.values(obj)) if (v && typeof v === 'object') walk(v)
      }
      walk(JSON.parse(m[1].trim()))
    } catch {
      /* malformed JSON-LD: ignore */
    }
  }
  return out
}

const BOILERPLATE_RE = /^(also read|read more|related|advertisement|subscribe|sign up|follow us|click here|download the|catch all the|stay updated|join our|copyright|©|all rights reserved|share this|tags?:|first published|updated:|published:|photo:|file photo|image:|\(with inputs from|\(this story has been|this report is|get the latest)/i

function cleanParagraph(p: string): string {
  return stripTags(p).replace(/\s+/g, ' ').trim()
}

function paragraphsFromHtml(fragment: string): string[] {
  const paras: string[] = []
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(fragment))) {
    const t = cleanParagraph(m[1])
    if (t.length < 40) continue
    if (BOILERPLATE_RE.test(t)) continue
    paras.push(t)
  }
  return paras
}

function articleFragment(html: string): string {
  const body = html.replace(/<(script|style|noscript|nav|footer|aside|form|header)\b[\s\S]*?<\/\1>/gi, ' ')
  const articles = body.match(/<article\b[\s\S]*?<\/article>/gi)
  if (articles && articles.length) {
    // The biggest <article> is the story; others are teasers.
    return articles.sort((a, b) => b.length - a.length)[0]
  }
  const main = body.match(/<main\b[\s\S]*?<\/main>/i)
  return main ? main[0] : body
}

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(decodeEntities(href), base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

function linksFromFragment(fragment: string, base: string): { url: string; text: string }[] {
  const out: { url: string; text: string }[] = []
  const seen = new Set<string>()
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(fragment))) {
    const url = absolute(m[1], base)
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ url, text: cleanParagraph(m[2]).slice(0, 120) })
  }
  return out
}

const PAYWALL_RE = /(subscribe to (continue|read)|already a subscriber|sign in to read|become a member to read|premium (article|content)|this article is (available )?(only )?for (subscribers|members)|to continue reading)/i

/** The page's own share image (og:image, else twitter:image) as an absolute URL, or null. */
export function socialImageOf(html: string, pageUrl: string): string | null {
  const raw = metaContent(html, 'og:image') || metaContent(html, 'twitter:image')
  return raw ? absolute(raw, pageUrl) : null
}

export function extractArticle(html: string, pageUrl: string): ExtractedArticle {
  let paragraphs: string[] = []

  for (const body of jsonLdBodies(html)) {
    const text = cleanParagraph(body.replace(/<br\s*\/?>/gi, '\n'))
    // articleBody is usually one blob; split on sentence-group boundaries into pseudo paragraphs.
    const parts = body.includes('\n') || /<p\b/i.test(body)
      ? (/<p\b/i.test(body) ? paragraphsFromHtml(body) : body.split(/\n+/).map(cleanParagraph).filter((p) => p.length >= 40))
      : text.match(/[^.!?]+[.!?]+(\s|$)/g)?.reduce<string[]>((acc, s, i) => {
          if (i % 3 === 0) acc.push(s.trim()); else acc[acc.length - 1] += ` ${s.trim()}`
          return acc
        }, []) ?? [text]
    if (parts.join(' ').length > paragraphs.join(' ').length) paragraphs = parts
  }

  const fragment = articleFragment(html)
  if (countWords(paragraphs.join(' ')) < 250) {
    const fromDom = paragraphsFromHtml(fragment)
    if (fromDom.join(' ').length > paragraphs.join(' ').length) paragraphs = fromDom
  }

  const text = paragraphs.join('\n\n')
  const wordCount = countWords(text)

  return {
    text,
    paragraphs,
    wordCount,
    imageUrl: socialImageOf(html, pageUrl),
    imageCredit: null,
    description: metaContent(html, 'og:description') || metaContent(html, 'description'),
    links: linksFromFragment(fragment, pageUrl),
    paywalled: wordCount < 400 && PAYWALL_RE.test(html),
  }
}
