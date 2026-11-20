import 'server-only'
import { buildRetryPrompt, buildSystemPrompt, buildUserPrompt, type PromptInput } from './prompts'

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini'
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'

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
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages,
      response_format: { type: 'json_object' },
      // Warm enough for varied phrasing, low enough to stay on the facts.
      temperature: 0.6,
      presence_penalty: 0.2,
      // Headroom so long articles + FAQs + the other JSON fields don't get truncated.
      max_tokens: Math.min(12000, Math.round(target * 2.2) + input.faqCount * 140 + 1200),
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

/** Generate a cover image, returned as a PNG data URI ready for Cloudinary. */
export async function generateCoverImage(prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt: prompt.slice(0, 900),
      size: '1536x1024',
      quality: 'medium',
      n: 1,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`OpenAI image failed (${res.status}): ${detail.slice(0, 300)}`)
  }

  const data = await res.json()
  const b64 = data.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI image returned no data')
  return `data:image/png;base64,${b64}`
}
