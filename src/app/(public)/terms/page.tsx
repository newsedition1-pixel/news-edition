import type { Metadata } from 'next'
import styles from '../static.module.scss'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'NewsEdition Terms of Service — the rules governing your use of our platform.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>Legal</span>
        <h1 className={styles.title}>Terms of Service</h1>
        <p className={styles.lead}>
          By accessing or using NewsEdition, you agree to be bound by these terms. Please read
          them carefully.
        </p>
        <p className={styles.updated}>Last updated: May 9, 2026 &nbsp;·&nbsp; Governing law: India</p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>1. Acceptance of Terms</h2>
        <div className={styles.body}>
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your use of the NewsEdition website located
            at <a href="https://newsedition.in">newsedition.in</a> and all related services operated
            by NewsEdition (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;). By accessing or using our platform, you
            confirm that you are at least 13 years old and agree to these Terms. If you do not
            agree, please do not use our platform.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>2. Use of the Platform</h2>
        <div className={styles.body}>
          <p>You agree to use NewsEdition only for lawful purposes. You must not:</p>
          <ul>
            <li>Post, share, or transmit content that is false, defamatory, abusive, obscene, or illegal</li>
            <li>Impersonate any person or entity, including NewsEdition staff</li>
            <li>Attempt to gain unauthorised access to any part of the platform</li>
            <li>Use automated tools (bots, scrapers) to collect content without our written permission</li>
            <li>Distribute spam or unsolicited communications through our platform</li>
            <li>Engage in any activity that disrupts or interferes with our services</li>
          </ul>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>3. Intellectual Property</h2>
        <div className={styles.body}>
          <p>
            All content published on NewsEdition — including articles, photographs, graphics, and
            video — is the property of NewsEdition or its licensors and is protected under Indian
            copyright law and applicable international treaties.
          </p>
          <p>
            You may share links to our articles and quote brief excerpts (up to 50 words) with
            clear attribution and a link back to the original article. Reproducing full articles,
            republishing our content, or using our content commercially without explicit written
            permission is prohibited.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>4. User-Submitted Content</h2>
        <div className={styles.body}>
          <p>
            When you submit a comment or any other content to NewsEdition, you grant us a
            non-exclusive, royalty-free, worldwide licence to display, reproduce, and moderate
            that content on our platform.
          </p>
          <p>
            You are solely responsible for the content you submit. We reserve the right to remove
            any content that violates these Terms, applicable law, or our editorial standards,
            without notice.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>5. Editorial Independence</h2>
        <div className={styles.body}>
          <p>
            NewsEdition&apos;s editorial team operates independently. Advertisers, sponsors, and
            commercial partners have no influence over our editorial content. Sponsored content,
            where it appears, is clearly labelled as such.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>6. Accuracy and Disclaimers</h2>
        <div className={styles.body}>
          <p>
            We strive for accuracy in all our reporting. However, news is dynamic and errors can
            occur. We correct factual errors as quickly as possible after they are brought to our
            attention. NewsEdition is not liable for any loss or damage arising from your reliance
            on information published on our platform.
          </p>
          <p>
            Opinions and analysis published on NewsEdition represent the views of the individual
            authors and do not necessarily reflect the views of NewsEdition as an organisation.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>7. Third-Party Links</h2>
        <div className={styles.body}>
          <p>
            Our articles may contain links to third-party websites. These links are provided for
            your convenience and reference only. We are not responsible for the content, privacy
            practices, or availability of third-party sites. Visiting external links is at your
            own risk.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>8. Limitation of Liability</h2>
        <div className={styles.body}>
          <p>
            To the fullest extent permitted by applicable Indian law, NewsEdition and its team
            shall not be liable for any indirect, incidental, special, consequential, or punitive
            damages arising out of or relating to your use of the platform.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>9. Termination</h2>
        <div className={styles.body}>
          <p>
            We reserve the right to suspend or terminate your account and access to NewsEdition at
            any time and without notice if we reasonably believe you have violated these Terms.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>10. Changes to These Terms</h2>
        <div className={styles.body}>
          <p>
            We may update these Terms from time to time. Continued use of NewsEdition after changes
            are posted constitutes acceptance of the revised Terms. Significant changes will be
            noted with an updated &quot;Last updated&quot; date.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>11. Governing Law and Jurisdiction</h2>
        <div className={styles.body}>
          <p>
            These Terms are governed by and construed in accordance with the laws of India,
            including the Information Technology Act, 2000. Any disputes arising under these
            Terms shall be subject to the exclusive jurisdiction of the courts in New Delhi, India.
          </p>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>12. Contact</h2>
        <div className={styles.body}>
          <p>
            If you have questions about these Terms, please contact us at{' '}
            <a href="mailto:newsedition1@gmail.com">newsedition1@gmail.com</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
