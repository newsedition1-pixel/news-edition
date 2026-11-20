import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/dal'
import { setSetting, SOCIAL_MODE_KEY } from '@/lib/settings'
import { getSocialStatus } from '@/lib/social/share'

export const runtime = 'nodejs'

function isRedirect(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')
}

export async function GET() {
  try {
    await requireAdmin()
    return NextResponse.json(await getSocialStatus())
  } catch (error) {
    if (isRedirect(error)) throw error
    console.error('Social status error:', error)
    return NextResponse.json({ error: 'Failed to load the social settings' }, { status: 500 })
  }
}

/** Off, preview (write the posts, send nothing) or live. */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const body = (await request.json().catch(() => ({}))) as { mode?: unknown }
    if (body.mode !== 'off' && body.mode !== 'dry' && body.mode !== 'on') {
      return NextResponse.json({ error: 'mode must be off, dry or on' }, { status: 400 })
    }
    await setSetting(SOCIAL_MODE_KEY, body.mode)
    return NextResponse.json(await getSocialStatus())
  } catch (error) {
    if (isRedirect(error)) throw error
    console.error('Social update error:', error)
    return NextResponse.json({ error: 'Failed to change the social settings' }, { status: 500 })
  }
}
