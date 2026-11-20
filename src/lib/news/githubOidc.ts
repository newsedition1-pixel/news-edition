/**
 * Checks the OpenID Connect token that GitHub Actions can issue to a workflow run, so the
 * schedule route needs no shared secret: only the NewsEdition repository's own
 * `news-schedule.yml` workflow, on the master branch, is let in.
 *
 * Pure (keys are passed in), so it can be unit-tested with a locally generated key pair.
 */
import { createPublicKey, verify } from 'node:crypto'

export const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com'
export const GITHUB_JWKS_URL = `${GITHUB_ISSUER}/.well-known/jwks`

export interface RsaJwk {
  kty: string
  kid?: string
  n?: string
  e?: string
  alg?: string
  use?: string
}

export interface Jwks {
  keys: RsaJwk[]
}

export interface OidcPolicy {
  /** The `aud` the workflow asked for. */
  audience: string
  /** `owner/repo` */
  repository: string
  /** Full ref of the workflow file, e.g. `owner/repo/.github/workflows/x.yml@refs/heads/master`. */
  workflowRef: string
  /** Branch the run must be on, e.g. `refs/heads/master`. */
  ref: string
  /** Allowed `event_name` values. */
  events: string[]
}

export type OidcResult = { ok: true } | { ok: false; reason: string }

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function parseJson(buf: Buffer): Record<string, unknown> | null {
  try {
    const v = JSON.parse(buf.toString('utf8'))
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** The `kid` of the key a token claims to be signed with, or null if the token is malformed. */
export function tokenKeyId(token: string): string | null {
  const header = parseJson(b64urlToBuffer(token.split('.')[0] ?? ''))
  return header && typeof header.kid === 'string' ? header.kid : null
}

export function verifyGithubOidc(token: string, jwks: Jwks, policy: OidcPolicy, nowMs: number = Date.now()): OidcResult {
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((p) => !p)) return { ok: false, reason: 'not a JWT' }
  const [h, p, sig] = parts

  const header = parseJson(b64urlToBuffer(h))
  if (!header) return { ok: false, reason: 'bad header' }
  if (header.alg !== 'RS256') return { ok: false, reason: 'unsupported algorithm' }
  const jwk = jwks.keys.find((k) => k.kid === header.kid && k.kty === 'RSA')
  if (!jwk) return { ok: false, reason: 'unknown signing key' }

  let valid = false
  try {
    valid = verify('RSA-SHA256', Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: 'jwk' } as Parameters<typeof createPublicKey>[0]), b64urlToBuffer(sig))
  } catch {
    return { ok: false, reason: 'bad key or signature' }
  }
  if (!valid) return { ok: false, reason: 'signature does not match' }

  const c = parseJson(b64urlToBuffer(p))
  if (!c) return { ok: false, reason: 'bad claims' }

  const now = Math.floor(nowMs / 1000)
  if (c.iss !== GITHUB_ISSUER) return { ok: false, reason: 'wrong issuer' }
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud]
  if (!aud.includes(policy.audience)) return { ok: false, reason: 'wrong audience' }
  if (typeof c.exp !== 'number' || c.exp <= now) return { ok: false, reason: 'token expired' }
  if (typeof c.nbf === 'number' && c.nbf > now + 60) return { ok: false, reason: 'token not valid yet' }
  if (c.repository !== policy.repository) return { ok: false, reason: 'wrong repository' }
  if (c.ref !== policy.ref) return { ok: false, reason: 'wrong branch' }
  if (c.job_workflow_ref !== policy.workflowRef) return { ok: false, reason: 'wrong workflow' }
  if (typeof c.event_name !== 'string' || !policy.events.includes(c.event_name)) return { ok: false, reason: 'wrong trigger' }
  return { ok: true }
}
