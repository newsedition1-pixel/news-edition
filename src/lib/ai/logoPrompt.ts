/**
 * Prompt and answer parsing for the cover-image logo check: before a publisher's picture becomes our
 * cover, a vision model looks at it and says whether a media brand's logo, watermark or credit stamp
 * is printed on it. Pure (no network) so it can be unit-tested; the call itself is in `logoCheck.ts`.
 */

export interface LogoVerdict {
  /** True when a media brand mark is printed on top of the picture (so the picture must not be used). */
  hasLogo: boolean
  /** Short human-readable findings for logs and the admin screen, e.g. "NDTV (top-left)". */
  marks: string[]
}

export function buildLogoSystemPrompt(): string {
  return [
    'You inspect one news photo before a website uses it as a story cover. Decide whether a media brand mark has been added ON TOP of the picture.',
    '',
    'Flag it (kind "overlay") when you can see any of these added over the picture:',
    '- the logo or wordmark of a news publisher, TV channel, news agency or photo agency (for example NDTV, India Today, Aaj Tak, Times of India, The Hindu, Hindustan Times, Indian Express, ABP, Zee, News18, Republic, Scroll, ANI, PTI, Reuters, AP, AFP, Getty Images, BBC, Al Jazeera, CNN, or any other outlet);',
    '- a semi-transparent or faint watermark with a name or logo, even if small or in a corner;',
    '- a channel bug in a screen corner, a "LIVE" box carrying a channel name, a news ticker or lower-third bar that carries a channel or outlet name;',
    '- a credit stamp printed on the picture, such as "Photo: ANI" or "Credit: Getty Images";',
    '- a branded news-card or template where the photo is wrapped in the outlet\'s frame, logo strip or headline banner.',
    '',
    'Do NOT flag, and list as kind "in_scene" only if worth noting: logos that are part of the real scene, such as microphone flags, banners, signboards, vehicles, buildings, clothing or sponsor boards. Plain subtitles or captions with no outlet name are not marks.',
    '',
    'Look carefully at all four corners and the edges, where logos usually sit. If you are unsure whether a faint mark is a logo, count it as an overlay.',
    '',
    'Answer with JSON only, in exactly this shape:',
    '{"marks":[{"brand":"<outlet name or unknown>","kind":"overlay or in_scene","where":"<e.g. top-left>"}],"brandedCard":true or false}',
    'Use an empty "marks" list and "brandedCard": false when the picture is clean.',
  ].join('\n')
}

export function buildLogoUserText(): string {
  return 'Check this picture for a media brand logo, watermark or credit stamp printed on it.'
}

function clean(s: unknown, max: number): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Reads the model's answer. Returns null when it is not the expected JSON, so the caller can treat
 * "could not tell" differently from "clean". A mark counts only when its kind is `overlay`.
 */
export function parseLogoVerdict(raw: string | null | undefined): LogoVerdict | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    try {
      data = JSON.parse(m[0])
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null
  const obj = data as { marks?: unknown; brandedCard?: unknown }
  if (!Array.isArray(obj.marks)) return null
  const marks: string[] = []
  for (const item of obj.marks) {
    if (!item || typeof item !== 'object') continue
    const m = item as { brand?: unknown; kind?: unknown; where?: unknown }
    if (String(m.kind ?? '').toLowerCase() !== 'overlay') continue
    const brand = clean(m.brand, 40) || 'unknown'
    const where = clean(m.where, 30)
    marks.push(where ? `${brand} (${where})` : brand)
  }
  const card = obj.brandedCard === true
  if (card) marks.push('branded news card')
  return { hasLogo: marks.length > 0, marks }
}

/** `NEWS_COVER_LOGO_CHECK=off` switches the check off; anything else (or nothing) keeps it on. */
export function logoCheckEnabled(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() !== 'off'
}

/** True when OpenAI answered "I could not download that image URL", so the picture can be sent as bytes instead. */
export function isImageDownloadError(status: number, detail: string): boolean {
  return status === 400 && /download|invalid_image_url|image_url|unsupported image|fetch/i.test(detail)
}
