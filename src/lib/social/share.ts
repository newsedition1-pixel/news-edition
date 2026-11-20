import 'server-only'
import { db } from '@/lib/db'
import { articles, categories } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSetting, getSocialMode, setSetting, SOCIAL_LOG_KEY, type SocialMode } from '@/lib/settings'
import { composeAll, webhookPayload, type ArticleForSocial } from './compose'
import { configuredChannels, loadChannelConfig, secretsOf, sendFacebook, sendInstagram, sendTelegram, sendWebhook, sendX, type ChannelName, type SendResult, type XLinkMode } from './channels'
import { FEED_DAILY_CAP, feedDecision } from './policy'
import { addEntry, alreadyShared, chosenToday, lastChosenAt, parseLog, scrub, type ChannelResult, type ShareEntry } from './log'

export const ALL_CHANNELS: ChannelName[] = ['telegram', 'x', 'facebook', 'instagram', 'webhook']

export async function loadShareLog(): Promise<ShareEntry[]> {
  return parseLog(await getSetting(SOCIAL_LOG_KEY))
}

async function loadArticle(id: number): Promise<{ article: ArticleForSocial; published: boolean } | null> {
  const [row] = await db
    .select({
      title: articles.title,
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

/**
 * Shares one published article on every configured platform, according to the mode set in Admin >
 * News Automation (off by default). Telegram and X get every article; Instagram and Facebook get
 * the few top stories of the day (lib/social/policy.ts). `strength` is how many trusted
 * publishers carried the story; leave it out for an article an editor published by hand.
 * Never throws: a failure here must not undo a published article.
 */
export async function shareArticle(id: number, opts: { strength?: number } = {}): Promise<ShareEntry | null> {
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

    const results: Record<string, ChannelResult> = {}
    const deps = { fetch: (url: string, init?: RequestInit) => fetch(url, init) }
    const notTop = `not a top story (${decision.reason})`
    // What each configured platform would do. `skip` is a reason to send nothing there.
    const plans: { name: ChannelName; skip: string | null; send: () => Promise<SendResult> }[] = []
    if (cfg.telegram) plans.push({ name: 'telegram', skip: null, send: () => sendTelegram(cfg.telegram!, set.telegram, deps) })
    if (cfg.x) plans.push({ name: 'x', skip: null, send: () => sendX(cfg.x!, set.x, deps) })
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
      else jobs.push(p.send().then((r) => { results[p.name] = r.ok ? { ok: true, ref: r.ref } : { ok: false, error: r.error } }))
    }

    await Promise.all(jobs)

    const secrets = secretsOf(cfg)
    for (const r of Object.values(results)) if (r.error) r.error = scrub(r.error, secrets)

    const entry: ShareEntry = {
      id,
      title: article.title,
      at: now.toISOString(),
      dry,
      top: decision.top,
      reason: decision.reason,
      results,
      ...(dry
        ? { captions: { telegram: set.telegram.text, x: set.x.text, facebook: set.facebook.text, instagram: set.instagram.text } }
        : {}),
    }
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
  x: { who: 'every article', vars: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'] },
  facebook: { who: 'top stories', vars: ['META_PAGE_ACCESS_TOKEN', 'FACEBOOK_PAGE_ID'] },
  instagram: { who: 'top stories', vars: ['META_PAGE_ACCESS_TOKEN', 'INSTAGRAM_ACCOUNT_ID'] },
  webhook: { who: 'every article, marked top or not', vars: ['SOCIAL_WEBHOOK_URL'] },
}

export interface SocialStatus {
  mode: SocialMode
  channels: { name: ChannelName; configured: boolean; who: string; needs: string[] }[]
  xLinkMode: XLinkMode
  today: { top: number; cap: number }
  recent: ShareEntry[]
}

export async function getSocialStatus(): Promise<SocialStatus> {
  const [mode, log] = await Promise.all([getSocialMode(), loadShareLog()])
  const cfg = loadChannelConfig(process.env)
  const on = new Set(configuredChannels(cfg))
  return {
    mode,
    channels: ALL_CHANNELS.map((name) => ({ name, configured: on.has(name), who: NEEDS[name].who, needs: NEEDS[name].vars })),
    xLinkMode: cfg.xLinkMode,
    today: { top: chosenToday(log, new Date()), cap: FEED_DAILY_CAP },
    recent: log.slice(0, 8),
  }
}
