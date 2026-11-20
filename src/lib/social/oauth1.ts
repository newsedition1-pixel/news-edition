/**
 * OAuth 1.0a request signing (HMAC-SHA1), which is how X lets a server post as one account with
 * four keys and no browser login. Only the `Authorization` header is built here. Pure and
 * unit-tested against the worked example in X's documentation.
 */
import { createHmac, randomBytes } from 'node:crypto'

/** RFC 3986 percent-encoding, which is stricter than encodeURIComponent. */
export function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

export interface OAuthKeys {
  consumerKey: string
  consumerSecret: string
  token: string
  tokenSecret: string
}

export interface SignInput extends OAuthKeys {
  method: string
  /** The URL without a query string. */
  url: string
  /** Query or form parameters that take part in the signature (a JSON body does not). */
  params?: Record<string, string>
  nonce?: string
  timestamp?: string
}

export function oauthHeader(i: SignInput): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: i.consumerKey,
    oauth_nonce: i.nonce ?? randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: i.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: i.token,
    oauth_version: '1.0',
  }
  const all = { ...(i.params ?? {}), ...oauth }
  const paramString = Object.keys(all)
    .map((k) => [percentEncode(k), percentEncode(all[k])] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const base = [i.method.toUpperCase(), percentEncode(i.url), percentEncode(paramString)].join('&')
  const key = `${percentEncode(i.consumerSecret)}&${percentEncode(i.tokenSecret)}`
  const signature = createHmac('sha1', key).update(base).digest('base64')
  const header = { ...oauth, oauth_signature: signature }
  return 'OAuth ' + Object.keys(header).sort().map((k) => `${percentEncode(k)}="${percentEncode(header[k as keyof typeof header])}"`).join(', ')
}
