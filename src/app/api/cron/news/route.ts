import { NextRequest, NextResponse } from 'next/server'
import { runScheduledArticle } from '@/lib/news/scheduler'
import { GITHUB_JWKS_URL, tokenKeyId, verifyGithubOidc, type Jwks, type OidcPolicy } from '@/lib/news/githubOidc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const REPOSITORY = 'newsedition1-pixel/news-edition'

/** Only the schedule workflow of this repository, on master, may call this route. */
const POLICY: OidcPolicy = {
  audience: 'https://newsedition.in',
  repository: REPOSITORY,
  workflowRef: `${REPOSITORY}/.github/workflows/news-schedule.yml@refs/heads/master`,
  ref: 'refs/heads/master',
  events: ['schedule', 'workflow_dispatch'],
}

let cachedJwks: { jwks: Jwks; at: number } | null = null

async function loadJwks(force: boolean): Promise<Jwks | null> {
  if (!force && cachedJwks && Date.now() - cachedJwks.at < 60 * 60 * 1000) return cachedJwks.jwks
  try {
    const res = await fetch(GITHUB_JWKS_URL, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return cachedJwks?.jwks ?? null
    const jwks = (await res.json()) as Jwks
    if (!Array.isArray(jwks.keys)) return cachedJwks?.jwks ?? null
    cachedJwks = { jwks, at: Date.now() }
    return jwks
  } catch {
    return cachedJwks?.jwks ?? null
  }
}

async function authorise(request: NextRequest): Promise<{ ok: true } | { ok: false; reason: string }> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return { ok: false, reason: 'missing token' }
  let jwks = await loadJwks(false)
  if (!jwks) return { ok: false, reason: 'could not load GitHub signing keys' }
  // GitHub rotates keys now and then: if this token's key is not in the cached set, fetch a fresh one once.
  const kid = tokenKeyId(token)
  if (kid && !jwks.keys.some((k) => k.kid === kid)) jwks = (await loadJwks(true)) ?? jwks
  return verifyGithubOidc(token, jwks, POLICY)
}

/**
 * Called every 30 minutes by the GitHub Actions workflow `news-schedule.yml` (Vercel Hobby cron
 * only runs daily). The workflow proves who it is with GitHub's OIDC token, so no shared secret
 * has to be stored anywhere. Publishes at most one article. `?force=1` skips the "ran recently"
 * guard. Anything other than a clean run returns 200 with a status; only real errors return 5xx.
 */
export async function GET(request: NextRequest) {
  const auth = await authorise(request)
  if (!auth.ok) {
    console.warn('News schedule: request refused —', auth.reason)
    return NextResponse.json({ error: 'Unauthorised', reason: auth.reason }, { status: 401 })
  }
  try {
    const outcome = await runScheduledArticle({ force: request.nextUrl.searchParams.get('force') === '1' })
    return NextResponse.json(outcome, { status: outcome.status === 'failed' ? 500 : 200 })
  } catch (error) {
    console.error('News schedule error:', error)
    return NextResponse.json({ error: 'The scheduled run failed' }, { status: 500 })
  }
}
