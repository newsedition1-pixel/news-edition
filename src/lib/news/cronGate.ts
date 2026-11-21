import 'server-only'
import { bearerToken, secretMatches } from './cronAuth'
import { GITHUB_JWKS_URL, tokenKeyId, verifyGithubOidc, type Jwks, type OidcPolicy } from './githubOidc'

/**
 * Who may call the scheduled routes: only a workflow file of this repository, on master, proving
 * itself with GitHub's OIDC token (no secret to store), or an outside cron service that sends the
 * shared `CRON_SECRET`.
 */
const REPOSITORY = 'newsedition1-pixel/news-edition'

export type CronWorkflow = 'news-schedule.yml' | 'x-video.yml'

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

function policyFor(workflow: CronWorkflow): OidcPolicy {
  return {
    audience: 'https://newsedition.in',
    repository: REPOSITORY,
    workflowRef: `${REPOSITORY}/.github/workflows/${workflow}@refs/heads/master`,
    ref: 'refs/heads/master',
    events: ['schedule', 'workflow_dispatch'],
  }
}

export async function authoriseCron(headers: Headers, workflow: CronWorkflow): Promise<{ ok: true } | { ok: false; reason: string }> {
  const token = bearerToken(headers.get('authorization'))
  if (!token) return { ok: false, reason: 'missing token' }
  if (secretMatches(token, process.env.CRON_SECRET)) return { ok: true }
  let jwks = await loadJwks(false)
  if (!jwks) return { ok: false, reason: 'could not load GitHub signing keys' }
  // GitHub rotates keys now and then: if this token's key is not in the cached set, fetch a fresh one once.
  const kid = tokenKeyId(token)
  if (kid && !jwks.keys.some((k) => k.kid === kid)) jwks = (await loadJwks(true)) ?? jwks
  return verifyGithubOidc(token, jwks, policyFor(workflow))
}
