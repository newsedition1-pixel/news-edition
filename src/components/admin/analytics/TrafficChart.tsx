'use client'

import { useMemo, useRef, useState } from 'react'
import type { DayPoint } from '@/lib/demo-analytics'
import { formatCompact } from '@/lib/demo-analytics'
import styles from './TrafficChart.module.scss'

interface Props {
  days: DayPoint[]
}

const VIEW_W = 760
const VIEW_H = 280
const PAD = { top: 16, right: 18, bottom: 30, left: 46 }

const PLOT_W = VIEW_W - PAD.left - PAD.right
const PLOT_H = VIEW_H - PAD.top - PAD.bottom

/** Rounds a max value up to a readable axis ceiling. */
function niceCeiling(value: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  const steps = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]
  for (const s of steps) {
    if (value <= s * magnitude) return s * magnitude
  }
  return 10 * magnitude
}

export function TrafficChart({ days }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const { max, xs, pvLine, pvArea, userLine, ticks, xLabels } = useMemo(() => {
    const max = niceCeiling(Math.max(...days.map((d) => d.pageviews)))
    const x = (i: number) => PAD.left + (days.length === 1 ? PLOT_W / 2 : (i / (days.length - 1)) * PLOT_W)
    const y = (v: number) => PAD.top + PLOT_H - (v / max) * PLOT_H

    const xs = days.map((_, i) => x(i))
    const pvLine = days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(d.pageviews).toFixed(2)}`).join(' ')
    const pvArea = `${pvLine} L${x(days.length - 1).toFixed(2)},${(PAD.top + PLOT_H).toFixed(2)} L${x(0).toFixed(2)},${(PAD.top + PLOT_H).toFixed(2)} Z`
    const userLine = days.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(d.users).toFixed(2)}`).join(' ')

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ value: max * f, y: y(max * f) }))

    // ~6 evenly spaced date labels, always including the first and last day.
    const every = Math.max(1, Math.ceil(days.length / 6))
    const xLabels = days
      .map((d, i) => ({ label: d.label, x: x(i), i }))
      .filter(({ i }) => i % every === 0 || i === days.length - 1)

    return { max, xs, pvLine, pvArea, userLine, ticks, xLabels }
  }, [days])

  const yFor = (v: number) => PAD.top + PLOT_H - (v / max) * PLOT_H

  function indexFromClientX(clientX: number): number {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const scale = rect.width / VIEW_W
    const localX = (clientX - rect.left) / scale
    const ratio = (localX - PAD.left) / PLOT_W
    return Math.min(days.length - 1, Math.max(0, Math.round(ratio * (days.length - 1))))
  }

  const active = hover === null ? null : days[hover]
  const tooltipLeft = hover === null ? 0 : (xs[hover] / VIEW_W) * 100
  const flip = tooltipLeft > 62

  return (
    <div className={styles.wrap}>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.s1}`} aria-hidden="true" />
          Pageviews
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.s2}`} aria-hidden="true" />
          Users
        </span>
      </div>

      <div className={styles.plot}>
        <svg
          ref={svgRef}
          className={styles.svg}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={`Pageviews and users over the last ${days.length} days`}
          tabIndex={0}
          onMouseMove={(e) => setHover(indexFromClientX(e.clientX))}
          onMouseLeave={() => setHover(null)}
          onTouchStart={(e) => setHover(indexFromClientX(e.touches[0].clientX))}
          onTouchMove={(e) => setHover(indexFromClientX(e.touches[0].clientX))}
          onFocus={() => setHover((h) => h ?? days.length - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((h) => Math.max(0, (h ?? days.length - 1) - 1)) }
            if (e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => Math.min(days.length - 1, (h ?? 0) + 1)) }
            if (e.key === 'Escape') setHover(null)
          }}
        >
          <defs>
            <linearGradient id="pvFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className={styles.fillTop} />
              <stop offset="100%" className={styles.fillBottom} />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t.value}>
              <line className={styles.grid} x1={PAD.left} y1={t.y} x2={VIEW_W - PAD.right} y2={t.y} />
              <text className={styles.axisText} x={PAD.left - 10} y={t.y + 4} textAnchor="end">
                {formatCompact(Math.round(t.value))}
              </text>
            </g>
          ))}

          {xLabels.map((t) => (
            <text key={t.i} className={styles.axisText} x={t.x} y={VIEW_H - 10} textAnchor="middle">
              {t.label}
            </text>
          ))}

          <path d={pvArea} fill="url(#pvFill)" />
          <path className={styles.line1} d={pvLine} />
          <path className={styles.line2} d={userLine} />

          {hover !== null && active && (
            <g>
              <line className={styles.crosshair} x1={xs[hover]} y1={PAD.top} x2={xs[hover]} y2={PAD.top + PLOT_H} />
              <circle className={styles.dot1} cx={xs[hover]} cy={yFor(active.pageviews)} r="5" />
              <circle className={styles.dot2} cx={xs[hover]} cy={yFor(active.users)} r="5" />
            </g>
          )}
        </svg>

        {hover !== null && active && (
          <div
            className={`${styles.tooltip} ${flip ? styles.flip : ''}`}
            style={{ left: `${tooltipLeft}%` }}
            role="status"
          >
            <div className={styles.tipDate}>{active.label}</div>
            <div className={styles.tipRow}>
              <span className={`${styles.swatch} ${styles.s1}`} aria-hidden="true" />
              <span className={styles.tipLabel}>Pageviews</span>
              <span className={styles.tipValue}>{active.pageviews.toLocaleString('en-IN')}</span>
            </div>
            <div className={styles.tipRow}>
              <span className={`${styles.swatch} ${styles.s2}`} aria-hidden="true" />
              <span className={styles.tipLabel}>Users</span>
              <span className={styles.tipValue}>{active.users.toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
