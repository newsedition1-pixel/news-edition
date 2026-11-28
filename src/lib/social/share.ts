import 'server-only'
import { db } from '@/lib/db'
import { articles, categories } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSetting, getSocialMode, setSetting, SOCIAL_LOG_KEY, type SocialMode } from '@/lib/settings'
import { composeAll, webhookPayload, type ArticleForSocial } from './compose'
import { configuredChannels, loadChannelConfig, secretsOf, sendFacebook, sendInstagram, sendTelegram, sendWebhook, sendX, type ChannelName, type SendResult, type XLinkMode } from './channels'
import { FEED_DAILY_CAP, feedDecision } from './policy'
import { addEntry, alreadyShared, chosenToday, lastChosenAt, parseLog, scrub, type ChannelResult, type ShareEntry, type XNote } from './log'
import { X_LINK_DAILY_CAP, X_POLL_DAILY_CAP, planBreaking, planX, xBreakingMinPublishers, xBreakingVerdict, xDailyCap, xDay, xModeOf, type XMode } from './xplan'
import { isUrgentHeadline } from '@/lib/news/placement'
import { composeXPost, isPollSafe } from './xcopy'
import { writeXDraft } from './xwriter'

export const ALL_CHANNELS: ChannelName[] = ['telegram', 'x', 'facebook', 'instagram', 'webhook']

export async function loadShareLog(): Promise<ShareEntry[]> {
  return parseLog(await getSetting(SOCIAL_LOG_KEY))
}

export async function loadArticle(id: number): Promise<{ article: ArticleForSocial; published: boolean; breaking: boolean } | null> {
  const [row] = await db
    .select({
      title: articles.title,
      isBreaking: articles.isBreaking,
      slug: articles.slug,
      excerpt: articles.excerpt,
      tags: articles.tags,
      content: articles.content,
      coverImage: articles.coverImage,
      status: articles.status,
      categorySlug: categories.slug,
      categoryName: categories.name,
    })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .where(eq(articles.id, id))
    .limit(1)
  if (!row) return null
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in').replace(/\/$/, '')
  return {
    published: row.status === 'published',
    breaking: row.isBreaking,
    article: {
      title: row.title,
      excerpt: row.excerpt,
      url: `${siteUrl}/article/${row.slug}`,
      tags: row.tags ?? [],
      categorySlug: row.categorySlug,
      categoryName: row.categoryName,
      imageUrl: row.coverImage,
      content: row.content,
    },
  }
}

const skipped = (why: string): ChannelResult => ({ ok: false, skipped: why })

/** The tweet as the admin reads it in a preview: its text, plus the poll options or the picture. */
function describeX(post: { text: string; poll?: { options: string[] } | null; imageUrl: string | null }): string {
  if (post.poll) return `${post.text}\n[poll: ${post.poll.options.join(' / ')}]`
  return post.imageUrl ? `${post.text}\n[with picture]` : post.text
}

/**
 * Shares one published article on every configured platform, according to the mode set in Admin >
 * News Automation (off by default). Telegram gets every article; X gets only breaking news (X_MODE, see
 * lib/social/xplan.ts); Instagram and Facebook get up to FEED_DAILY_CAP posts a day (lib/social/policy.ts). `strength` is how many trusted
 * publishers carried the story (+1 if trending); `publishers` is the plain publisher count (X's breaking rule
 * reads it). Leave both out for an article an editor published by hand. `breaking` is true for a story the scheduler
 * took through the breaking fast lane (lib/news/breaking.ts): X counts it as breaking news whatever the article's
 * own flag and headline say, because the lane already checked that 2+ trusted publishers carried it with an urgent headline.
 * Never throws: a failure here must not undo a published article.
 */
export async function shareArticle(id: number, opts: { strength?: number; publishers?: number; breaking?: boolean } = {}): Promise<ShareEntry | null> {
  try {
    const mode = await getSocialMode()
    if (mode === 'off') return null
    const dry = mode === 'dry'

    const log = await loadShareLog()
    if (!dry && alreadyShared(log, id)) return null

    const loaded = await loadArticle(id)
    if (!loaded || !loaded.published) return null
    const { article } = loaded

    const cfg = loadChannelConfig(process.env)
    const now = new Date()
    const decision = feedDecision({ now, chosenToday: chosenToday(log, now), lastChosenAt: lastChosenAt(log), strength: opts.strength })
    const xLink = cfg.xLinkMode === 'always' || (cfg.xLinkMode === 'top' && decision.top)
    const set = composeAll(article, { xLink })

    // X (lib/social/xplan.ts). Default, since 27 Nov 2026: breaking news only, i.e. an article that carries the
    // breaking flag (its row says so by now: the scheduler writes it before it calls us, an editor ticks it) or,
    // for a scheduled story, one carried by 2+ trusted publishers with an urgent headline (X_BREAKING_MIN_PUBLISHERS).
    // X_MODE=growth: a few confirmed stories a day, each with its picture, one poll, the link only on the best.
    // X_MODE=legacy: every article, plain text.
    let xPost = set.x
    let xNote: XNote | undefined
    let xSkip: string | null = null
    const xMode = xModeOf(process.env.X_MODE)
    if (cfg.x && xMode !== 'legacy') {
      const verdict =
        opts.breaking && !loaded.breaking
          ? { breaking: true, reason: `breaking news: picked up at once, carried by ${opts.publishers ?? 'several'} publishers` }
          : xBreakingVerdict({
              flagged: loaded.breaking,
              publishers: opts.publishers,
              urgent: isUrgentHeadline(article.title),
              minPublishers: xBreakingMinPublishers(process.env.X_BREAKING_MIN_PUBLISHERS),
            })
      const plan =
        xMode === 'breaking'
          ? planBreaking({
              breaking: verdict.breaking,
              breakingReason: verdict.reason,
              today: xDay(log, now, dry),
              linkMode: cfg.xLinkMode,
              dailyCap: xDailyCap(process.env.X_DAILY_CAP),
              hasImage: !!article.imageUrl,
              aiCover: set.aiCover,
            })
          : planX({
              now,
              today: xDay(log, now, dry),
              top: decision.top,
              strength: opts.strength,
              linkMode: cfg.xLinkMode,
              dailyCap: xDailyCap(process.env.X_DAILY_CAP),
              hasImage: !!article.imageUrl,
              aiCover: set.aiCover,
              pollSafe: isPollSafe(article),
            })
      if (plan.format === 'skip') {
        xSkip = plan.reason
        xNote = { format: 'skip', link: false, image: false, reason: plan.reason }
      } else {
        const { draft } = await writeXDraft(article, plan.format === 'poll')
        // `plan.format` is narrowed to post | poll here, but the object itself is not, so hand over the three fields.
        const composed = composeXPost({ article, draft, plan: { format: plan.format, link: plan.link, image: plan.image } })
        xPost = composed
        xNote = { format: plan.format, link: plan.link, image: !!composed.imageUrl, reason: plan.reason, copy: composed.copy }
      }
    }

    const results: Record<string, ChannelResult> = {}
    const deps = { fetch: (url: string, init?: RequestInit) => fetch(url, init) }
    const notTop = `not a top story (${decision.reason})`
    // What each configured platform would do. `skip` is a reason to send nothing there.
    const plans: { name: ChannelName; skip: string | null; send: () => Promise<SendResult> }[] = []
    if (cfg.telegram) plans.push({ name: 'telegram', skip: null, send: () => sendTelegram(cfg.telegram!, set.telegram, deps) })
    if (cfg.x) plans.push({ name: 'x', skip: xSkip ? `X: ${xSkip}` : null, send: () => sendX(cfg.x!, xPost, deps) })
    if (cfg.facebook) plans.push({ name: 'facebook', skip: decision.top ? null : notTop, send: () => sendFacebook(cfg, set.facebook, deps) })
    if (cfg.instagram) {
      const skip = !decision.top ? notTop : set.aiCover ? 'the cover is an AI illustration' : !set.instagram.imageUrl ? 'no cover image' : null
      plans.push({ name: 'instagram', skip, send: () => sendInstagram(cfg, set.instagram, deps) })
    }
    if (cfg.webhook) plans.push({ name: 'webhook', skip: null, send: () => sendWebhook(cfg.webhook!, webhookPayload(article, set, { feed: decision.top }), deps) })

    const planned = new Set(plans.map((p) => p.name))
    for (const name of ALL_CHANNELS) if (!planned.has(name)) results[name] = skipped('not set up')
    const jobs: Promise<void>[] = []
    for (const p of plans) {
      if (p.skip) results[p.name] = skipped(p.skip)
      else if (dry) results[p.name] = skipped('preview only')
      else jobs.push(p.send().then((r) => { results[p.name] = r.ok ? { ok: true, ref: r.ref, ...(r.note ? { note: r.note } : {}) } : { ok: false, error: r.error } }))
    }

    await Promise.all(jobs)

    const secrets = secretsOf(cfg)
    for (const r of Object.values(results)) {
      if (r.error) r.error = scrub(r.error, secrets)
      if (r.note) r.note = scrub(r.note, secrets)
    }

    const entry: ShareEntry = {
      id,
      title: article.title,
      at: now.toISOString(),
      dry,
      top: decision.top,
      reason: decision.reason,
      results,
      ...(xNote ? { x: xNote } : {}),
      ...(dry
        ? { captions: { telegram: set.telegram.text, x: xSkip ? `(not posted: ${xSkip})` : describeX(xPost), facebook: set.facebook.text, instagram: set.instagram.text } }
        : {}),
    }
    // One line per share in the runtime log, so "why did nothing go to X" can be answered without the admin screen.
    console.log(
      `Social share #${id}${dry ? ' (preview)' : ''}: ` +
        Object.entries(results).map(([k, r]) => `${k}=${r.ok ? 'sent' : r.skipped ? `skipped (${r.skipped})` : `FAILED (${r.error ?? 'unknown'})`}`).join('; '),
    )
    // Read the log again so a share that finished while this one was running is not lost.
    const latest = await loadShareLog()
    await setSetting(SOCIAL_LOG_KEY, JSON.stringify(addEntry(latest, entry)))
    return entry
  } catch (err) {
    console.error('Social share error:', id, err instanceof Error ? err.message : err)
    return null
  }
}

// ── admin status ────────────────────────────────────────────────────────────

/** The environment variables each platform needs (names only; values are never shown). */
const NEEDS: Record<ChannelName, { who: string; vars: string[] }> = {
  telegram: { who: 'every article', vars: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] },
  x: { who: 'breaking news only (X_MODE=growth: confirmed stories, one poll)', vars: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'] },
  facebook: { who: 'top stories', vars: ['META_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID'] },
  instagram: { who: 'top stories', vars: ['META_PAGE_ACCESS_TOKEN', 'INSTAGRAM_ACCOUNT_ID'] },
  webhook: { who: 'every article, marked top or not', vars: ['SOCIAL_WEBHOOK_URL'] },
}

export interface SocialStatus {
  mode: SocialMode
  channels: { name: ChannelName; configured: boolean; who: string; needs: string[] }[]
  xLinkMode: XLinkMode
  today: { top: number; cap: number }
  x: { mode: XMode; posts: number; cap: number; links: number; linkCap: number; polls: number; pollCap: number }
  recent: ShareEntry[]
}

export async function getSocialStatus(): Promise<SocialStatus> {
  const [mode, log] = await Promise.all([getSocialMode(), loadShareLog()])
  const cfg = loadChannelConfig(process.env)
  const on = new Set(configuredChannels(cfg))
  const xToday = xDay(log, new Date(), mode === 'dry')
  return {
    mode,
    channels: ALL_CHANNELS.map((name) => ({ name, configured: on.has(name), who: NEEDS[name].who, needs: NEEDS[name].vars })),
    xLinkMode: cfg.xLinkMode,
    today: { top: chosenToday(log, new Date()), cap: FEED_DAILY_CAP },
    x: { mode: xModeOf(process.env.X_MODE), posts: xToday.posts, cap: xDailyCap(process.env.X_DAILY_CAP), links: xToday.links, linkCap: X_LINK_DAILY_CAP, polls: xToday.polls, pollCap: X_POLL_DAILY_CAP },
    recent: log.slice(0, 8),
  }
}
