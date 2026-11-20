import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/dal'
import { getNewsAutoPublish, getNewsWordLength } from '@/lib/settings'
import { getScheduleStatus } from '@/lib/news/scheduler'
import { NewsAutomation } from './NewsAutomation'
import { ScheduleCard } from './ScheduleCard'
import { SocialCard } from './SocialCard'
import { CoverageCard } from './CoverageCard'
import { getCoverageStatus } from '@/lib/news/coverage'
import { getSocialStatus } from '@/lib/social/share'
import styles from './page.module.scss'

export const metadata: Metadata = { title: 'News Automation' }

export default async function NewsAutomationPage() {
  await requireAdmin()
  const [defaultWordLength, defaultAutoPublish, schedule, social, coverage] = await Promise.all([getNewsWordLength(), getNewsAutoPublish(), getScheduleStatus(), getSocialStatus(), getCoverageStatus()])
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>News Automation</h1>
        <p className={styles.subtitle}>
          Finds the stories several trusted publishers are carrying right now, rewrites them from the full reports (600+ words, with internal and external links, FAQs, tags and a cover image with the NewsEdition logo) and saves each one that passes every check, published or as a draft as you choose below.
        </p>
      </div>
      <ScheduleCard initial={schedule} />
      <CoverageCard rows={coverage} />
      <SocialCard initial={social} />
      <NewsAutomation defaultWordLength={defaultWordLength} defaultAutoPublish={defaultAutoPublish} />
    </div>
  )
}
