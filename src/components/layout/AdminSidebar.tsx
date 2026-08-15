'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from '@/lib/auth-client'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import styles from './AdminSidebar.module.scss'
import type { User } from '@/lib/db/schema'

interface AdminSidebarProps {
  user: Pick<User, 'id' | 'name' | 'email' | 'image' | 'role'>
  mobileOpen?: boolean
  onClose?: () => void
}

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { href: '/admin/homepage', label: 'Homepage', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { href: '/admin/articles', label: 'Articles', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
  { href: '/admin/articles/new', label: 'New Article', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
  { href: '/admin/news-automation', label: 'News Automation', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 22V4a2 2 0 0 1 2-2h10l4 4v12a2 2 0 0 1-2 2z"/><path d="M8 7h6M8 11h8M8 15h5"/><circle cx="18" cy="18" r="3"/></svg> },
  { href: '/admin/categories', label: 'Categories', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> },
  { href: '/admin/comments', label: 'Comments', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
  { href: '/admin/assets', label: 'Assets', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
]

const ownerItems = [
  { href: '/admin/users', label: 'Users', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
]

export function AdminSidebar({ user, mobileOpen, onClose }: AdminSidebarProps) {
  const pathname = usePathname()
  const isOwner = user.role === 'owner'
  const initial = user.name?.charAt(0).toUpperCase()

  return (
    <aside className={`${styles.sidebar} ${mobileOpen ? styles.mobileOpen : ''}`} aria-label="Admin navigation">
      <div className={styles.header}>
        <div>
          <Link href="/admin/dashboard" className={styles.logo} onClick={onClose}>NewsEdition</Link>
          <span className={styles.adminBadge}>Admin Panel</span>
        </div>
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      <div className={styles.user}>
        <div className={styles.avatar}>
          {user.image ? <Image src={user.image} alt={user.name} width={36} height={36} /> : initial}
        </div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{user.name}</div>
          <div className={styles.userRole}>{user.role}</div>
        </div>
        <ThemeToggle />
      </div>

      <nav className={styles.nav}>
        <span className={styles.section}>Content</span>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={`${styles.link} ${pathname === item.href || (item.href !== '/admin/dashboard' && item.href !== '/admin/articles/new' && pathname.startsWith(item.href)) ? styles.active : ''}`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}

        {isOwner && (
          <>
            <span className={styles.section}>Management</span>
            {ownerItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`${styles.link} ${pathname.startsWith(item.href) ? styles.active : ''}`}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className={styles.footer}>
        <Link href="/" className={styles.viewSite} target="_blank" rel="noopener noreferrer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          View Site
        </Link>
        <button className={styles.signOut} onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/login' } } })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </button>
      </div>
    </aside>
  )
}
