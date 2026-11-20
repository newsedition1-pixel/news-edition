/**
 * Prompt builders for the AI news rewrite. Kept free of server-only / network code so the
 * attribution rules can be unit-tested.
 */

export interface PromptInput {
  title: string
  snippet: string
  sourceDescription: string | null
  /** Publisher that reported the story (e.g. "The Hindu"), when the news feed names it. */
  sourceName?: string | null
  categories: { slug: string; name: string }[]
  /** Target article body length in words. */
  wordLength: number
  /** Number of FAQs to generate; 0 means none. */
  faqCount: number
}

export function buildSystemPrompt(wordLength: number, faqCount: number): string {
  const faqLine = faqCount > 0
    ? `- "faqs": array of exactly ${faqCount} reader FAQs relevant to the story, each an object {"question": string, "answer": string}. Questions must be natural and specific; answers 1-3 sentences, factual, no fabricated data.`
    : `- "faqs": an empty array [].`

  return `You are a professional news editor for an Indian English-language news website.
You are given a headline and a short snippet from a source. Write an ORIGINAL news article in your own words — never copy the source phrasing. Be factual and neutral; do not invent specific quotes, statistics, or named sources that are not implied by the input. You may expand with relevant background, context, and neutral analysis to reach the target length, but never fabricate concrete facts.

Attribution rules:
- If the input names the publisher that reported the story, attribute the key facts to that publisher in plain words in the first two paragraphs (for example "according to The Hindu" or "as reported by The Hindu"). Use the publisher name exactly as given.
- Never use vague attributions such as "reportedly", "sources said", "it is believed", "experts say" or "observers note". Either name who said it, because the headline or snippet names them, or state the fact without attribution.
- Name a person or organisation as the source of a claim only if the headline or snippet names them. Do not write a "Source:" line; the website adds it.

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

export function buildUserPrompt(input: PromptInput): string {
  const categoryList = input.categories.length
    ? input.categories.map((c) => `- ${c.name} (slug: ${c.slug})`).join('\n')
    : '(none available — use null)'

  const publisher = input.sourceName?.trim()
  const publisherLine = publisher
    ? `Reported by (publisher): ${publisher}`
    : 'Reported by (publisher): (not named — do not attribute the story to any outlet and do not use vague attributions)'

  return `Source headline: ${input.title}
${publisherLine}
Source snippet: ${input.snippet || '(none)'}
Additional context: ${input.sourceDescription || '(none)'}
Target article length: approximately ${input.wordLength} words.
FAQs to generate: ${input.faqCount > 0 ? input.faqCount : 'none (empty array)'}.

Available categories:
${categoryList}`
}
