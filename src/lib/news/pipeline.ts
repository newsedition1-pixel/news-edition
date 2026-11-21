import 'server-only'
import { db } from '@/lib/db'
import { articles, assets } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { deleteFromCloudinary, uploadToCloudinary } from '@/lib/cloudinary'
import { generateCoverImage, rewriteArticle, type RewrittenArticle } from '@/lib/ai/openai'
import { runLlmAudit } from '@/lib/ai/audit'
import { sanitizeFaqs } from '@/lib/utils'
import { fetchTrustedArticle, type TrustedArticle } from './feeds'
import { assessArticle, htmlToText, sanitizeArticleHtml, type QualityReport } from './quality'
import { auditArticle, betterAudit, chooseSeo, parseAuditMode, retryIssues, summarizeAudit, verifyFindings, type AuditMode, type AuditResult, type AuditSummary, type LlmFindings } from './audit'
import { assembleArticleHtml, primaryDocumentLinks, type ExternalSource } from './links'
import { buildImageCredit, buildPublisherImageCredit, isSiteDefaultImage, looksLikeLogoShape, looksLikePlaceholderImage, safeCoverPrompt, searchCommonsImage } from './images'
import { publisherSiteImage } from './siteImage'
import { ensureWatermark, watermarkTransformation } from './watermark'
import { finalizeSeo, finalizeTags, rankInternalCandidates, type PublishedRow } from './meta'
import { isTrustedUrl } from './publishers'
import { MIN_NEWS_WORD_LENGTH } from '@/lib/settings'

/** Why a story was not turned into a draft. Shown to the editor; nothing is saved. */
export class SkipStory extends Error {
  constructor(
    message: string,
    /** `unreadable`: the reports could not be read (cheap, no model call). `rejected`: written but failed the checks. */
    readonly kind: 'unreadable' | 'rejected' = 'rejected'
  ) {
    super(message)
  }
}

/**
 * Which image is tried first. Whatever the mode, the chain never ends empty:
 * first choice, then the other kind of photo, then a labelled AI illustration.
 */
export type ImageMode = 'licensed_first' | 'source_first'

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
  /** When set, the article goes into this category and the model's own choice is ignored. */
  fixedCategoryId?: number
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
    /** Set when the article passed the checks but should be read by an editor before it goes live. */
    holdReason: string | null
    warnings: string[]
    sourcesUsed: string[]
    /** The pre-publication audit (see audit.ts); null when it is switched off. */
    audit: (AuditSummary & { mode: AuditMode }) | null
  }
}

const MIN_REPORT_WORDS = 250
const MIN_TOTAL_WORDS = 350
const MAX_REPORTS = 3

const MIN_COVER_WIDTH = 600

/**
 * Uploads a cover image with the NewsEdition logo burned into the corner. Images narrower than
 * `MIN_COVER_WIDTH` are rejected (they are almost always logos or thumbnails). Returns whether the
 * logo made it onto the image so the editor can be told when it did not.
 */
async function storeImage(src: string, uploadedBy: string) {
  let logoApplied = true
  let result
  try {
    await ensureWatermark()
    result = await uploadToCloudinary(src, 'newsedition/articles', { transformation: watermarkTransformation() })
  } catch {
    // Logo step failed (Cloudinary rejected the overlay). Keep the picture rather than lose it.
    logoApplied = false
    result = await uploadToCloudinary(src, 'newsedition/articles', { transformation: [{ width: 1600, crop: 'limit' }] })
  }
  if ((result.width ?? 0) < MIN_COVER_WIDTH) {
    await deleteFromCloudinary(result.public_id).catch(() => undefined)
    throw new Error('Image too small to be a news photo')
  }
  if (looksLikeLogoShape(result.width, result.height)) {
    await deleteFromCloudinary(result.public_id).catch(() => undefined)
    throw new Error(`Image shape ${result.width}x${result.height} looks like a logo or banner, not a news photo`)
  }
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
  return { url: result.secure_url, publicId: result.public_id, logoApplied }
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
    throw new SkipStory('The publishers’ full articles could not be read (paywall, blocked or too short), so the story was skipped instead of guessing.', 'unreadable')
  }
  return picked
}

interface Verified {
  article: RewrittenArticle
  content: string
  faqs: { question: string; answer: string }[]
  report: QualityReport
  attempts: number
  sourceText: string
  /** Pre-publication audit of this draft (null when switched off). */
  audit: AuditResult | null
  /** The model's claim-by-claim findings after verification (null when that pass failed). */
  llm: LlmFindings | null
}

async function rewriteVerified(story: StoryRef, reports: TrustedArticle[], opts: PipelineOptions, mode: AuditMode): Promise<Verified> {
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
  let best: Verified | null = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { article, raw } = await rewriteArticle(input, retry)
    const content = sanitizeArticleHtml(article.content)
    const faqs = sanitizeFaqs(article.faqs) ?? []
    const publisherNames = reports.map((r) => r.publisher.name)
    const report = assessArticle({
      title: article.title,
      contentHtml: content,
      faqs,
      sourceText,
      focusKeyword: article.focusKeyword,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      minWords: MIN_NEWS_WORD_LENGTH,
      publisherNames,
    })
    if (!report.ok) {
      last = report
      retry = { previousRaw: raw, issues: report.blocking }
      continue
    }

    // Pre-publication audit: the code checks plus a claim-by-claim pass against the reports.
    let audit: AuditResult | null = null
    let llm: LlmFindings | null = null
    if (mode !== 'off') {
      const bodyText = htmlToText(content)
      const articleText = `${bodyText}\n${faqs.map((f) => `${f.question} ${f.answer}`).join('\n')}`
      llm = verifyFindings(
        await runLlmAudit({
          title: article.title,
          articleText: bodyText,
          faqs,
          reports: reports.map((r) => ({ publisherName: r.publisher.name, text: r.text })),
          seoTitle: article.seoTitle,
          seoDescription: article.seoDescription,
          focusKeyword: article.focusKeyword,
        }),
        articleText,
        sourceText,
      )
      audit = auditArticle({
        title: article.title,
        contentHtml: content,
        faqs,
        sourceText,
        publisherNames,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        focusKeyword: article.focusKeyword,
        quality: report,
        llm,
      })
    }

    const candidate: Verified = { article, content, faqs, report, attempts: attempt, sourceText, audit, llm }
    // Nothing to fix, or the audit is only being recorded: this draft goes on.
    if (!audit || audit.decision === 'PUBLISH' || mode === 'log') return candidate
    best = !best || !best.audit ? candidate : betterAudit(best.audit, audit) === audit ? candidate : best
    if (attempt < 2) {
      const issues = retryIssues(audit)
      retry = { previousRaw: raw, issues: issues.length ? issues : audit.reasons }
      continue
    }
    return best
  }
  // The second draft failed the quality checks: keep the first one if it passed them (it is held for an editor).
  if (best) return best
  throw new SkipStory(`Rejected by the fact check after a retry: ${last?.blocking.join(' ') ?? 'unknown reason'}`)
}

type Cover = {
  url: string
  publicId: string
  alt: string
  creditHtml: string
  kind: 'commons' | 'publisher' | 'generated'
  logoApplied: boolean
}

/** A short, key-free reason for logs and the admin screen. */
function reasonOf(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/sk-[A-Za-z0-9_-]+/g, '[key]').replace(/\s+/g, ' ').slice(0, 160)
}

/** Why each cover step was skipped or failed, so a story without a cover says why. */
async function pickCover(
  mode: ImageMode,
  article: RewrittenArticle,
  reports: TrustedArticle[],
  uploadedBy: string,
  notes: string[]
): Promise<Cover | null> {
  const licensed = async (): Promise<Cover | null> => {
    const subjects = article.imageSubjects.length ? article.imageSubjects : [article.focusKeyword || article.title]
    const img = await searchCommonsImage(subjects)
    if (!img) {
      notes.push('Wikimedia: no licensed match')
      return null
    }
    try {
      const stored = await storeImage(img.url, uploadedBy)
      return { ...stored, alt: img.title.slice(0, 190), creditHtml: buildImageCredit(img), kind: 'commons' }
    } catch (e) {
      notes.push(`Wikimedia: ${reasonOf(e)}`)
      return null
    }
  }

  // The news photo: the picture the publisher itself used for the story (credited to the publisher).
  // A logo, a placeholder or the publisher's site-wide share image is never a news photo.
  const newsPhoto = async (): Promise<Cover | null> => {
    for (const r of reports) {
      const who = r.publisher.name
      if (!r.imageUrl) {
        notes.push(`${who}: no photo on the page`)
        continue
      }
      if (looksLikePlaceholderImage(r.imageUrl)) {
        notes.push(`${who}: logo or placeholder`)
        continue
      }
      if (isSiteDefaultImage(r.imageUrl, await publisherSiteImage(r.publisher))) {
        notes.push(`${who}: site-wide share image, not a news photo`)
        continue
      }
      try {
        const stored = await storeImage(r.imageUrl, uploadedBy)
        return { ...stored, alt: article.imageAlt, creditHtml: buildPublisherImageCredit(who, r.finalUrl), kind: 'publisher' }
      } catch (e) {
        notes.push(`${who}: ${reasonOf(e)}`)
      }
    }
    return null
  }

  const steps = mode === 'source_first' ? [newsPhoto, licensed] : [licensed, newsPhoto]
  for (const step of steps) {
    const cover = await step()
    if (cover) return cover
  }

  // Last resort so a story never goes out without a cover: a clearly labelled illustration. If the image
  // model refuses the story's own prompt (violence, real people), try once more with a neutral one.
  for (const prompt of [article.imagePrompt, safeCoverPrompt(article.categorySlug)]) {
    try {
      const stored = await storeImage(await generateCoverImage(prompt), uploadedBy)
      return {
        ...stored,
        alt: article.imageAlt,
        creditHtml: '<p><em>Cover image: AI-generated illustration, not a photograph of the event.</em></p>',
        kind: 'generated',
      }
    } catch (e) {
      notes.push(`Illustration: ${reasonOf(e)}`)
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
  const mode = parseAuditMode(process.env.NEWS_AUDIT_MODE)
  const { article, content, faqs, report, attempts, sourceText, audit: draftAudit, llm } = await rewriteVerified(story, reports, opts, mode)

  const categoryId = opts.fixedCategoryId ?? (article.categorySlug ? opts.categories.find((c) => c.slug === article.categorySlug)?.id ?? null : null)
  const tags = finalizeTags(article.tags, article.focusKeyword)
  const finalSeo = finalizeSeo({ title: article.title, seoTitle: article.seoTitle, seoDescription: article.seoDescription, excerpt: article.excerpt })
  // The audit's improved title and description replace the writer's only when the writer's fail the SEO rules and the improved pair passes them.
  const chosen = chooseSeo(finalSeo, llm?.seo, article.focusKeyword)
  const seo = chosen.replaced ? { ...finalSeo, seoTitle: chosen.seoTitle, seoDescription: chosen.seoDescription } : finalSeo

  const coverNotes: string[] = []
  const cover = await pickCover(opts.imageMode, article, reports, opts.uploadedBy, coverNotes)
  if (!cover) console.warn(`No cover image for "${article.title.slice(0, 80)}": ${coverNotes.join(' | ')}`)
  const warnings = [...report.warnings]
  if (cover && !cover.logoApplied) warnings.push('The NewsEdition logo could not be added to the cover image.')

  // Auto-publish is only safe for articles with nothing left to doubt: hold the rest for an editor.
  let holdReason: string | null = null
  if (!cover) holdReason = `no cover image could be saved (${coverNotes.join('; ').slice(0, 300)})`
  else if (report.ungroundedNames.length >= 3) holdReason = `names that are not in the source reports (${report.ungroundedNames.slice(0, 4).join(', ')})`
  // The audit verdict on the text decides; the cover and links only change the SEO and Discover parts of the score.
  else if (draftAudit && mode === 'enforce' && draftAudit.decision !== 'PUBLISH') {
    holdReason = `pre-publication audit ${draftAudit.decision} (${draftAudit.score}/100): ${draftAudit.reasons.slice(0, 2).join(' ')}`
  }

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

  // Score again now that the links and the cover are known; the findings about the text are the same.
  const finalAudit = draftAudit
    ? auditArticle({
        title: article.title,
        contentHtml: content,
        faqs,
        sourceText,
        publisherNames: reports.map((r) => r.publisher.name),
        seoTitle: seo.seoTitle,
        seoDescription: seo.seoDescription,
        focusKeyword: article.focusKeyword,
        quality: report,
        llm,
        links: { internal: assembled.internalLinks, external: assembled.externalLinks, documents: documents.length },
        cover: { kind: cover?.kind ?? 'none', alt: cover?.alt ?? null },
      })
    : null

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
      holdReason,
      warnings,
      sourcesUsed: reports.map((r) => r.publisher.name),
      audit: finalAudit && mode !== 'off' ? { ...summarizeAudit(finalAudit), decision: draftAudit?.decision ?? finalAudit.decision, mode } : null,
    },
  }
}
