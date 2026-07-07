import type { Metadata } from 'next'
import styles from '../static.module.scss'

export const metadata: Metadata = {
  title: 'Careers',
  description: 'Join the NewsEdition team. We are looking for passionate interns in news publishing and marketing. Apply today.',
  alternates: { canonical: '/careers' },
}

const OPENINGS = [
  {
    title: 'News Publishing Intern',
    type: 'Internship',
    location: 'New Delhi / Remote',
    desc: 'Assist in researching, writing, editing, and publishing news articles across our platform. Ideal for journalism or mass communication students keen on breaking into digital media.',
    skills: ['Writing', 'Research', 'Editing', 'Current Affairs'],
  },
  {
    title: 'Marketing Intern',
    type: 'Internship',
    location: 'New Delhi / Remote',
    desc: 'Help grow NewsEdition\'s audience through social media management, content promotion, and digital marketing campaigns. Ideal for marketing or communications students.',
    skills: ['Social Media', 'Content Marketing', 'Analytics', 'Creativity'],
  },
]

export default function CareersPage() {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>Careers</span>
        <h1 className={styles.title}>Join Us and Shape the News</h1>
        <p className={styles.lead}>
          We&apos;re a small but passionate team building one of India&apos;s growing independent digital
          news platforms. If you want hands-on experience in media, this is the place to start.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Current Openings</h2>
        <div className={styles.jobs}>
          {OPENINGS.map(job => (
            <div key={job.title} className={styles.jobCard}>
              <div className={styles.jobInfo}>
                <div className={styles.jobTitle}>{job.title}</div>
                <p className={styles.jobDesc}>{job.desc}</p>
                <div className={styles.jobTags}>
                  <span className={styles.jobTag}>{job.type}</span>
                  <span className={styles.jobTag}>{job.location}</span>
                  {job.skills.map(s => (
                    <span key={s} className={styles.jobTag}>{s}</span>
                  ))}
                </div>
              </div>
              <a
                href={`mailto:newsedition1@gmail.com?subject=Application: ${encodeURIComponent(job.title)}`}
                className={styles.applyBtn}
              >
                Apply Now
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>How to Apply</h2>
        <div className={styles.body}>
          <p>
            Send your CV along with a brief note about yourself and why you want to work with
            NewsEdition to{' '}
            <a href="mailto:newsedition1@gmail.com">newsedition1@gmail.com</a>.
            Use the subject line: <strong>Application: [Role Name]</strong>.
          </p>
          <p>
            We review all applications and aim to respond within a week. We welcome candidates
            from all backgrounds — what matters most is curiosity, initiative, and a genuine
            interest in news and media.
          </p>
        </div>
      </div>
    </div>
  )
}
