import { adsTxtBody, configuredPublisherId } from '@/lib/ads'

// ads.txt for Google AdSense. Served from the env var ADSENSE_PUBLISHER_ID (see lib/ads.ts).
// With no valid ID the file does not exist (404) instead of advertising a made-up seller.
// Same route-with-a-dot pattern as /feed.xml and /news-sitemap.xml.
export const revalidate = 3600

const HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=3600',
}

export async function GET() {
  const publisherId = configuredPublisherId()
  if (!publisherId) {
    return new Response('ads.txt is not configured\n', { status: 404, headers: HEADERS })
  }
  return new Response(adsTxtBody(publisherId), { status: 200, headers: HEADERS })
}
