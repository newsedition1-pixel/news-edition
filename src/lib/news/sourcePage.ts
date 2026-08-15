import 'server-only'

export interface SourcePageInfo {
  imageUrl: string | null
  /** og:description / meta description — extra grounding for the AI rewrite. */
  description: string | null
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

/**
 * Best-effort fetch of the underlying publisher page to pull an og:image and a
 * longer description. Google News RSS links are redirect/encoded URLs, so this
 * is unreliable by nature — every failure path returns nulls and the caller
 * falls back to AI image generation and the RSS snippet.
 */
export async function fetchSourcePage(url: string): Promise<SourcePageInfo> {
  const empty: SourcePageInfo = { imageUrl: null, description: null }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
    })
    if (!res.ok) return empty
    const finalUrl = res.url
    // Only read the head-ish portion; meta tags live near the top.
    const html = (await res.text()).slice(0, 200_000)

    let imageUrl = metaContent(html, [
      /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    ])

    // Resolve protocol-relative / root-relative image URLs against the page.
    if (imageUrl) {
      try {
        imageUrl = new URL(imageUrl, finalUrl).toString()
      } catch {
        imageUrl = null
      }
      if (imageUrl && !/^https?:\/\//i.test(imageUrl)) imageUrl = null
    }

    const description = metaContent(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ])

    return { imageUrl, description: description ? description.slice(0, 600) : null }
  } catch {
    return empty
  } finally {
    clearTimeout(timer)
  }
}
