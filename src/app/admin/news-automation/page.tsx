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
          Pull headlines from Google News, rewrite them with AI, attach an image, and publish.
        </p>
      </div>
      <NewsAutomation defaultWordLength={defaultWordLength} />
    </div>
  )
}
