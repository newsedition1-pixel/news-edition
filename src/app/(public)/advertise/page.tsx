import type { Metadata } from 'next'
import styles from '../static.module.scss'

export const metadata: Metadata = {
  title: 'Advertise With Us',
  description: 'Reach thousands of engaged readers across India. Advertise on NewsEdition at very competitive rates. Contact us to get started.',
  alternates: { canonical: '/advertise' },
}

const PERKS = [
  {
    icon: '📈',
    title: 'Growing Audience',
    desc: 'Reach thousands of engaged readers interested in business, politics, and current affairs across India.',
  },
  {
    icon: '💰',
    title: 'Competitive Pricing',
    desc: 'We offer very affordable advertising rates. Quality reach without breaking your budget.',
  },
  {
    icon: '🎯',
    title: 'Targeted Reach',
    desc: 'Our readers are decision-makers, professionals, and news-aware citizens — a high-value audience for your brand.',
  },
]

export default function AdvertisePage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>Advertise</span>
        <h1 className={styles.title}>Put Your Brand in Front of the Right Audience</h1>
        <p className={styles.lead}>
          NewsEdition connects your brand with thousands of engaged readers across India who care about
          business, politics, and the news that drives decisions. We keep it simple and affordable.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Why Advertise With Us</h2>
        <div className={styles.perksGrid}>
          {PERKS.map(p => (
            <div key={p.title} className={styles.perkCard}>
              <div className={styles.perkIcon}>{p.icon}</div>
              <div className={styles.perkTitle}>{p.title}</div>
              <p className={styles.perkDesc}>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>How to Get Started</h2>
        <div className={styles.body}>
          <p>
            Getting your brand on NewsEdition is easy. Simply email us with your requirements —
            whether it&apos;s a banner ad, a sponsored article, a category sponsorship, or something
            custom — and we&apos;ll get back to you with options and pricing.
          </p>
          <p>
            We work with businesses of all sizes, from local startups to established enterprises.
            There&apos;s no minimum spend and no complicated process.
          </p>
        </div>
      </div>

      <div className={styles.ctaBox}>
        <div className={styles.ctaTitle}>Ready to Advertise?</div>
        <p className={styles.ctaDesc}>
          Drop us an email and we&apos;ll respond within 24 hours with available options and our very
          competitive rates.
        </p>
        <a href="mailto:newsedition1@gmail.com" className={styles.ctaBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
          </svg>
          newsedition1@gmail.com
        </a>
      </div>
    </div>
  )
}
