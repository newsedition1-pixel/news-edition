// Google AdSense identity helpers (pure, no network).
//
// The publisher ID comes from the AdSense account (Account > Account information) and is
// NOT known to the code. It is read from the env var ADSENSE_PUBLISHER_ID. While that var is
// empty or malformed nothing ad-related is emitted: no script, no meta tag, and /ads.txt
// answers 404. This keeps a made-up ID from ever going live.

/** Google's own certification authority ID for ads.txt lines (same for every AdSense publisher). */
export const GOOGLE_ADS_TXT_CERT_ID = 'f08c47fec0942fa0'

const PUB_ID = /^pub-\d{16}$/

/**
 * Accepts what people paste from AdSense: `pub-1234567890123456`, `ca-pub-1234567890123456`,
 * with stray spaces or quotes. Returns the canonical `pub-<16 digits>` or null.
 */
export function normalisePublisherId(raw: string | null | undefined): string | null {
  if (!raw) return null
  let id = raw.trim().replace(/^["']|["']$/g, '').trim().toLowerCase()
  if (id.startsWith('ca-')) id = id.slice(3)
  return PUB_ID.test(id) ? id : null
}

/** The `client` value used in the AdSense script URL and the verification meta tag. */
export function adsenseClient(publisherId: string | null): string | null {
  return publisherId ? `ca-${publisherId}` : null
}

/** URL of the AdSense loader script for a publisher ID. */
export function adsenseScriptSrc(publisherId: string): string {
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(`ca-${publisherId}`)}`
}

/** The one line AdSense asks for in ads.txt, plus a trailing newline. */
export function adsTxtBody(publisherId: string): string {
  return `google.com, ${publisherId}, DIRECT, ${GOOGLE_ADS_TXT_CERT_ID}\n`
}

/** Reads and validates the configured publisher ID (null when AdSense is not set up). */
export function configuredPublisherId(env: Record<string, string | undefined> = process.env): string | null {
  return normalisePublisherId(env.ADSENSE_PUBLISHER_ID)
}
