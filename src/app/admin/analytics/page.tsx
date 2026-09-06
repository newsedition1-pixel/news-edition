import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { articles } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { requireAdmin } from '@/lib/dal'
import { buildDemoAnalytics, formatCompact, formatDuration, RANGE_DAYS, type Range } from '@/lib/demo-analytics'
import { TrafficChart } from '@/components/admin/analytics/TrafficChart'
import { RealtimeBars } from '@/components/admin/analytics/RealtimeBars'
import styles from './page.module.scss'

export const metadata: Metadata = { title: 'Analytics (Demo)' }

interface Props {
  searchParams: Promise<{ range?: string }>
}

const RANGE_LABELS: Record<Range, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
}

const DEVICE_CLASS = ['d1', 'd2', 'd3'] as const

function isRange(value: string | undefined): value is Range {
  return value === '7d' || value === '30d' || value === '90d'
}

export default async function AnalyticsPage({ searchParams }: Props) {
  await requireAdmin()
  const { range: rangeParam } = await searchParams
  const range: Range = isRange(rangeParam) ? rangeParam : '30d'

  // Real article titles, so the demo reads like this site — the numbers beside
  // them are generated, not measured.
  const recent = await db
    .select({ title: articles.title, slug: articles.slug })
    .from(articles)
    .where(eq(articles.status, 'published'))
    .orderBy(desc(articles.publishedAt))
    .limit(10)

  const seed = recent.length > 0 ? recent : [{ title: 'Publish an article to see it here', slug: '#' }]
  const data = buildDemoAnalytics(range, seed)

  const tiles = [
    { label: 'Users', value: data.totals.users.toLocaleString('en-IN'), delta: data.deltas.users },
    { label: 'Sessions', value: data.totals.sessions.toLocaleString('en-IN'), delta: data.deltas.sessions },
    { label: 'Pageviews', value: data.totals.pageviews.toLocaleString('en-IN'), delta: data.deltas.pageviews },
    { label: 'Avg. engagement', value: formatDuration(data.totals.avgEngagementSec), delta: data.deltas.avgEngagementSec },
  ]

  const maxSource = Math.max(...data.sources.map((s) => s.sessions))
  const maxCountry = Math.max(...data.countries.map((c) => c.sessions))

  return (
    <div className={styles.page}>
      <div className={styles.banner} role="note">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>
          <strong>Demo data.</strong> Every number on this page is generated locally by{' '}
          <code>src/lib/demo-analytics.ts</code>. It is not connected to any analytics provider and does not
          reflect real traffic.
        </span>
      </div>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Analytics</h1>
          <p className={styles.subtitle}>{RANGE_LABELS[range]} · {RANGE_DAYS[range]} days</p>
        </div>
        <div className={styles.ranges} role="group" aria-label="Date range">
          {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
            <Link
              key={r}
              href={`/admin/analytics?range=${r}`}
              className={`${styles.rangeBtn} ${r === range ? styles.rangeActive : ''}`}
              aria-current={r === range ? 'true' : undefined}
            >
              {r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}
            </Link>
          ))}
        </div>
      </div>

      <div className={styles.tiles}>
        {tiles.map((t) => (
          <div key={t.label} className={styles.tile}>
            <div className={styles.tileLabel}>{t.label}</div>
            <div className={styles.tileValue}>{t.value}</div>
            <div className={`${styles.delta} ${t.delta >= 0 ? styles.up : styles.down}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                {t.delta >= 0
                  ? <polyline points="5 15 12 8 19 15" />
                  : <polyline points="5 9 12 16 19 9" />}
              </svg>
              {Math.abs(t.delta)}% <span className={styles.deltaNote}>vs previous {RANGE_DAYS[range]} days</span>
            </div>
          </div>
        ))}
      </div>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Traffic over time</h2>
          <span className={styles.cardMeta}>{formatCompact(data.totals.pageviews)} pageviews total</span>
        </div>
        <div className={styles.cardBody}>
          <TrafficChart days={data.days} />
        </div>
      </section>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Active in the last 30 minutes</h2>
            <span className={styles.live}>
              <span className={styles.liveDot} aria-hidden="true" />
              {data.activeNow} now
            </span>
          </div>
          <div className={styles.cardBody}>
            <RealtimeBars data={data.realtime} />
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Devices</h2>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.stack}>
              {data.devices.map((d, i) => (
                <span
                  key={d.label}
                  className={`${styles.stackSeg} ${styles[DEVICE_CLASS[i]]}`}
                  style={{ width: `${d.share * 100}%` }}
                />
              ))}
            </div>
            <ul className={styles.deviceList}>
              {data.devices.map((d, i) => (
                <li key={d.label} className={styles.deviceItem}>
                  <span className={`${styles.chip} ${styles[DEVICE_CLASS[i]]}`} aria-hidden="true" />
                  <span className={styles.deviceLabel}>{d.label}</span>
                  <span className={styles.deviceValue}>{Math.round(d.share * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Traffic sources</h2>
            <span className={styles.cardMeta}>sessions</span>
          </div>
          <div className={styles.cardBody}>
            <ul className={styles.barList}>
              {data.sources.map((s) => (
                <li key={s.label} className={styles.barRow}>
                  <span className={styles.barLabel}>{s.label}</span>
                  <span className={styles.barTrack}>
                    <span className={styles.barFill} style={{ width: `${(s.sessions / maxSource) * 100}%` }} />
                  </span>
                  <span className={styles.barValue}>{s.sessions.toLocaleString('en-IN')}</span>
                  <span className={styles.barShare}>{Math.round(s.share * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Countries</h2>
            <span className={styles.cardMeta}>sessions</span>
          </div>
          <div className={styles.cardBody}>
            <ul className={styles.barList}>
              {data.countries.map((c) => (
                <li key={c.label} className={styles.barRow}>
                  <span className={styles.barLabel}>{c.label}</span>
                  <span className={styles.barTrack}>
                    <span className={styles.barFill} style={{ width: `${(c.sessions / maxCountry) * 100}%` }} />
                  </span>
                  <span className={styles.barValue}>{c.sessions.toLocaleString('en-IN')}</span>
                  <span className={styles.barShare}>{Math.round(c.share * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Top pages</h2>
          <Link href="/admin/articles" className={styles.cardLink}>All articles</Link>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.rankCol}>#</th>
                <th scope="col">Page</th>
                <th scope="col" className={styles.numCol}>Views</th>
                <th scope="col" className={styles.numCol}>Avg. time</th>
              </tr>
            </thead>
            <tbody>
              {data.topPages.map((p, i) => (
                <tr key={p.path}>
                  <td className={styles.rankCol}>{i + 1}</td>
                  <td>
                    <span className={styles.pageTitle}>{p.title}</span>
                    <span className={styles.pagePath}>{p.path}</span>
                  </td>
                  <td className={styles.numCol}>{p.views.toLocaleString('en-IN')}</td>
                  <td className={styles.numCol}>{formatDuration(p.avgTimeSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
