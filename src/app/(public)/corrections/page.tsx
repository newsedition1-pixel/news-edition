import type { Metadata } from 'next'
import Link from 'next/link'
import styles from '../static.module.scss'
import { siteUrl, pageAlternates } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Corrections Policy',
  description: 'Found an error on NewsEdition? Here is how to report a factual mistake and how corrections are shown on the article.',
  alternates: pageAlternates(`${siteUrl}/corrections`),
}

export default function CorrectionsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>About NewsEdition</span>
        <h1 className={styles.title}>Corrections Policy</h1>
        <p className={styles.lead}>
          We are committed to updating and correcting our content promptly. If you spot a factual error in
          any NewsEdition article, please let us know.
        </p>
        <p className={styles.updated}>Last updated: November 20, 2026</p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>How to report an error</h2>
        <div className={styles.body}>
          <p>
            Email <a href="mailto:newsedition1@gmail.com">newsedition1@gmail.com</a> with the link to the
            article and the correction you suggest. Please say what is wrong and, if you can, include a
            source that shows the correct information. You can also use the details on our{' '}
            <Link href="/contact">Contact page</Link>.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>What happens next</h2>
        <div className={styles.body}>
          <p>
            We check the report against the available information. When we confirm a factual error, we
            correct the article. An article that is edited after publication shows an &quot;Updated&quot; date next
            to its publication date.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Articles written with AI tools</h2>
        <div className={styles.body}>
          <p>
            Some articles are drafted with AI tools. The same process applies to them. Read more in our{' '}
            <Link href="/editorial-policy">Editorial Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
