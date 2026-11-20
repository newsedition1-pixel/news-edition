import 'server-only'
import { getSetting, NEWS_AUDIT_LOG_KEY, setSetting } from '@/lib/settings'
import { addAuditEntry, parseAuditLog, type AuditLogEntry } from './auditLog'

export async function getAuditLog(): Promise<AuditLogEntry[]> {
  return parseAuditLog(await getSetting(NEWS_AUDIT_LOG_KEY))
}

/** Never throws: a failed log write must not undo a publish. */
export async function recordAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await setSetting(NEWS_AUDIT_LOG_KEY, JSON.stringify(addAuditEntry(await getAuditLog(), entry)))
  } catch (err) {
    console.error('Audit log write failed:', err)
  }
}
