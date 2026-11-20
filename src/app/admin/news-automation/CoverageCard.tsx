import type { CoverageRow } from '@/lib/news/coverage'
import styles from './ScheduleCard.module.scss'

function formatWhen(iso: string | null): string {
  if (!iso) return 'never'
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
}

/** One line per category: did it get an article in the last 24 hours? */
export function CoverageCard({ rows }: { rows: CoverageRow[] }) {
  const empty = rows.filter((r) => r.last24h === 0)
  return (
    <section className={styles.card} aria-label="Daily coverage per category">
      <div className={styles.head}>
        <h2 className={styles.title}>Every category, every day</h2>
      </div>
      <p className={styles.note}>
        A category with no article in the last 24 hours is tried first in the next run, and may then take a story that fits it as its second-best match.
        If the trusted publishers carry no fresh story for it, it stays empty until one appears.
      </p>
      <table className={styles.table}>
        <thead>
          <tr><th>Category</th><th>Last 24 h</th><th>Last article</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug}>
              <td>{r.name ?? r.slug}{!r.active ? ' (inactive)' : ''}</td>
              <td className={r.last24h === 0 ? styles.missing : styles.ok}>{r.last24h}</td>
              <td>{formatWhen(r.lastPublishedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {empty.length > 0 && <p className={styles.error}>No article in the last 24 hours: {empty.map((r) => r.name ?? r.slug).join(', ')}.</p>}
    </section>
  )
}
