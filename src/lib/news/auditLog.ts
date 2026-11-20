/**
 * The record of recent audits, kept as JSON in one settings row (no database change needed), so the
 * admin can see what the audit found and why an article was held. Pure and unit-tested.
 */
import type { AuditSummary } from './audit'

export const AUDIT_LOG_MAX = 60

export interface AuditLogEntry {
  at: string
  title: string
  slug: string
  mode: 'enforce' | 'log'
  attempts: number
  published: boolean
  /** Why the article was saved as a draft, when it was. */
  held: string | null
  summary: AuditSummary
}

export function parseAuditLog(raw: string | null): AuditLogEntry[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    return v.filter((e): e is AuditLogEntry => !!e && typeof e === 'object' && typeof (e as AuditLogEntry).at === 'string' && typeof (e as AuditLogEntry).slug === 'string' && !!(e as AuditLogEntry).summary)
  } catch {
    return []
  }
}

/** Newest first, one entry per article, capped. */
export function addAuditEntry(log: AuditLogEntry[], entry: AuditLogEntry, max = AUDIT_LOG_MAX): AuditLogEntry[] {
  return [entry, ...log.filter((e) => e.slug !== entry.slug)].slice(0, max)
}

/** Counts for the admin card: how the last audits ended. */
export function auditTotals(log: AuditLogEntry[]): { publish: number; improve: number; hold: number; averageScore: number | null } {
  const t = { publish: 0, improve: 0, hold: 0 }
  for (const e of log) {
    if (e.summary.decision === 'PUBLISH') t.publish++
    else if (e.summary.decision === 'IMPROVE') t.improve++
    else t.hold++
  }
  const averageScore = log.length ? Math.round(log.reduce((n, e) => n + e.summary.score, 0) / log.length) : null
  return { ...t, averageScore }
}
