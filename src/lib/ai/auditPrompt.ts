/**
 * Prompts and parser for the claim-by-claim audit pass. Pure (no network), so they are unit-tested.
 * The model only judges what is in front of it: the article and the reports it was written from.
 */
import type { ClaimStatus, LlmFindings } from '@/lib/news/audit'

export interface AuditPromptInput {
  title: string
  articleText: string
  faqs: { question: string; answer: string }[]
  reports: { publisherName: string; text: string }[]
  seoTitle: string
  seoDescription: string
  focusKeyword: string
}

export function buildAuditSystemPrompt(): string {
  return `You are the checking editor of a news website. You audit one article against the reports it was written from. You judge only what you are given.

STRICT RULES
- Never use outside knowledge to decide whether something is true. "Supported" means the reports say it. "Unsupported" means the reports do not say it. You do not know whether it is true in the world.
- Never invent a fact, a figure, a name, a quotation or a source. Never suggest adding one.
- Every "snippet" must be copied word for word from the article (at most 25 words). Every "evidence" must be copied word for word from the reports (at most 30 words).
- "contradicted": the reports say something different (give the evidence). "misattributed": the reports give the statement or fact to someone else (give the evidence). "unsupported": the reports do not contain it. "supported": the reports contain it. Use "unsupported" when unsure; use "contradicted" or "misattributed" only with evidence.
- Do not guess who or what wrote the article. Describe writing patterns only.
- Do not rewrite the article. Do not change facts to sound original.

TASK
1. claims: check up to 14 claims, the most checkable ones first: names, dates, places, figures, official statements, who said what, and cause-and-effect statements. Skip the section headed "Analysis" unless it states a new fact, figure, name or quotation that the reports do not contain.
2. aiStyle: up to 4 repetitive sentences, generic phrases, robotic transitions or predictable structures, each with a snippet.
3. weak: up to 4 paragraphs that need work (vague, repeated, unsupported leaps, padding). For each: a snippet, the problem, and a fix that uses only facts from the reports.
4. originality: up to 3 ways to add reader value (context, explanation, comparison) that need only facts already in the reports.
5. seo: one improved SEO title (35 to 60 characters, keyword near the front) and one meta description (125 to 155 characters, plain, accurate, no clickbait). Use only facts that are in the article.

Return one JSON object only:
{"claims":[{"claim":"","snippet":"","status":"supported|unsupported|contradicted|misattributed","evidence":""}],"aiStyle":[{"signal":"","snippet":""}],"weak":[{"snippet":"","problem":"","fix":""}],"originality":[""],"seo":{"title":"","description":""}}`
}

export function buildAuditUserPrompt(input: AuditPromptInput): string {
  const reports = input.reports.map((r, i) => `--- REPORT ${i + 1}: ${r.publisherName} ---\n${r.text}`).join('\n\n')
  const faqs = input.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n')
  return `ARTICLE HEADLINE: ${input.title}
FOCUS KEYWORD: ${input.focusKeyword || '(none)'}
CURRENT SEO TITLE: ${input.seoTitle}
CURRENT META DESCRIPTION: ${input.seoDescription}

ARTICLE TEXT:
${input.articleText}

FAQS:
${faqs || '(none)'}

REPORTS THE ARTICLE WAS WRITTEN FROM:
${reports}`
}

const STATUSES = new Set<ClaimStatus>(['supported', 'unsupported', 'contradicted', 'misattributed'])

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/** Reads the model's JSON tolerantly; anything malformed is dropped. Returns null when it is not JSON at all. */
export function parseAuditJson(raw: string): LlmFindings | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>

  const claims = list(o.claims)
    .map((c) => {
      const r = (c ?? {}) as Record<string, unknown>
      const status = str(r.status, 20).toLowerCase() as ClaimStatus
      return { claim: str(r.claim, 200), snippet: str(r.snippet, 300), status, evidence: str(r.evidence, 400) || undefined }
    })
    .filter((c) => c.snippet && STATUSES.has(c.status))
    .slice(0, 14)

  const aiStyle = list(o.aiStyle)
    .map((a) => ({ signal: str((a as Record<string, unknown>)?.signal, 160), snippet: str((a as Record<string, unknown>)?.snippet, 300) }))
    .filter((a) => a.signal && a.snippet)
    .slice(0, 4)

  const weak = list(o.weak)
    .map((w) => {
      const r = (w ?? {}) as Record<string, unknown>
      return { snippet: str(r.snippet, 300), problem: str(r.problem, 200), fix: str(r.fix, 400) }
    })
    .filter((w) => w.snippet && w.problem)
    .slice(0, 4)

  const originality = list(o.originality).map((x) => str(x, 240)).filter(Boolean).slice(0, 3)

  const seoRaw = (o.seo ?? null) as Record<string, unknown> | null
  const seo = seoRaw && str(seoRaw.title, 120) && str(seoRaw.description, 300) ? { title: str(seoRaw.title, 120), description: str(seoRaw.description, 300) } : null

  return { claims, aiStyle, weak, originality, seo }
}
