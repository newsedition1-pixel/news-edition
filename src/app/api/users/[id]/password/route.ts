import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { and, eq } from 'drizzle-orm'
import { requireOwner } from '@/lib/dal'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { accounts, users } from '@/lib/db/schema'

const MIN_PASSWORD_LENGTH = 8

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOwner()
    const { id } = await params
    if (id === session.user.id) {
      return NextResponse.json({ error: 'Change your own password from account settings' }, { status: 400 })
    }

    const { newPassword } = await request.json()
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 })
    }

    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const [credential] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, id), eq(accounts.providerId, 'credential')))
      .limit(1)

    if (credential) {
      await auth.api.setUserPassword({ body: { newPassword, userId: id }, headers: await headers() })
    } else {
      // setUserPassword only updates an existing credential account, so a
      // social-only user (Google sign-in) needs one created before they can
      // ever log in with a password.
      const ctx = await auth.$context
      await ctx.internalAdapter.createAccount({
        userId: id,
        providerId: 'credential',
        accountId: id,
        password: await ctx.password.hash(newPassword),
      })
    }

    // Old sessions stay valid otherwise — revoke so the new password takes effect everywhere.
    await auth.api.revokeUserSessions({ body: { userId: id }, headers: await headers() })

    return NextResponse.json({ success: true })
  } catch (error) {
    // requireOwner() redirects by throwing; don't swallow that into a 500.
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    console.error('Set user password error:', error)
    return NextResponse.json({ error: 'Failed to set password' }, { status: 500 })
  }
}
