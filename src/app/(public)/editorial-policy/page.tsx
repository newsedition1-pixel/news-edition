import type { Metadata } from 'next'
import Link from 'next/link'
import styles from '../static.module.scss'
import { siteUrl, pageAlternates } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Editorial Policy',
  description: 'How NewsEdition works: who runs it, what it covers, how authors and dates are shown, how AI tools are used, and how to report errors.',
  alternates: pageAlternates(`${siteUrl}/editorial-policy`),
}

export default function EditorialPolicyPage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>About NewsEdition</span>
        <h1 className={styles.title}>Editorial Policy</h1>
        <p className={styles.lead}>
          What NewsEdition publishes, who stands behind it, how we use AI tools, and how readers can
          tell us when we get something wrong.
        </p>
        <p className={styles.updated}>Last updated: November 20, 2026</p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Who we are</h2>
        <div className={styles.body}>
          <p>
            NewsEdition is an independent Indian digital news platform founded in 2024 by Amit Gautam,
            who owns it and is its Editor-in-Chief. We operate from New Delhi. See the{' '}
            <Link href="/about">About page</Link> for more, and the <Link href="/contact">Contact page</Link>{' '}
            for our address, email and phone number.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>What we cover</h2>
        <div className={styles.body}>
          <p>
            We focus on business and politics, and also report on India, world affairs, entertainment,
            governance, state news and local news from Haryana. All stories are in English.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Authors and dates</h2>
        <div className={styles.body}>
          <p>
            Every article shows the name of its author and the date it was published. Each author has a
            profile page that lists their published work. If an article is edited after publication, the
            article page also shows an &quot;Updated&quot; date.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>How we use AI tools</h2>
        <div className={styles.body}>
          <p>
            Some NewsEdition articles are drafted with the help of AI tools. For these articles the tool is
            given the full text of one to three reports on the same story from established news publishers,
            such as The Hindu, The Indian Express or the BBC, and asked to write an original article in its
            own words using only the facts in those reports. The tool is instructed not to invent quotes,
            statistics or named sources, and the draft is checked by software before it is saved: figures
            and quotations must appear in the reports, and long passages copied from them are rejected.
          </p>
          <p>
            An AI-assisted article that passes all of these checks may be published without a NewsEdition
            editor reading it first. An article that fails a check is not published, and one that mentions
            people or places the reports do not is held back until an editor has read it. If you see a
            mistake in any article, please report it through our Corrections page.
          </p>
          <p>
            Where an official document exists, AI-assisted articles link to it under the article. Cover
            images on these articles are photographs, or are labelled as illustrations; they carry the
            NewsEdition logo. Earlier AI-assisted articles may not follow all of this.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Corrections</h2>
        <div className={styles.body}>
          <p>
            If you find a factual error, please tell us. See our <Link href="/corrections">Corrections page</Link>{' '}
            for how to report it and what we do next. For a complaint about content, see the{' '}
            <Link href="/grievance">Grievance Officer page</Link>.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>News tips and sources</h2>
        <div className={styles.body}>
          <p>
            Readers can send news tips to <a href="mailto:newsedition1@gmail.com">newsedition1@gmail.com</a> with
            as much detail as possible. Sources are treated with confidentiality unless explicitly agreed
            otherwise.
          </p>
        </div>
      </div>
    </div>
  )
}
