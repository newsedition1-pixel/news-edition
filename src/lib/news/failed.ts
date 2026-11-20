/**
 * Memory of stories the schedule already tried and could not turn into an article (copy check,
 * fact check, unreadable page). Without it every run would pick the same failing top story again
 * and spend two model calls on it, 48 times a day. Entries expire so a story can be retried later.
 * Pure, so it can be unit-tested; the scheduler stores the map in the `settings` table.
 */
export type FailedMap = Record<string, number>

export const FAILED_TTL_MS = 12 * 60 * 60 * 1000
export const FAILED_MAX = 300

/** Reads the stored JSON, dropping expired entries and anything malformed. */
export function parseFailed(raw: string | null, now: number): FailedMap {
  if (!raw) return {}
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
  const out: FailedMap = {}
  for (const [url, at] of Object.entries(data as Record<string, unknown>)) {
    if (typeof at === 'number' && Number.isFinite(at) && now - at < FAILED_TTL_MS) out[url] = at
  }
  return out
}

/** Adds the story's report URLs, keeping only the newest `FAILED_MAX` entries. */
export function addFailed(map: FailedMap, urls: string[], now: number): FailedMap {
  const next: FailedMap = { ...map }
  for (const u of urls) next[u] = now
  const entries = Object.entries(next).sort((a, b) => b[1] - a[1]).slice(0, FAILED_MAX)
  return Object.fromEntries(entries)
}

/** True when any report URL of the story failed recently. */
export function hasFailed(map: FailedMap, urls: string[]): boolean {
  return urls.some((u) => u in map)
}
