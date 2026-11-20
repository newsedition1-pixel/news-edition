import { auditTotals, type AuditLogEntry } from '@/lib/news/auditLog'
import styles from './ScheduleCard.module.scss'

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
}

/** What the pre-publication audit found in the last articles. */
export function AuditCard({ log, mode }: { log: AuditLogEntry[]; mode: string }) {
  const totals = auditTotals(log)
  const recent = log.slice(0, 10)
  return (
    <section className={styles.card} aria-label="Pre-publication audit">
      <div className={styles.head}>
        <h2 className={styles.title}>Pre-publication audit</h2>
      </div>
      <p className={styles.note}>
        Every AI article is checked before it goes live: facts against the publisher reports, copying, writing style, SEO, Google Discover, trust signals and grammar.
        A draft that fails is rewritten once; if it still fails it is saved as a draft with the reason. Mode: <strong>{mode}</strong>
        {mode === 'log' ? ' (results are recorded, nothing is blocked)' : mode === 'off' ? ' (no audit)' : ''}.
        Set NEWS_AUDIT_MODE to enforce, log or off in Vercel. Facts are compared with the reports only, and the AI-style level is a writing indicator, not proof of who wrote the text.
      </p>
      {log.length === 0 ? (
        <p className={styles.note}>No audit recorded yet. The next scheduled article will appear here.</p>
      ) : (
        <>
          <p className={styles.note}>
            Last {log.length}: {totals.publish} publish, {totals.improve} improve, {totals.hold} hold. Average score {totals.averageScore}/100.
          </p>
          <table className={styles.table}>
            <thead>
              <tr><th>Article</th><th>Score</th><th>Decision</th><th>AI style</th><th>Copy risk</th><th>Discover</th><th>When</th></tr>
            </thead>
            <tbody>
              {recent.map((e) => (
                <tr key={e.slug}>
                  <td>
                    <a href={e.published ? `/article/${e.slug}` : `/admin/articles`}>{e.title.length > 60 ? `${e.title.slice(0, 57)}…` : e.title}</a>
                    {e.held && <div className={styles.error}>{e.held}</div>}
                  </td>
                  <td>{e.summary.score}</td>
                  <td className={e.summary.decision === 'PUBLISH' ? styles.ok : e.summary.decision === 'HOLD' ? styles.missing : undefined}>{e.summary.decision}{e.attempts > 1 ? ' (after rewrite)' : ''}</td>
                  <td>{e.summary.aiStyle}</td>
                  <td>{e.summary.plagiarism}</td>
                  <td>{e.summary.discover}</td>
                  <td>{formatWhen(e.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
