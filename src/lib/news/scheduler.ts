import 'server-only'
import { db } from '@/lib/db'
import { articles, categories, users } from '@/lib/db/schema'
import { and, desc, eq, inArray, max } from 'drizzle-orm'
import { discoverStories } from './feeds'
import { dropCoveredStories } from './fresh'
import { buildArticleFromStory, SkipStory, type StoryRef } from './pipeline'
import { saveBuiltArticle } from './publish'
import { alternativeCategories, classifyStory, DESKS, lastActivity, pickAuthorId, rotationOrder, SCHEDULE_SLUGS } from './desks'
import { categoryCounts24h } from './coverage'
import { getNewsAutoPublish, getNewsScheduleEnabled, getNewsWordLength, getSetting, setSetting, NEWS_SCHEDULE_FAILED_KEY, NEWS_SCHEDULE_TRIED_KEY } from '@/lib/settings'
import { addFailed, hasFailed, parseFailed } from './failed'
import { expireBreaking } from './placementDb'
import type { Story } from './cluster'

/** Two runs closer together than this are treated as one (GitHub can fire a late run right behind the next). */
const MIN_GAP_MS = 20 * 60 * 1000
/** Do not start another attempt after this long; one attempt can take about two minutes. */
const START_BUDGET_MS = 120_000
/** Stories written by the model (and rejected) in one run before it gives up. Unreadable pages cost no model call and do not count. */
const MAX_ATTEMPTS = 4
/** Stories looked at in one run, readable or not. */
const MAX_TRIES = 9
/** Stories tried per category before moving on. */
const PER_CATEGORY = 3
const SCHEDULE_FAQS = 6

export interface DeskStatus {
  authorName: string
  /** The author account used for this desk, or null when no such account exists. */
  authorId: string | null
  categories: { slug: string; name: string | null; active: boolean }[]
}

/** Which author account and which categories each desk resolves to right now. */
export async function loadDesks(): Promise<DeskStatus[]> {
  const [people, cats] = await Promise.all([
    db.select({ id: users.id, name: users.name, role: users.role, banned: users.banned, createdAt: users.createdAt }).from(users).limit(2000),
    db.select({ id: categories.id, slug: categories.slug, name: categories.name, isActive: categories.isActive }).from(categories).where(inArray(categories.slug, SCHEDULE_SLUGS)),
  ])
  return DESKS.map((d) => ({
    authorName: d.authorName,
    authorId: pickAuthorId(people, d.authorName),
    categories: d.slugs.map((slug) => {
      const c = cats.find((x) => x.slug === slug)
      return { slug, name: c?.name ?? null, active: !!c?.isActive }
    }),
  }))
}

export interface ScheduleStatus {
  enabled: boolean
  autoPublish: boolean
  desks: DeskStatus[]
  last: { title: string; slug: string; publishedAt: string | null; authorName: string | null; category: string | null } | null
}

export async function getScheduleStatus(): Promise<ScheduleStatus> {
  const [enabled, autoPublish, desks, lastRows] = await Promise.all([
    getNewsScheduleEnabled(),
    getNewsAutoPublish(),
    loadDesks(),
    db
      .select({ title: articles.title, slug: articles.slug, publishedAt: articles.publishedAt, authorName: users.name, category: categories.name })
      .from(articles)
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(and(eq(articles.isAiGenerated, true), eq(articles.status, 'published')))
      .orderBy(desc(articles.publishedAt))
      .limit(1),
  ])
  const l = lastRows[0]
  return {
    enabled,
    autoPublish,
    desks,
    last: l ? { title: l.title, slug: l.slug, publishedAt: l.publishedAt ? l.publishedAt.toISOString() : null, authorName: l.authorName, category: l.category } : null,
  }
}

export interface ScheduleOutcome {
  status: 'published' | 'draft' | 'skipped' | 'disabled' | 'failed'
  message: string
  category?: string
  author?: string
  title?: string
  slug?: string
  /** Desks that could not be used and why (missing author account, missing category). */
  notices: string[]
  attempts: { title: string; category: string; result: string }[]
}

/** " (featured, breaking)" for the log line, or nothing. */
function placementLabel(p: { featured: boolean; breaking: boolean }): string {
  const tags = [p.breaking ? 'breaking' : '', p.featured ? 'featured' : ''].filter(Boolean)
  return tags.length ? ` (${tags.join(', ')})` : ''
}

function toStoryRef(s: Story): StoryRef {
  return { title: s.lead.title, sources: s.publishers.map((p) => ({ name: p.name, url: p.url, title: p.title })), trendTerm: s.trendMatch }
}

/**
 * One scheduled run: pick the category that has waited longest, take the best fresh story of that
 * category, write and publish it under that category's author. If no story fits (or it fails the
 * checks), try the next category. Publishes at most one article per run.
 */
export async function runScheduledArticle(opts: { force?: boolean } = {}): Promise<ScheduleOutcome> {
  const startedAt = Date.now()
  const out: ScheduleOutcome = { status: 'skipped', message: '', notices: [], attempts: [] }

  if (!(await getNewsScheduleEnabled())) return { ...out, status: 'disabled', message: 'The schedule is paused in Admin → News Automation.' }

  // Breaking is for the first hours only: take the flag off AI articles that are older than that.
  await expireBreaking().catch((err) => console.error('Expire breaking failed:', err))

  if (!opts.force) {
    const [recent] = await db
      .select({ createdAt: articles.createdAt })
      .from(articles)
      .where(eq(articles.isAiGenerated, true))
      .orderBy(desc(articles.createdAt))
      .limit(1)
    if (recent && Date.now() - recent.createdAt.getTime() < MIN_GAP_MS) {
      return { ...out, message: 'An AI article was saved less than 20 minutes ago, so this run did nothing.' }
    }
  }

  // Which categories can be used: the category must exist and be active, and its author account must exist.
  const desks = await loadDesks()
  const cats = await db
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .where(and(inArray(categories.slug, SCHEDULE_SLUGS), eq(categories.isActive, true)))
  const usable = new Map<string, { id: number; slug: string; name: string; authorId: string; authorName: string }>()
  for (const d of desks) {
    if (!d.authorId) out.notices.push(`No author account named "${d.authorName}" — its categories (${d.categories.map((c) => c.slug).join(', ')}) are skipped. Create the account in Admin → Users.`)
    for (const c of d.categories) {
      const cat = cats.find((x) => x.slug === c.slug)
      if (!cat) {
        out.notices.push(`Category "${c.slug}" does not exist or is inactive, so it is skipped.`)
        continue
      }
      if (d.authorId) usable.set(c.slug, { ...cat, authorId: d.authorId, authorName: d.authorName })
    }
  }
  if (usable.size === 0) return { ...out, status: 'failed', message: 'No category has both an active category and an author account, so nothing can be published.' }

  // Rotation: the category that has gone longest without a scheduled article goes first.
  const lastRows = await db
    .select({ slug: categories.slug, at: max(articles.publishedAt) })
    .from(articles)
    .innerJoin(categories, eq(articles.categoryId, categories.id))
    .where(and(eq(articles.isAiGenerated, true), eq(articles.status, 'published'), inArray(categories.slug, [...usable.keys()])))
    .groupBy(categories.slug)
  const last: Record<string, number | null> = {}
  for (const slug of usable.keys()) last[slug] = null
  for (const r of lastRows) last[r.slug] = r.at ? new Date(r.at as unknown as string | Date).getTime() : null
  // A category that was only tried (and failed) recently goes to the back too, so one that keeps failing cannot starve the rest.
  const tried = parseFailed(await getSetting(NEWS_SCHEDULE_TRIED_KEY), Date.now())
  const order = rotationOrder(lastActivity(last, tried))

  const { stories } = await discoverStories('')
  if (stories.length === 0) return { ...out, message: 'No stories could be loaded from the trusted publishers right now.' }
  const fresh = await dropCoveredStories(stories)
  if (fresh.length === 0) return { ...out, message: 'Every current story has already been covered.' }

  const byCategory = new Map<string, Story[]>()
  const alternatives = new Map<Story, string[]>()
  for (const s of fresh) {
    const text = { title: s.lead.title, summary: s.lead.summary, publisherKeys: s.publishers.map((p) => p.key) }
    const slug = classifyStory(text)
    byCategory.set(slug, [...(byCategory.get(slug) ?? []), s])
    alternatives.set(s, alternativeCategories(text))
  }
  // Every category should get an article every day: one with none in the last 24 hours may also take a
  // story that fits it second best, when it has too few stories of its own.
  const counts = await categoryCounts24h([...usable.keys()]).catch(() => ({}) as Record<string, number>)
  const overdue = new Set([...usable.keys()].filter((slug) => counts[slug] === 0))

  const [wordLength, autoPublish] = await Promise.all([getNewsWordLength(), getNewsAutoPublish()])

  // Stories that failed recently are not tried again (they would fail the same way).
  let failed = parseFailed(await getSetting(NEWS_SCHEDULE_FAILED_KEY), Date.now())
  let triedNow = tried
  let modelAttempts = 0
  let looked = 0

  for (const slug of order) {
    const target = usable.get(slug)
    if (!target) continue
    const own = byCategory.get(slug) ?? []
    const borrowed = overdue.has(slug) ? fresh.filter((s) => !own.includes(s) && alternatives.get(s)?.includes(slug)) : []
    const pool = [...own, ...borrowed].filter((s) => !hasFailed(failed, s.publishers.map((p) => p.url)))
    if (pool.length === 0) continue

    triedNow = addFailed(triedNow, [slug], Date.now())
    await setSetting(NEWS_SCHEDULE_TRIED_KEY, JSON.stringify(triedNow)).catch(() => undefined)

    for (const story of pool.slice(0, PER_CATEGORY)) {
      if (modelAttempts >= MAX_ATTEMPTS || looked >= MAX_TRIES || Date.now() - startedAt > START_BUDGET_MS) {
        return { ...out, message: 'No article passed the checks in this run (time or attempt limit reached).' }
      }
      looked++
      const ref = toStoryRef(story)
      const urls = ref.sources.map((x) => x.url)
      const attempt = { title: ref.title, category: slug, result: '' }
      out.attempts.push(attempt)
      try {
        const dupe = await db.select({ id: articles.id }).from(articles).where(inArray(articles.sourceUrl, urls)).limit(1)
        if (dupe.length > 0) {
          attempt.result = 'already covered'
          continue
        }
        const built = await buildArticleFromStory(ref, {
          categories: [{ id: target.id, slug: target.slug, name: target.name }],
          fixedCategoryId: target.id,
          wordLength,
          faqCount: SCHEDULE_FAQS,
          imageMode: 'licensed_first',
          uploadedBy: target.authorId,
        })
        const saved = await saveBuiltArticle(built, target.authorId, autoPublish, { strength: story.publisherCount + (story.trendMatch ? 1 : 0), publishers: story.publisherCount })
        attempt.result = saved.published ? 'published' : `draft (${saved.holdReason ?? 'auto-publish is off'})`
        return {
          ...out,
          status: saved.published ? 'published' : 'draft',
          message: saved.published ? `Published${placementLabel(saved.placement)}.` : `Saved as a draft: ${saved.holdReason ?? 'auto-publish is off'}.`,
          category: target.name,
          author: target.authorName,
          title: saved.title,
          slug: saved.slug,
        }
      } catch (err) {
        const unreadable = err instanceof SkipStory && err.kind === 'unreadable'
        attempt.result = err instanceof SkipStory ? `skipped: ${err.message}` : `failed: ${err instanceof Error ? err.message : 'unknown error'}`
        if (!(err instanceof SkipStory)) console.error('Scheduled article error:', urls[0], err)
        failed = addFailed(failed, urls, Date.now())
        await setSetting(NEWS_SCHEDULE_FAILED_KEY, JSON.stringify(failed)).catch(() => undefined)
        if (unreadable) continue // cheap: try the next story of this category
        modelAttempts++
        break // the model wrote it and the checks said no: move on to the next category
      }
    }
  }
  return { ...out, message: 'No fresh story matched a category that could be published, or none passed the checks.' }
}
