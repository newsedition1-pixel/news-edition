'use client'
import { useState } from 'react'
import Image from 'next/image'
import styles from './UsersManager.module.scss'
import type { User } from '@/lib/db/schema'

interface Props {
  users: User[]
  currentUserId: string
}

export function UsersManager({ users: initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState(initialUsers)
  const [loading, setLoading] = useState<string | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null)

  const update = async (id: string, data: Record<string, unknown>) => {
    setLoading(id)
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error || 'Failed'); return }
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...json } : u)))
    } finally {
      setLoading(null)
    }
  }

  const setRole = (id: string, role: string) => update(id, { role })

  const toggleBan = (user: User) => {
    if (user.banned) {
      update(user.id, { banned: false, banReason: null })
    } else {
      const reason = prompt('Ban reason (optional):') ?? ''
      update(user.id, { banned: true, banReason: reason || null })
    }
  }

  return (
    <>
      <div className={styles.table}>
        <table className={styles.t}>
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isMe = user.id === currentUserId
              return (
                <tr key={user.id} className={user.banned ? styles.bannedRow : ''}>
                  <td>
                    <div className={styles.userCell}>
                      <div className={styles.avatar}>
                        {user.image
                          ? <Image src={user.image} alt={user.name} width={32} height={32} />
                          : <span>{user.name?.charAt(0)?.toUpperCase()}</span>
                        }
                      </div>
                      <div>
                        <div className={styles.userName}>{user.name} {isMe && <span className={styles.youBadge}>you</span>}</div>
                      </div>
                    </div>
                  </td>
                  <td className={styles.email}>
                    {user.email}
                    {user.emailVerified && <span className={styles.verified} title="Verified">âœ“</span>}
                  </td>
                  <td>
                    {isMe ? (
                      <span className={`${styles.role} ${styles[`role_${user.role}`]}`}>{user.role}</span>
                    ) : (
                      <select
                        value={user.role || 'user'}
                        onChange={(e) => setRole(user.id, e.target.value)}
                        className={styles.roleSelect}
                        disabled={loading === user.id}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="owner">Owner</option>
                      </select>
                    )}
                  </td>
                  <td>
                    {user.banned
                      ? <span className={styles.bannedBadge} title={user.banReason || ''}>Banned</span>
                      : <span className={styles.activeBadge}>Active</span>
                    }
                  </td>
                  <td className={styles.date}>{new Date(user.createdAt).toLocaleDateString('en-IN')}</td>
                  <td>
                    {!isMe && (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          onClick={() => setPasswordTarget(user)}
                          className={styles.passwordBtn}
                          disabled={loading === user.id}
                        >
                          Set password
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleBan(user)}
                          className={`${styles.banBtn} ${user.banned ? styles.unbanBtn : ''}`}
                          disabled={loading === user.id}
                        >
                          {user.banned ? 'Unban' : 'Ban'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {passwordTarget && (
        <SetPasswordDialog user={passwordTarget} onClose={() => setPasswordTarget(null)} />
      )}
    </>
  )
}

function SetPasswordDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/users/${user.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to set password'); return }
      setDone(true)
    } catch {
      setError('Failed to set password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <h2 className={styles.dialogTitle}>Password updated</h2>
            <p className={styles.dialogNote}>
              {user.name} has been signed out everywhere and must use the new password to log back in.
            </p>
            <div className={styles.dialogActions}>
              <button type="button" onClick={onClose} className={styles.submitBtn}>Done</button>
            </div>
          </>
        ) : (
          <form onSubmit={submit}>
            <h2 className={styles.dialogTitle}>Set password</h2>
            <p className={styles.dialogNote}>
              For <strong>{user.name}</strong> ({user.email}). This signs them out of all devices.
            </p>

            <label className={styles.label} htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              disabled={saving}
            />

            <label className={styles.label} htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={styles.input}
              disabled={saving}
            />

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.dialogActions}>
              <button type="button" onClick={onClose} className={styles.cancelBtn} disabled={saving}>Cancel</button>
              <button type="submit" className={styles.submitBtn} disabled={saving}>
                {saving ? 'Savingâ€¦' : 'Set password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
