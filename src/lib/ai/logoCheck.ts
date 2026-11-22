import 'server-only'
import { isPublicHttpsUrl } from '@/lib/news/images'
import { buildLogoSystemPrompt, buildLogoUserText, isImageDownloadError, parseLogoVerdict, type LogoVerdict } from './logoPrompt'
import { isReasoningModel } from './openai'

const LOGO_MODEL = process.env.OPENAI_LOGO_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini'
const TIMEOUT_MS = 40_000
const DOWNLOAD_TIMEOUT_MS = 10_000
/** OpenAI takes images up to 20 MB; a news photo is far smaller, and base64 adds a third. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const UA = 'Mozilla/5.0 (compatible; NewsEditionBot/1.0; +https://newsedition.in)'

type Ask = { ok: true; verdict: LogoVerdict } | { ok: false; download: boolean; retry: boolean; reason: string }

async function ask(imageRef: string, key: string): Promise<Ask> {
  const params = isReasoningModel(LOGO_MODEL) ? { max_completion_tokens: 3000, reasoning_effort: 'low' } : { temperature: 0, max_tokens: 300 }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: LOGO_MODEL,
        messages: [
          { role: 'system', content: buildLogoSystemPrompt() },
          {
            role: 'user',
            content: [
              { type: 'text', text: buildLogoUserText() },
              // "high" so a small corner logo is still readable.
              { type: 'image_url', image_url: { url: imageRef, detail: 'high' } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        ...params,
      }),
    })
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300)
      return { ok: false, download: isImageDownloadError(res.status, detail), retry: res.status === 429 || res.status >= 500, reason: `OpenAI ${res.status}` }
    }
    const data = await res.json()
    const verdict = parseLogoVerdict(data.choices?.[0]?.message?.content)
    return verdict ? { ok: true, verdict } : { ok: false, download: false, retry: false, reason: 'unreadable answer' }
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return { ok: false, download: false, retry: !aborted, reason: aborted ? 'timeout' : 'network error' }
  } finally {
    clearTimeout(timer)
  }
}

/** Downloads the picture on this server and returns it as a data URI, or null (blocked, too big, not a photo). */
async function downloadAsDataUri(url: string): Promise<string | null> {
  if (!isPublicHttpsUrl(url)) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.1' },
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
    })
    if (!res.ok || !isPublicHttpsUrl(res.url || url)) return null
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return null
    const declared = Number(res.headers.get('content-length') || 0)
    if (declared > MAX_IMAGE_BYTES) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null
    return `data:${type};base64,${bytes.toString('base64')}`
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Looks at a picture and says whether a media brand's logo, watermark or credit stamp is printed on it.
 * Returns null when it could not tell (no key, model error, picture unreachable, unreadable answer); the
 * caller must then NOT use the picture, because "could not check" is not "clean".
 *
 * The URL goes to OpenAI first. If OpenAI cannot download it (some publisher CDNs refuse it), the
 * picture is downloaded here, with the https/public-host guard, and sent as bytes instead.
 */
export async function checkImageForBrandLogo(imageUrl: string): Promise<(LogoVerdict & { via: 'url' | 'bytes' }) | { error: string }> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { error: 'OPENAI_API_KEY is not set' }

  let first = await ask(imageUrl, key)
  if (!first.ok && first.retry) {
    await new Promise((r) => setTimeout(r, 1500))
    first = await ask(imageUrl, key)
  }
  if (first.ok) return { ...first.verdict, via: 'url' }
  if (!first.download) return { error: first.reason }

  const dataUri = await downloadAsDataUri(imageUrl)
  if (!dataUri) return { error: 'picture could not be downloaded to check it' }
  const second = await ask(dataUri, key)
  return second.ok ? { ...second.verdict, via: 'bytes' } : { error: second.reason }
}
