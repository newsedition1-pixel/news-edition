/**
 * Turns a published article into the post for each social platform: the headline first (it carries
 * the keywords), one or two sentences of summary, the link where the platform makes links useful,
 * and a few hashtags. Pure and unit-tested; nothing here talks to the network.
 */
import { BRAND_TAG, pickHashtags, toHashtag, type FeedChannel } from './hashtags'

export interface ArticleForSocial {
  title: string
  excerpt: string | null
  /** Full public URL of the article. */
  url: string
  tags: string[]
  categorySlug: string | null
  categoryName: string | null
  /** Cover image (a Cloudinary URL for every article made by the automation). */
  imageUrl: string | null
  /** The stored article HTML; only read to see whether the cover is a labelled AI illustration. */
  content?: string | null
}

/** A poll attached to a tweet (X takes 2 to 4 options of at most 25 characters, open for 5 minutes to 7 days). */
export interface XPoll {
  options: string[]
  durationMinutes: number
}

export interface ComposedPost {
  /** What is posted (Telegram: HTML, others: plain text). */
  text: string
  hashtags: string[]
  /** The link the platform should attach (Facebook link card). Null when the text already carries it or none is wanted. */
  link: string | null
  imageUrl: string | null
  /** X only: the tweet is a poll (and then carries no picture). */
  poll?: XPoll | null
}

export interface ComposedSet {
  telegram: ComposedPost
  x: ComposedPost
  facebook: ComposedPost
  instagram: ComposedPost
  keywords: string[]
  /** True when the cover is a labelled AI illustration (Instagram is skipped for those). */
  aiCover: boolean
}

export const X_LIMIT = 280
export const X_URL_WEIGHT = 23
export const TELEGRAM_CAPTION_TARGET = 950
export const INSTAGRAM_CAPTION_LIMIT = 2200

/**
 * Padded 4:5 JPEG (Instagram takes 4:5 to 1.91:1), so the whole photo and the logo in its corner stay visible.
 * The padding takes the photo's main colour: Cloudinary's blurred background (b_blurred) works for video only.
 */
export const INSTAGRAM_IMAGE = 'c_pad,w_1080,h_1350,b_auto:predominant,f_jpg,q_auto'
export const TELEGRAM_IMAGE = 'c_limit,w_1280,f_jpg,q_auto'

// ── text helpers ────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' }

/** Plain one-line text: tags stripped, common entities decoded, whitespace collapsed. */
export function plain(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|nbsp|quot|#39|lt|gt);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cuts at a word boundary and adds an ellipsis; leaves short text alone. */
export function cutAtWord(s: string, max: number): string {
  if (s.length <= max) return s
  if (max <= 1) return '…'
  const slice = s.slice(0, max - 1)
  const space = slice.lastIndexOf(' ')
  const cut = space > max * 0.6 ? slice.slice(0, space) : slice
  return `${cut.replace(/[\s,;:–-]+$/, '')}…`
}

function sentences(s: string): string[] {
  return s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)
}

/** The first sentences of the excerpt that fit in `max` characters; a long first sentence is cut at a word. */
export function summaryOf(excerpt: string | null | undefined, max: number): string {
  const text = plain(excerpt)
  if (!text || max < 40) return ''
  let out = ''
  for (const s of sentences(text)) {
    const next = out ? `${out} ${s}` : s
    if (next.length > max) break
    out = next
  }
  return out || cutAtWord(text, max)
}

/** Weighted length as X counts it: a link is always 23, characters outside the Latin ranges count double. */
export function weightedLength(text: string): number {
  let n = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    n += c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037) ? 1 : 2
  }
  return n
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}

/** The article's own topics as plain keywords (generic words and duplicates dropped). */
export function keywordsOf(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = plain(raw)
    if (!t || !toHashtag(t)) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}

/** True when the cover is the labelled AI illustration the pipeline uses as a last resort. */
export function hasAiCover(content: string | null | undefined): boolean {
  return /AI-generated illustration/i.test(content ?? '')
}

/** Puts a Cloudinary transformation in front of an uploaded image's URL; any other URL is returned as it is. */
export function cloudinaryVariant(url: string | null, transformation: string): string | null {
  if (!url) return null
  const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/)
  return m ? `${m[1]}${transformation}/${m[2]}` : url
}

// ── per platform ────────────────────────────────────────────────────────────

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return 'newsedition.in'
  }
}

function composeTelegram(a: ArticleForSocial, headline: string, tags: string[]): ComposedPost {
  const cta = 'Read the full story on NewsEdition'
  const tagLine = tags.join(' ')
  const room = TELEGRAM_CAPTION_TARGET - headline.length - cta.length - tagLine.length - 6
  const summary = summaryOf(a.excerpt, room)
  const parts = [`<b>${escapeHtml(headline)}</b>`]
  if (summary) parts.push(escapeHtml(summary))
  parts.push(`<a href="${escapeAttr(a.url)}">${cta}</a>`)
  if (tagLine) parts.push(escapeHtml(tagLine))
  return { text: parts.join('\n\n'), hashtags: tags, link: null, imageUrl: cloudinaryVariant(a.imageUrl, TELEGRAM_IMAGE) }
}

function fitSentences(summary: string, room: number): string {
  let out = ''
  for (const s of sentences(summary)) {
    const next = out ? `${out} ${s}` : s
    if (weightedLength(next) > room) break
    out = next
  }
  return out
}

function composeX(a: ArticleForSocial, headline: string, tags: string[], withLink: boolean): ComposedPost {
  const tagLine = tags.join(' ')
  const fixed = (withLink ? 2 + X_URL_WEIGHT : 0) + (tagLine ? 2 + weightedLength(tagLine) : 0)
  const room = X_LIMIT - fixed
  let body = headline
  while (weightedLength(body) > room && body.length > 1) body = cutAtWord(body, Math.max(1, body.length - 8))
  // Spare room goes to a whole sentence of summary.
  const spare = room - weightedLength(body) - 2
  const summary = spare >= 50 ? fitSentences(plain(a.excerpt), spare) : ''
  const parts = [summary ? `${body}\n\n${summary}` : body]
  if (withLink) parts.push(a.url)
  if (tagLine) parts.push(tagLine)
  return { text: parts.join('\n\n'), hashtags: tags, link: null, imageUrl: null }
}

function composeFacebook(a: ArticleForSocial, headline: string, tags: string[]): ComposedPost {
  const summary = summaryOf(a.excerpt, 400)
  const parts = [headline]
  if (summary) parts.push(summary)
  if (tags.length) parts.push(tags.join(' '))
  return { text: parts.join('\n\n'), hashtags: tags, link: a.url, imageUrl: null }
}

function composeInstagram(a: ArticleForSocial, headline: string, tags: string[], keywords: string[]): ComposedPost {
  const more = `More on ${host(a.url)} (link in bio)`
  const topics = keywords.length ? `Topics: ${keywords.slice(0, 4).join(' · ')}` : ''
  const tagLine = tags.join(' ')
  const fixed = [headline, more, topics, tagLine].filter(Boolean).join('\n\n').length + 8
  const summary = summaryOf(a.excerpt, Math.min(500, INSTAGRAM_CAPTION_LIMIT - fixed))
  const parts = [headline]
  if (summary) parts.push(summary)
  parts.push(more)
  if (topics) parts.push(topics)
  if (tagLine) parts.push(tagLine)
  return { text: parts.join('\n\n'), hashtags: tags, link: null, imageUrl: cloudinaryVariant(a.imageUrl, INSTAGRAM_IMAGE) }
}

/** Builds the post for every platform. `xLink` decides whether the tweet carries the article link (a link makes a post cost 13x more on X). */
export function composeAll(a: ArticleForSocial, opts: { xLink: boolean }): ComposedSet {
  const headline = plain(a.title)
  const src = { tags: a.tags, categorySlug: a.categorySlug, categoryName: a.categoryName }
  const tags = (ch: FeedChannel) => pickHashtags(ch, src)
  const keywords = keywordsOf(a.tags)
  return {
    telegram: composeTelegram(a, headline, tags('telegram')),
    x: composeX(a, headline, tags('x'), opts.xLink),
    facebook: composeFacebook(a, headline, tags('facebook')),
    instagram: composeInstagram(a, headline, tags('instagram'), keywords),
    keywords,
    aiCover: hasAiCover(a.content),
  }
}

/** The JSON a Make / Zapier / n8n scenario receives, with every platform's text ready to use. */
export function webhookPayload(a: ArticleForSocial, set: ComposedSet, extra: { feed: boolean }) {
  return {
    event: 'article.published',
    brandTag: BRAND_TAG,
    title: plain(a.title),
    url: a.url,
    excerpt: plain(a.excerpt),
    category: a.categoryName,
    keywords: set.keywords,
    imageUrl: a.imageUrl,
    instagramImageUrl: set.instagram.imageUrl,
    /** True for the few stories of the day meant for Instagram and Facebook. */
    feed: extra.feed,
    aiCover: set.aiCover,
    posts: {
      telegram: set.telegram.text,
      x: set.x.text,
      facebook: set.facebook.text,
      instagram: set.instagram.text,
    },
  }
}
