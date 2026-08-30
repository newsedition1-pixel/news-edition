import 'server-only'

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini'
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  return key
}

export interface RewriteInput {
  title: string
  snippet: string
  sourceDescription: string | null
  categories: { slug: string; name: string }[]
  /** Target article body length in words. */
  wordLength: number
  /** Number of FAQs to generate; 0 means none. */
  faqCount: number
}

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

function buildSystemPrompt(wordLength: number, faqCount: number): string {
  const faqLine = faqCount > 0
    ? `- "faqs": array of exactly ${faqCount} reader FAQs relevant to the story, each an object {"question": string, "answer": string}. Questions must be natural and specific; answers 1-3 sentences, factual, no fabricated data.`
    : `- "faqs": an empty array [].`

  return `You are a professional news editor for an Indian English-language news website.
You are given a headline and a short snippet from a source. Write an ORIGINAL news article in your own words — never copy the source phrasing. Be factual and neutral; do not invent specific quotes, statistics, or named sources that are not implied by the input. You may expand with relevant background, context, and neutral analysis to reach the target length, but never fabricate concrete facts.

Return ONLY a JSON object with these exact keys:
- "title": a clear, original headline (max 120 chars)
- "content": the article body as clean semantic HTML using <p>, <h2>, <ul>/<li>, <blockquote>. No <html>/<head>/<body>, no markdown, no inline styles. Aim for approximately ${wordLength} words, organised into several paragraphs with <h2> subheadings where it helps readability.
- "excerpt": a 1-2 sentence summary (max 200 chars, plain text)
- "tags": array of 3-6 short lowercase topic tags
- "seoTitle": SEO title (max 60 chars)
- "seoDescription": SEO meta description (max 155 chars)
- "categorySlug": the slug of the single best-matching category from the provided list, or null if none fit
- "imageAlt": concise alt text describing a fitting cover image (max 120 chars)
- "imagePrompt": a vivid, safe, photorealistic image generation prompt for a news cover image relevant to the story. No text/watermarks/logos, no real identifiable public figures.
${faqLine}`
}

async function chatJson(input: RewriteInput): Promise<RewrittenArticle> {
  const categoryList = input.categories.length
    ? input.categories.map((c) => `- ${c.name} (slug: ${c.slug})`).join('\n')
    : '(none available — use null)'

  const userPrompt = `Source headline: ${input.title}
Source snippet: ${input.snippet || '(none)'}
Additional context: ${input.sourceDescription || '(none)'}
Target article length: approximately ${input.wordLength} words.
FAQs to generate: ${input.faqCount > 0 ? input.faqCount : 'none (empty array)'}.

Available categories:
${categoryList}`

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
