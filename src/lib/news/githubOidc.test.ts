import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { GITHUB_ISSUER, tokenKeyId, verifyGithubOidc, type Jwks, type OidcPolicy } from './githubOidc'

const policy: OidcPolicy = {
  audience: 'https://newsedition.in',
  repository: 'newsedition1-pixel/news-edition',
  workflowRef: 'newsedition1-pixel/news-edition/.github/workflows/news-schedule.yml@refs/heads/master',
  ref: 'refs/heads/master',
  events: ['schedule', 'workflow_dispatch'],
}
const NOW = 1_800_000_000_000

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwks = { keys: [{ ...(pair.publicKey.export({ format: 'jwk' }) as unknown as Jwks['keys'][number]), kid: 'k1' }] } satisfies Jwks

const b64 = (o: unknown) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')

function makeToken(claims: Record<string, unknown> = {}, opts: { alg?: string; kid?: string; key?: typeof pair.privateKey } = {}) {
  const header = b64({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' })
  const payload = b64({
    iss: GITHUB_ISSUER,
    aud: policy.audience,
    exp: NOW / 1000 + 300,
    nbf: NOW / 1000 - 5,
    repository: policy.repository,
    ref: policy.ref,
    job_workflow_ref: policy.workflowRef,
    event_name: 'schedule',
    ...claims,
  })
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), opts.key ?? pair.privateKey).toString('base64url')
  return `${header}.${payload}.${signature}`
}

const check = (t: string) => verifyGithubOidc(t, jwks, policy, NOW)

test('accepts the real workflow, scheduled or run by hand', () => {
  assert.deepEqual(check(makeToken()), { ok: true })
  assert.deepEqual(check(makeToken({ event_name: 'workflow_dispatch' })), { ok: true })
  assert.equal(tokenKeyId(makeToken()), 'k1')
})

test('rejects tokens from anywhere else', () => {
  const bad = (t: string, reason: string) => assert.deepEqual(check(t), { ok: false, reason })
  bad(makeToken({ repository: 'someone/fork' }), 'wrong repository')
  bad(makeToken({ ref: 'refs/heads/feature' }), 'wrong branch')
  bad(makeToken({ job_workflow_ref: 'newsedition1-pixel/news-edition/.github/workflows/other.yml@refs/heads/master' }), 'wrong workflow')
  bad(makeToken({ event_name: 'pull_request' }), 'wrong trigger')
  bad(makeToken({ aud: 'https://example.com' }), 'wrong audience')
  bad(makeToken({ iss: 'https://evil.example' }), 'wrong issuer')
  bad(makeToken({ exp: NOW / 1000 - 1 }), 'token expired')
  bad(makeToken({ nbf: NOW / 1000 + 3600 }), 'token not valid yet')
})

test('rejects forged, tampered and malformed tokens', () => {
  assert.equal(check(makeToken({}, { key: other.privateKey })).ok, false)
  assert.equal(check(makeToken({}, { kid: 'nope' })).ok, false)
  assert.equal(check(makeToken({}, { alg: 'none' })).ok, false)
  assert.equal(check(makeToken({}, { alg: 'HS256' })).ok, false)
  const [h, , s] = makeToken().split('.')
  assert.equal(check(`${h}.${b64({ iss: GITHUB_ISSUER, aud: policy.audience, exp: NOW / 1000 + 300, repository: policy.repository, ref: policy.ref, job_workflow_ref: policy.workflowRef, event_name: 'schedule', extra: 1 })}.${s}`).ok, false)
  assert.equal(check('').ok, false)
  assert.equal(check('a.b').ok, false)
  assert.equal(check('a.b.c').ok, false)
})
