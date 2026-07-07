import type { Metadata } from 'next'
import styles from '../static.module.scss'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'NewsEdition Cookie Policy — how we use cookies and similar tracking technologies, including Google Analytics and Google AdSense.',
  alternates: { canonical: '/cookies' },
}

export default function CookiesPage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>Legal</span>
        <h1 className={styles.title}>Cookie Policy</h1>
        <p className={styles.lead}>
          This policy explains what cookies are, which ones we use, and how you can control them.
        </p>
        <p className={styles.updated}>Last updated: May 9, 2026</p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>1. What Are Cookies?</h2>
        <div className={styles.body}>
          <p>
            Cookies are small text files stored on your device by your web browser when you visit
            a website. They allow the site to remember your preferences and actions over a period
            of time so you don&apos;t have to re-enter them each visit.
          </p>
          <p>
            Cookies can be <strong>first-party</strong> (set by NewsEdition directly) or{' '}
            <strong>third-party</strong> (set by services we use, such as Google Analytics and
            Google AdSense).
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>2. Cookies We Use</h2>
        <div className={styles.body}>
          <h3>Essential / Functional Cookies</h3>
          <p>
            These cookies are necessary for the website to function and cannot be switched off.
            They are typically set in response to actions you take such as logging in or setting
            your theme preference.
          </p>
          <ul>
            <li><strong>Session cookie</strong> — keeps you logged in during your visit</li>
            <li><strong>theme</strong> — remembers your light/dark mode preference</li>
          </ul>

          <h3>Analytics Cookies — Google Analytics</h3>
          <p>
            We use Google Analytics to understand how visitors use NewsEdition — which pages are
            most read, how long people spend on the site, and where traffic comes from. This helps
            us improve our content and user experience.
          </p>
          <ul>
            <li><strong>_ga</strong> — distinguishes users; expires after 2 years</li>
            <li><strong>_ga_*</strong> — maintains session state; expires after 2 years</li>
            <li><strong>_gid</strong> — distinguishes users; expires after 24 hours</li>
          </ul>
          <p>
            Google Analytics data is processed by Google and shared with us in anonymised,
            aggregated form. Google may also use this data per its own{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>.
          </p>

          <h3>Advertising Cookies — Google AdSense</h3>
          <p>
            We display advertisements through Google AdSense. Google uses cookies to serve ads
            that are relevant to your interests based on your browsing activity on our site and
            across other websites. These are often called &quot;interest-based&quot; or &quot;personalised&quot;
            advertisements.
          </p>
          <ul>
            <li><strong>IDE</strong> — used by Google DoubleClick to register and report actions after viewing or clicking an ad</li>
            <li><strong>DSID, FLC, AID, TAID</strong> — used to link activity across devices if you are signed in to your Google account</li>
            <li><strong>_gcl_au</strong> — used by Google AdSense for experimenting with ad efficiency</li>
          </ul>
          <p>
            You can opt out of personalised advertising by visiting{' '}
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
              Google Ad Settings
            </a>{' '}
            or the{' '}
            <a href="https://optout.aboutads.info/" target="_blank" rel="noopener noreferrer">
              Digital Advertising Alliance opt-out page
            </a>.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>3. How to Manage Cookies</h2>
        <div className={styles.body}>
          <p>
            You can control cookies through your browser settings. Most browsers allow you to:
          </p>
          <ul>
            <li>View and delete existing cookies</li>
            <li>Block cookies from specific websites</li>
            <li>Block all third-party cookies</li>
            <li>Clear all cookies when you close the browser</li>
          </ul>
          <p>
            Refer to your browser&apos;s help documentation for instructions:
          </p>
          <ul>
            <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Google Chrome</a></li>
            <li><a href="https://support.mozilla.org/en-US/kb/clear-cookies-and-site-data-firefox" target="_blank" rel="noopener noreferrer">Mozilla Firefox</a></li>
            <li><a href="https://support.apple.com/en-in/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer">Apple Safari</a></li>
            <li><a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer">Microsoft Edge</a></li>
          </ul>
          <p>
            Please note that disabling certain cookies may affect the functionality of NewsEdition,
            such as keeping you logged in or remembering your theme preference.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>4. Changes to This Policy</h2>
        <div className={styles.body}>
          <p>
            We may update this Cookie Policy from time to time to reflect changes in the
            technologies or services we use. The &quot;Last updated&quot; date at the top will always
            indicate when the most recent revision was made.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>5. Contact</h2>
        <div className={styles.body}>
          <p>
            Questions about our use of cookies? Email us at{' '}
            <a href="mailto:newsedition1@gmail.com">newsedition1@gmail.com</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
