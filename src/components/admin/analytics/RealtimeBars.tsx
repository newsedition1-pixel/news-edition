'use client'

import { useState } from 'react'
import styles from './RealtimeBars.module.scss'

interface Props {
  data: { minutesAgo: number; users: number }[]
}

export function RealtimeBars({ data }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.users))
  const active = hover === null ? null : data[hover]

  return (
    <div className={styles.wrap}>
      <div className={styles.bars} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <button
            key={d.minutesAgo}
            type="button"
            className={`${styles.slot} ${hover === i ? styles.active : ''}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${d.users} users, ${d.minutesAgo === 0 ? 'this minute' : `${d.minutesAgo} minutes ago`}`}
          >
            <span className={styles.bar} style={{ height: `${Math.max(6, (d.users / max) * 100)}%` }} />
          </button>
        ))}

        {active && (
          <div
            className={styles.tooltip}
            style={{ left: `${((hover! + 0.5) / data.length) * 100}%` }}
            role="status"
          >
            <strong>{active.users}</strong> users ·{' '}
            {active.minutesAgo === 0 ? 'now' : `${active.minutesAgo} min ago`}
          </div>
        )}
      </div>

      <div className={styles.axis}>
        <span>30 min ago</span>
        <span>now</span>
      </div>
    </div>
  )
}
