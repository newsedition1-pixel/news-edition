import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/dal'
import { getNewsWordLength } from '@/lib/settings'
import { NewsAutomation } from './NewsAutomation'
import styles from './page.module.scss'

export const metadata: Metadata = { title: 'News Automation' }

export default async function NewsAutomationPage() {
  await requireAdmin()
  const defaultWordLength = await getNewsWordLength()
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>News Automation</h1>
        <p className={styles.subtitle}>
          Finds the stories several trusted publishers are carrying right now, rewrites them from the full reports (600+ words, with internal and external links, FAQs, tags and a licensed cover image) and saves each as a draft for review.
        </p>
      </div>
      <NewsAutomation defaultWordLength={defaultWordLength} />
    </div>
  )
}
