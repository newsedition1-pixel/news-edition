import type { Metadata } from 'next'
import Link from 'next/link'
import styles from '../static.module.scss'
import { siteUrl, pageAlternates } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Grievance Officer and Complaints',
  description: 'How to send a complaint about content on NewsEdition, who the Grievance Officer is, and how long a reply takes.',
  alternates: pageAlternates(`${siteUrl}/grievance`),
}

export default function GrievancePage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>About NewsEdition</span>
        <h1 className={styles.title}>Grievance Officer and Complaints</h1>
        <p className={styles.lead}>
          If you have a complaint about content published on NewsEdition, you can write to our Grievance
          Officer. This page says who that is, how to reach them and what to expect.
        </p>
        <p className={styles.updated}>Last updated: November 20, 2026</p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Grievance Officer</h2>
        <div className={styles.body}>
          <p>
            <strong>Name:</strong> Amit Gautam, Founder and Editor-in-Chief<br />
            <strong>Email:</strong> <a href="mailto:newsedition1@gmail.com">newsedition1@gmail.com</a><br />
            <strong>Phone:</strong> <a href="tel:+917417794904">+91 74177 94904</a><br />
            <strong>Address:</strong> C-43, Regal Building, Connaught Place, New Delhi — 110001, India
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>What you can complain about</h2>
        <div className={styles.body}>
          <p>
            Any article, image, comment or other content on NewsEdition that you believe is wrong, unlawful,
            defamatory, violates your privacy or infringes your copyright. For a simple factual error in
            an article, the quickest route is our <Link href="/corrections">Corrections page</Link>.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>How to send a complaint</h2>
        <div className={styles.body}>
          <p>Email the Grievance Officer, or write to the address above, and include:</p>
          <ul>
            <li>your name and a way to contact you (email or phone);</li>
            <li>the link to the article or page you are complaining about;</li>
            <li>what you object to, and why;</li>
            <li>what you would like us to do, and any document or link that supports your complaint.</li>
          </ul>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>What happens next</h2>
        <div className={styles.body}>
          <p>
            We will read your complaint, check it against the available information and tell you our
            decision in writing within 15 days of receiving it. If we agree, we will correct, update or
            remove the content and say so. Your details are used only to deal with your complaint; see our{' '}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Related pages</h2>
        <div className={styles.body}>
          <p>
            <Link href="/editorial-policy">Editorial Policy</Link> · <Link href="/corrections">Corrections</Link> ·{' '}
            <Link href="/contact">Contact</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
