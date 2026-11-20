/**
 * Shared-secret check for the cron route, so an outside cron service (cron-job.org and similar) can
 * call it when GitHub's own timer is late. The secret lives in the CRON_SECRET environment variable;
 * with no variable (or a short one) this path is closed. Pure and unit-tested.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

export const MIN_CRON_SECRET_LENGTH = 32

/** The token of an `Authorization: Bearer <token>` header, or ''. */
export function bearerToken(header: string | null | undefined): string {
  const h = (header ?? '').trim()
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : ''
}

/** Constant-time comparison of the presented token with the configured secret. */
export function secretMatches(token: string, secret: string | undefined): boolean {
  if (!token || !secret || secret.length < MIN_CRON_SECRET_LENGTH) return false
  const a = createHash('sha256').update(token).digest()
  const b = createHash('sha256').update(secret).digest()
  return timingSafeEqual(a, b)
}
