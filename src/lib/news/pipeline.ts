import 'server-only'
import { db } from '@/lib/db'
import { articles, assets } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { uploadToCloudinary } from '@/lib/cloudinary'
import { generateCoverImage, rewriteArticle, type RewrittenArticle } from '@/lib/ai/openai'
import { sanitizeFaqs } from '@/lib/utils'
import { fetchTrustedArticle, type TrustedArticle } from './feeds'
import { assessArticle, sanitizeArticleHtml, type QualityReport } from './quality'
import { assembleArticleHtml, primaryDocumentLinks, type ExternalSource } from './links'
import { buildImageCredit, buildPublisherImageCredit, searchCommonsImage } from './images'
import { finalizeSeo, finalizeTags, rankInternalCandidates, type PublishedRow } from './meta'
import { isTrustedUrl } from './publishers'
import { MIN_NEWS_WORD_LENGTH } from '@/lib/settings'

/** Why a story was not turned into a draft. Shown to the editor; nothing is saved. */
export class SkipStory extends Error {}

export type ImageMode = 'licensed' | 'licensed_or_ai' | 'source'

export interface StoryRef {
  title: string
  sources: { name: string; url: string; title: string }[]
  trendTerm?: string | null
}

export interface PipelineOptions {
  categories: { id: number; slug: string; name: string }[]
  wordLength: number
  faqCount: number
  imageMode: ImageMode
  uploadedBy: string
}

export interface BuiltArticle {
  title: string
  content: string
  excerpt: string
  tags: string[]
  faqs: { question: string; answer: string }[] | null
  seoTitle: string
  seoDescription: string
  categoryId: number | null
  coverImage: string | null
  coverImageAlt: string | null
  coverImagePublicId: string | null
  sourceUrl: string
  stats: {
    wordCount: number
    attempts: number
    internalLinks: number
    externalLinks: number
    imageSource: 'commons' | 'publisher' | 'generated' | 'none'
    focusKeyword: string
    warnings: string[]
    sourcesUsed: string[]
  }
}

const MIN_REPORT_WORDS = 250
const MIN_TOTAL_WORDS = 350
const MAX_REPORTS = 3

async function storeImage(src: string, uploadedBy: string) {
  const result = await uploadToCloudinary(src, 'newsedition/articles')
  await db.insert(assets).values({
    name: `ai-news-${Date.now()}`,
    url: result.secure_url,
    publicId: result.public_id,
    type: 'image',
    format: result.format,
    size: result.bytes,
    width: result.width,
    height: result.height,
    uploadedBy,
  })
  return { url: result.secure_url, publicId: result.public_id }
}

/** Full text of up to three complete reports from trusted publishers, longest first. */
async function gatherReports(story: StoryRef): Promise<TrustedArticle[]> {
  const sources = story.sources.filter((s) => isTrustedUrl(s.url)).slice(0, 6)
  const loaded = await Promise.all(sources.map((s) => fetchTrustedArticle(s.url)))
  const complete = loaded
    .filter((r): r is TrustedArticle => !!r && !r.paywalled && r.wordCount >= MIN_REPORT_WORDS)
    .sort((a, b) => b.wordCount - a.wordCount)
  // One report per publisher.
  const seen = new Set<string>()
  const distinct = complete.filter((r) => (seen.has(r.publisher.key) ? false : (seen.add(r.publisher.key), true)))
  const picked = distinct.slice(0, MAX_REPORTS)
  const total = picked.reduce((n, r) => n + r.wordCount, 0)
  if (picked.length === 0 || total < MIN_TOTAL_WORDS) {
    throw new SkipStory('The publishers’ full articles could not be read (paywall, blocked or too short), so the story was skipped instead of guessing.')
  }
  return picked
}

async function rewriteVerified(
  story: StoryRef,
  reports: TrustedArticle[],
  opts: PipelineOptions
): Promise<{ article: RewrittenArticle; content: string; faqs: { question: string; answer: string }[]; report: QualityReport; attempts: number }> {
  const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date())
  // The date line is part of what the model may rely on, so day-of-month figures are not flagged as invented.
  const sourceText = [story.title, dateLabel, ...reports.flatMap((r) => [r.text, r.description ?? ''])].join('\n\n')
  const input = {
    headline: story.title,
    reports: reports.map((r) => ({
      publisherName: r.publisher.name,
      url: r.finalUrl,
      headline: story.sources.find((s) => s.url === r.finalUrl)?.title ?? story.title,
      text: r.text,
    })),
    categories: opts.categories.map((c) => ({ slug: c.slug, name: c.name })),
    wordLength: opts.wordLength,
    faqCount: opts.faqCount,
    trendTerm: story.trendTerm ?? null,
    dateLabel,
    minWords: MIN_NEWS_WORD_LENGTH,
  }

  let retry: { previousRaw: string; issues: string[] } | undefined
  let last: QualityReport | null = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { article, raw } = await rewriteArticle(input, retry)
    const content = sanitizeArticleHtml(article.content)
    const faqs = sanitizeFaqs(article.faqs) ?? []
    const report = assessArticle({
      title: article.title,
      contentHtml: content,
      faqs,
      sourceText,
      focusKeyword: article.focusKeyword,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      minWords: MIN_NEWS_WORD_LENGTH,
      publisherNames: reports.map((r) => r.publisher.name),
    })
    if (report.ok) return { article, content, faqs, report, attempts: attempt }
    last = report
    retry = { previousRaw: raw, issues: report.blocking }
  }
  throw new SkipStory(`Rejected by the fact check after a retry: ${last?.blocking.join(' ') ?? 'unknown reason'}`)
}

async function pickCover(
  mode: ImageMode,
  article: RewrittenArticle,
  reports: TrustedArticle[],
  uploadedBy: string
): Promise<{ url: string; publicId: string; alt: string; creditHtml: string; kind: BuiltArticle['stats']['imageSource'] } | null> {
  const tryCommons = async () => {
    const subjects = article.imageSubjects.length ? article.imageSubjects : [article.focusKeyword || article.title]
    const img = await searchCommonsImage(subjects)
    if (!img) return null
    try {
      const stored = await storeImage(img.url, uploadedBy)
      return { ...stored, alt: img.title.slice(0, 190), creditHtml: buildImageCredit(img), kind: 'commons' as const }
    } catch {
      return null
    }
  }

  if (mode === 'source') {
    const lead = reports.find((r) => r.imageUrl)
    if (lead?.imageUrl) {
      try {
        const stored = await storeImage(lead.imageUrl, uploadedBy)
        return { ...stored, alt: article.imageAlt, creditHtml: buildPublisherImageCredit(lead.publisher.name, lead.finalUrl), kind: 'publisher' }
      } catch {
        /* fall through to a licensed image */
      }
    }
  }

  const commons = await tryCommons()
  if (commons) return commons

  if (mode === 'licensed_or_ai') {
    try {
      const stored = await storeImage(await generateCoverImage(article.imagePrompt), uploadedBy)
      return { ...stored, alt: article.imageAlt, creditHtml: '<p><em>Cover image: AI-generated illustration, not a photograph of the event.</em></p>', kind: 'generated' }
    } catch {
      return null
    }
  }
  return null
}

async function loadPublished(): Promise<PublishedRow[]> {
  const rows = await db
    .select({ title: articles.title, slug: articles.slug, tags: articles.tags, categoryId: articles.categoryId })
    .from(articles)
    .where(eq(articles.status, 'published'))
    .orderBy(desc(articles.publishedAt))
    .limit(300)
  return rows
}

export async function buildArticleFromStory(story: StoryRef, opts: PipelineOptions): Promise<BuiltArticle> {
  const reports = await gatherReports(story)
  const { article, content, faqs, report, attempts } = await rewriteVerified(story, reports, opts)

  const categoryId = article.categorySlug ? opts.categories.find((c) => c.slug === article.categorySlug)?.id ?? null : null
  const tags = finalizeTags(article.tags, article.focusKeyword)
  const seo = finalizeSeo({ title: article.title, seoTitle: article.seoTitle, seoDescription: article.seoDescription, excerpt: article.excerpt })

  const cover = await pickCover(opts.imageMode, article, reports, opts.uploadedBy)

  const primary: ExternalSource = { name: reports[0].publisher.name, url: reports[0].finalUrl, title: story.sources.find((s) => s.url === reports[0].finalUrl)?.title }
  const others: ExternalSource[] = reports.slice(1).map((r) => ({
    name: r.publisher.name,
    url: r.finalUrl,
    title: story.sources.find((s) => s.url === r.finalUrl)?.title,
  }))
  const documents = primaryDocumentLinks(reports.flatMap((r) => r.links))
  const internal = rankInternalCandidates({ title: article.title, tags, categoryId }, await loadPublished())

  const assembled = assembleArticleHtml({
    bodyHtml: content,
    internal,
    primary,
    others,
    documents,
    imageCreditHtml: cover?.creditHtml,
  })

  return {
    title: article.title,
    content: assembled.html,
    excerpt: seo.excerpt,
    tags,
    faqs: faqs.length ? faqs : null,
    seoTitle: seo.seoTitle,
    seoDescription: seo.seoDescription,
    categoryId,
    coverImage: cover?.url ?? null,
    coverImageAlt: cover?.alt ?? null,
    coverImagePublicId: cover?.publicId ?? null,
    sourceUrl: reports[0].finalUrl,
    stats: {
      wordCount: report.wordCount,
      attempts,
      internalLinks: assembled.internalLinks,
      externalLinks: assembled.externalLinks,
      imageSource: cover?.kind ?? 'none',
      focusKeyword: article.focusKeyword,
      warnings: report.warnings,
      sourcesUsed: reports.map((r) => r.publisher.name),
    },
  }
}
