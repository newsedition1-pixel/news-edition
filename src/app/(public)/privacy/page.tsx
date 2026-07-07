import type { Metadata } from 'next'
import styles from '../static.module.scss'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'NewsEdition Privacy Policy — how we collect, use, and protect your personal information.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>Legal</span>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.lead}>
          Your privacy is important to us. This policy explains what information we collect, how
          we use it, and the choices you have.
        </p>
        <p className={styles.updated}>Last updated: May 9, 2026 &nbsp;·&nbsp; Governing law: India</p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>1. Who We Are</h2>
        <div className={styles.body}>
          <p>
            NewsEdition (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is an independent digital news platform
            operated from New Delhi, India. Our website is{' '}
            <a href="https://newsedition.in" target="_blank" rel="noopener noreferrer">newsedition.in</a>.
            For privacy-related queries, contact us at{' '}
            <a href="mailto:newsedition1@gmail.com">newsedition1@gmail.com</a>.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>2. Information We Collect</h2>
        <div className={styles.body}>
          <h3>Account Information</h3>
          <p>
            If you create an account or sign in via Google, we collect your name, email address,
            and profile picture. This is used solely to manage your account and enable features
            such as commenting.
          </p>
          <h3>Comments</h3>
          <p>
            When you leave a comment, we collect your name, email address, and the content of your
            comment. Guest commenters&apos; email addresses are not displayed publicly.
          </p>
          <h3>Usage Data</h3>
          <p>
            We automatically collect information about how you interact with our website — pages
            visited, time spent, browser type, device type, and approximate geographic location
            (country/city level). This data is collected via Google Analytics and is used in
            aggregated, anonymised form to improve our content and user experience.
          </p>
          <h3>Cookies and Advertising Data</h3>
          <p>
            We use cookies and similar tracking technologies for analytics and advertising purposes.
            See our <a href="/cookies">Cookie Policy</a> for full details.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>3. How We Use Your Information</h2>
        <div className={styles.body}>
          <ul>
            <li>To operate and improve the NewsEdition platform</li>
            <li>To authenticate your account and maintain your session</li>
            <li>To moderate and display comments</li>
            <li>To analyse site traffic and reader behaviour in aggregate (via Google Analytics)</li>
            <li>To serve relevant advertisements (via Google AdSense)</li>
            <li>To respond to your enquiries or feedback</li>
            <li>To send important service emails (e.g., email verification) — we do not send marketing emails</li>
          </ul>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>4. Third-Party Services</h2>
        <div className={styles.body}>
          <h3>Google Analytics</h3>
          <p>
            We use Google Analytics to understand how readers use our site. Google Analytics sets
            cookies and collects data such as page views, session duration, and traffic sources.
            This data is processed by Google and shared with us in anonymised, aggregated reports.
            Google may use this data in accordance with its own{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>. You can opt out by installing the{' '}
            <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">
              Google Analytics Opt-out Browser Add-on
            </a>.
          </p>
          <h3>Google AdSense</h3>
          <p>
            We display advertisements served by Google AdSense. Google uses cookies to serve ads
            based on your prior visits to our site and other sites on the internet. You can opt
            out of personalised advertising by visiting{' '}
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
              Google Ad Settings
            </a>.
          </p>
          <h3>Cloudinary</h3>
          <p>
            Images uploaded to our platform are stored and served via Cloudinary, a cloud media
            management service. Cloudinary processes images on our behalf and does not use them
            for any other purpose.
          </p>
          <h3>Google OAuth</h3>
          <p>
            If you choose to sign in with Google, Google shares your name, email, and profile
            picture with us. We do not receive your Google password. Google&apos;s data sharing is
            governed by their Privacy Policy.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>5. Data Retention</h2>
        <div className={styles.body}>
          <p>
            Account data is retained for as long as your account is active. If you request account
            deletion, we will remove your personal data within 30 days, except where retention is
            required by law. Comments are retained as part of the article record; guest commenter
            email addresses are not shown publicly.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>6. Your Rights</h2>
        <div className={styles.body}>
          <p>Under applicable Indian law, including the Information Technology Act, 2000, you have the right to:</p>
          <ul>
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your account and associated data</li>
            <li>Withdraw consent for optional data processing at any time</li>
          </ul>
          <p>
            To exercise any of these rights, email us at{' '}
            <a href="mailto:newsedition1@gmail.com">newsedition1@gmail.com</a>.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>7. Security</h2>
        <div className={styles.body}>
          <p>
            We implement reasonable technical and organisational measures to protect your personal
            data against unauthorised access, alteration, or disclosure. Passwords are hashed and
            never stored in plain text. Connections to our site are encrypted via HTTPS.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>8. Children&apos;s Privacy</h2>
        <div className={styles.body}>
          <p>
            NewsEdition is not directed at children under the age of 13. We do not knowingly
            collect personal data from children. If you believe a child has provided us with
            personal data, please contact us and we will delete it promptly.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>9. Changes to This Policy</h2>
        <div className={styles.body}>
          <p>
            We may update this Privacy Policy from time to time. Material changes will be noted
            with an updated &quot;Last updated&quot; date at the top of this page. Your continued use of
            NewsEdition after any changes constitutes acceptance of the revised policy.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>10. Contact</h2>
        <div className={styles.body}>
          <p>
            For any questions, requests, or concerns about this Privacy Policy or your personal
            data, please contact us at:{' '}
            <a href="mailto:newsedition1@gmail.com">newsedition1@gmail.com</a>
            <br />
            C-43, Regal Building, Connaught Place, New Delhi — 110001, India.
          </p>
        </div>
      </div>
    </div>
  )
}
