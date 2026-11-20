import 'server-only'
import { buildSystemPrompt, buildUserPrompt, type PromptInput } from './prompts'

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini'
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  return key
}

export type RewriteInput = PromptInput

export interface RewrittenArticle {
  title: string
  content: string // HTML
  excerpt: string
  tags: string[]
  seoTitle: string
  seoDescription: string
  categorySlug: string | null
  imageAlt: string
  imagePrompt: string
  faqs: { question: string; answer: string }[]
}

async function chatJson(input: RewriteInput): Promise<RewrittenArticle> {
  const userPrompt = buildUserPrompt(input)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(input.wordLength, input.faqCount) },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      // Headroom so long articles + FAQs + the other JSON fields don't get truncated.
      max_tokens: Math.min(12000, Math.round(input.wordLength * 2) + input.faqCount * 120 + 800),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`OpenAI chat failed (${res.status}): ${detail.slice(0, 300)}`)
  }

  const data = await res.json()
  const raw = data.choices?.[0]?.message?.content
  if (!raw) throw new Error('OpenAI chat returned no content')

  const parsed = JSON.parse(raw) as Partial<RewrittenArticle>
  if (!parsed.title || !parsed.content) throw new Error('OpenAI rewrite missing title/content')

  const validSlug = input.categories.some((c) => c.slug === parsed.categorySlug)
  return {
    title: String(parsed.title).slice(0, 480),
    content: String(parsed.content),
    excerpt: String(parsed.excerpt || '').slice(0, 300),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 8) : [],
    seoTitle: String(parsed.seoTitle || parsed.title).slice(0, 190),
    seoDescription: String(parsed.seoDescription || parsed.excerpt || '').slice(0, 300),
    categorySlug: validSlug ? parsed.categorySlug! : null,
    imageAlt: String(parsed.imageAlt || parsed.title).slice(0, 190),
    imagePrompt: String(parsed.imagePrompt || parsed.title).slice(0, 900),
    faqs: Array.isArray(parsed.faqs)
      ? parsed.faqs
          .filter((f): f is { question: string; answer: string } =>
            !!f && typeof f === 'object' && typeof (f as { question?: unknown }).question === 'string' && typeof (f as { answer?: unknown }).answer === 'string')
          .map((f) => ({ question: String(f.question), answer: String(f.answer) }))
      : [],
  }
}

export async function rewriteArticle(input: RewriteInput): Promise<RewrittenArticle> {
  return chatJson(input)
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
