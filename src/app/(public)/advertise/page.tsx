import type { Metadata } from 'next'
import styles from '../static.module.scss'

export const metadata: Metadata = {
  title: 'Advertise With Us',
  description: 'Advertise on NewsEdition: banner ads, sponsored articles and category sponsorships next to daily India, world, business and Haryana news. Email us for rates and current audience figures.',
  alternates: { canonical: '/advertise' },
}

// No audience size, reader profile or price claims here on purpose: none of them is backed by
// published numbers. Add them only together with the source (analytics export, date range).
const PERKS = [
  {
    icon: '📰',
    title: 'Daily News Coverage',
    desc: 'NewsEdition publishes India, world, politics, business, entertainment and Haryana news through the day, so your message sits next to fresh, relevant reading.',
  },
  {
    icon: '🤝',
    title: 'Simple Terms',
    desc: 'Tell us what you need and we reply with formats and rates. There is no minimum spend.',
  },
  {
    icon: '📊',
    title: 'Real Numbers On Request',
    desc: 'Ask us for current audience figures from our own analytics before you decide, instead of relying on rounded-up claims.',
  },
]

export default function AdvertisePage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>Advertise</span>
        <h1 className={styles.title}>Put Your Brand Next to the News</h1>
        <p className={styles.lead}>
          NewsEdition is an Indian digital news site covering business, politics, world affairs,
          entertainment and Haryana. If you want your brand beside that coverage, write to us.
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
            Email us with your requirements, whether it&apos;s a banner ad, a sponsored article, a
            category sponsorship, or something custom, and we&apos;ll get back to you with options
            and pricing.
          </p>
          <p>
            We work with businesses of all sizes, from local startups to established enterprises.
          </p>
        </div>
      </div>

      <div className={styles.ctaBox}>
        <div className={styles.ctaTitle}>Ready to Advertise?</div>
        <p className={styles.ctaDesc}>
          Drop us an email and we&apos;ll respond within 24 hours with available options and rates.
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
