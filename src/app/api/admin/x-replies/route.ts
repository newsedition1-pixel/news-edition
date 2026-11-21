import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/dal'
import { getReplyStatus, markDesk, runXInbox } from '@/lib/social/xinbox'

export const runtime = 'nodejs'
export const maxDuration = 120

function isRedirect(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')
}

export async function GET() {
  try {
    await requireAdmin()
    return NextResponse.json(await getReplyStatus())
  } catch (error) {
    if (isRedirect(error)) throw error
    console.error('Reply desk status error:', error)
    return NextResponse.json({ error: 'Failed to load the reply desk' }, { status: 500 })
  }
}

/** `{action: 'refresh'}` reads the target accounts now; `{action: 'done' | 'skip', id}` closes one desk item. */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const body = (await request.json().catch(() => ({}))) as { action?: unknown; id?: unknown }
    if (body.action === 'refresh') {
      const outcome = await runXInbox({ deskNow: true })
      return NextResponse.json({ ...(await getReplyStatus()), message: outcome.message })
    }
    if ((body.action === 'done' || body.action === 'skip') && typeof body.id === 'string' && /^\d{1,25}$/.test(body.id)) {
      await markDesk(body.id, body.action === 'done' ? 'done' : 'skipped')
      return NextResponse.json(await getReplyStatus())
    }
    return NextResponse.json({ error: 'action must be refresh, or done / skip with an id' }, { status: 400 })
  } catch (error) {
    if (isRedirect(error)) throw error
    console.error('Reply desk update error:', error)
    return NextResponse.json({ error: 'Failed to update the reply desk' }, { status: 500 })
  }
}
