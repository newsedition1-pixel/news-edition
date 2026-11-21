import { NextRequest, NextResponse } from 'next/server'
import { authoriseCron } from '@/lib/news/cronGate'
import { isSlug } from '@/lib/reel/asset'
import { isMp4, X_VIDEO_MAX_UPLOAD } from '@/lib/social/xvideo'
import { publishVideo, videoCandidate } from '@/lib/social/xvideoRun'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * The daily X video, called only by the `x-video.yml` workflow (GitHub OIDC; or the CRON_SECRET).
 * GET answers with the story and the words for the frames, or `{ skip }` when there is nothing to
 * do today. POST takes the rendered MP4 (multipart: `slug`, `video`, at most 4 MB) and posts it.
 */
export async function GET(request: NextRequest) {
  const auth = await authoriseCron(request.headers, 'x-video.yml')
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorised', reason: auth.reason }, { status: 401 })
  try {
    return NextResponse.json(await videoCandidate())
  } catch (error) {
    console.error('X video candidate error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await authoriseCron(request.headers, 'x-video.yml')
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorised', reason: auth.reason }, { status: 401 })
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Send multipart form data with "slug" and "video".' }, { status: 400 })
  }
  const slug = form.get('slug')
  const file = form.get('video')
  if (typeof slug !== 'string' || !isSlug(slug) || !(file instanceof File)) return NextResponse.json({ error: 'Fields "slug" and "video" are required.' }, { status: 400 })
  if (file.size > X_VIDEO_MAX_UPLOAD) return NextResponse.json({ error: 'The video is larger than 4 MB.' }, { status: 413 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isMp4(bytes)) return NextResponse.json({ error: 'The file is not an MP4.' }, { status: 400 })
  const outcome = await publishVideo(slug, bytes)
  return NextResponse.json({ ok: outcome.ok, message: outcome.message, ref: outcome.ref }, { status: outcome.status })
}
