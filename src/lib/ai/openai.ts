import 'server-only'
import { buildRetryPrompt, buildSystemPrompt, buildUserPrompt, type PromptInput } from './prompts'
import { imageModelChain, modelUnavailable } from './imageModels'

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini'

/** GPT-5 and o-series models reject temperature, presence_penalty and max_tokens, and spend part of the budget on reasoning. */
export function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model)
}

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  return key
}

export type RewriteInput = PromptInput & { minWords: number }

export interface RewrittenArticle {
  title: string
  focusKeyword: string
  content: string // HTML (untrusted until sanitised)
  excerpt: string
  tags: string[]
  seoTitle: string
  seoDescription: string
  categorySlug: string | null
  imageAlt: string
  imagePrompt: string
  imageSubjects: string[]
  faqs: { question: string; answer: string }[]
}

export interface RewriteRetry {
  /** The raw JSON the model returned last time. */
  previousRaw: string
  issues: string[]
}

export interface RewriteResult {
  article: RewrittenArticle
  raw: string
}

function asStringArray(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.map(String).map((s) => s.trim()).filter(Boolean).slice(0, max) : []
}

async function chatJson(input: RewriteInput, retry?: RewriteRetry): Promise<RewriteResult> {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: buildSystemPrompt(input.wordLength, input.faqCount, input.minWords) },
    { role: 'user', content: buildUserPrompt(input) },
  ]
  if (retry) {
    messages.push({ role: 'assistant', content: retry.previousRaw })
    messages.push({ role: 'user', content: buildRetryPrompt(retry.issues) })
  }

  const target = Math.max(input.wordLength, input.minWords)
  // Headroom so long articles + FAQs + the other JSON fields don't get truncated.
  const outputBudget = Math.min(12000, Math.round(target * 2.2) + input.faqCount * 140 + 1200)
  const params = isReasoningModel(TEXT_MODEL)
    ? { max_completion_tokens: outputBudget + 8000, reasoning_effort: 'low' }
    : {
        // Warm enough for varied phrasing, low enough to stay on the facts.
        temperature: 0.6,
        presence_penalty: 0.2,
        max_tokens: outputBudget,
      }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages,
      response_format: { type: 'json_object' },
      ...params,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`OpenAI chat failed (${res.status}): ${detail.slice(0, 300)}`)
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content
  if (!raw) throw new Error('OpenAI chat returned no content')
  if (data.choices?.[0]?.finish_reason === 'length') throw new Error('OpenAI rewrite was cut off (too long)')

  let parsed: Partial<RewrittenArticle>
  try {
    parsed = JSON.parse(raw) as Partial<RewrittenArticle>
  } catch {
    throw new Error('OpenAI rewrite was not valid JSON')
  }
  if (!parsed.title || !parsed.content) throw new Error('OpenAI rewrite missing title/content')

  const validSlug = input.categories.some((c) => c.slug === parsed.categorySlug)
  const title = String(parsed.title).trim().slice(0, 480)
  return {
    raw,
    article: {
      title,
      focusKeyword: String(parsed.focusKeyword || '').trim().toLowerCase().slice(0, 60),
      content: String(parsed.content),
      excerpt: String(parsed.excerpt || '').trim().slice(0, 300),
      tags: asStringArray(parsed.tags, 10),
      seoTitle: String(parsed.seoTitle || title).trim().slice(0, 190),
      seoDescription: String(parsed.seoDescription || parsed.excerpt || '').trim().slice(0, 300),
      categorySlug: validSlug ? parsed.categorySlug! : null,
      imageAlt: String(parsed.imageAlt || title).trim().slice(0, 190),
      imagePrompt: String(parsed.imagePrompt || title).trim().slice(0, 900),
      imageSubjects: asStringArray(parsed.imageSubjects, 3),
      faqs: Array.isArray(parsed.faqs)
        ? parsed.faqs
            .filter((f): f is { question: string; answer: string } =>
              !!f && typeof f === 'object' && typeof (f as { question?: unknown }).question === 'string' && typeof (f as { answer?: unknown }).answer === 'string')
            .map((f) => ({ question: String(f.question), answer: String(f.answer) }))
        : [],
    },
  }
}

export async function rewriteArticle(input: RewriteInput, retry?: RewriteRetry): Promise<RewriteResult> {
  return chatJson(input, retry)
}

/** Models the API has said are gone or closed to this account (kept for the life of the server instance). */
const unavailableImageModels = new Set<string>()
/** The model that last worked, tried first on the next call. */
let workingImageModel: string | null = null

/**
 * Generate a cover image, returned as a PNG data URI ready for Cloudinary. Tries OPENAI_IMAGE_MODEL and then
 * the models in imageModels.ts; only an "unavailable model" answer moves on to the next one.
 */
export async function generateCoverImage(prompt: string): Promise<string> {
  const chain = imageModelChain(process.env.OPENAI_IMAGE_MODEL)
  const order = workingImageModel && chain.includes(workingImageModel) ? [workingImageModel, ...chain.filter((m) => m !== workingImageModel)] : chain
  const problems: string[] = []

  for (const model of order) {
    if (unavailableImageModels.has(model)) continue
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
      body: JSON.stringify({
        model,
        prompt: prompt.slice(0, 900),
        size: '1536x1024',
        quality: 'medium',
        n: 1,
      }),
    })

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300)
      if (modelUnavailable(res.status, detail)) {
        unavailableImageModels.add(model)
        problems.push(`${model}: ${res.status}`)
        console.warn(`OpenAI image model ${model} is not available (${res.status}): ${detail}`)
        continue
      }
      throw new Error(`OpenAI image failed (${res.status}, ${model}): ${detail}`)
    }

    const data = await res.json()
    const b64 = data.data?.[0]?.b64_json
    if (!b64) throw new Error(`OpenAI image returned no data (${model})`)
    workingImageModel = model
    return `data:image/png;base64,${b64}`
  }

  throw new Error(`OpenAI image: no image model is available (${problems.join(', ') || 'all skipped'}). Set OPENAI_IMAGE_MODEL to one the account can use.`)
}
