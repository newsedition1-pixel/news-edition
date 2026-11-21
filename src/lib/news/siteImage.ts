/**
 * A publisher's site-wide share image (the og:image of its home page). Pages without a photo of their
 * own usually fall back to this logo card, so a story image that equals it must never become a cover.
 * Only the publisher's own home page is fetched (hosts come from `PUBLISHERS`), once per publisher
 * per server instance.
 */
import { socialImageOf } from './articleText'
import { fetchText } from './feeds'
import { publisherForUrl, type Publisher } from './publishers'

const cache = new Map<string, Promise<string | null>>()

export function publisherSiteImage(publisher: Publisher): Promise<string | null> {
  const cached = cache.get(publisher.key)
  if (cached) return cached
  const host = publisher.hosts[0]
  const job = (async () => {
    if (!host) return null
    const home = `https://${host}/`
    const page = await fetchText(home, 8000)
    if (!page || publisherForUrl(page.finalUrl)?.key !== publisher.key) return null
    return socialImageOf(page.text, page.finalUrl)
  })().catch(() => null)
  cache.set(publisher.key, job)
  return job
}
