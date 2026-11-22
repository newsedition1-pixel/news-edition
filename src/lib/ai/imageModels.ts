/**
 * Which OpenAI image model draws the AI cover illustration. Pure (no 'server-only'), unit-tested.
 *
 * `gpt-image-1`, the old default, was shut down on 23 Oct 2026: from then on every call answered
 * 400 "The model 'gpt-image-1' does not exist" and each story with no licensed photo and no publisher photo
 * (about 6 a day) was saved as a draft and never published or shared (22 Nov 2026). OpenAI names
 * `gpt-image-2.5-flare` (fast, everyday use) and `gpt-image-2.5-sunburst` (editing precision) as the
 * replacements. The chain below is tried in order, and a model that the API says is gone or closed to
 * the account is skipped, so the next retirement costs one failed call, not a day of drafts.
 */
export const DEFAULT_IMAGE_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2', 'gpt-image-1.5', 'gpt-image-1-mini'] as const

/** OPENAI_IMAGE_MODEL (if set) first, then the defaults, each model once. */
export function imageModelChain(env: string | undefined): string[] {
  const own = (env ?? '').trim()
  return [...new Set([...(own ? [own] : []), ...DEFAULT_IMAGE_MODELS])]
}

/**
 * True when the API says this model is gone, unknown or closed to this account, so the next model should be
 * tried. A refusal of the picture itself (safety system), a rate limit or a server error is not: another model
 * would not change it, and the pipeline has its own neutral-prompt retry for refusals.
 */
export function modelUnavailable(status: number, body: string): boolean {
  if (status === 404) return true
  if (status !== 400 && status !== 403) return false
  return /model/i.test(body) && /does not exist|not found|not available|not supported|must be verified|verif(y|ication)|deprecated|shut ?down|retired|do(es)? not have access|no access/i.test(body)
}
