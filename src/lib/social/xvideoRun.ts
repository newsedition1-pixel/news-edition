import 'server-only'
import { and, desc, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { articles, categories } from '@/lib/db/schema'
import { getSocialMode, setSetting, SOCIAL_LOG_KEY } from '@/lib/settings'
import { configuredChannels, loadChannelConfig, sendXVideo } from './channels'
import { addEntry, scrub, type ShareEntry } from './log'
import { loadArticle, loadShareLog } from './share'
import { composeXPost } from './xcopy'
import { X_VIDEO_DAILY_CAP } from './xplan'
import { VIDEO_MAX_AGE_MS, alreadyVideoed, buildSpec, pickVideoRow, videoLogId, videosToday, writeWords, type VideoCandidate, type VideoRow } from './xvideo'
import { askJson, writeXDraft } from './xwriter'

type Gate = { skip: string } | null

async function gate(now: Date, log: ShareEntry[]): Promise<Gate> {
  if ((await getSocialMode()) === 'off') return { skip: 'social posting is off' }
  if (!loadChannelConfig(process.env).x) return { skip: 'X is not set up' }
  if (videosToday(log, now) >= X_VIDEO_DAILY_CAP) return { skip: 'a video already went out today' }
  return null
}

/** The story the next X video is about, with the words for its frames; or the reason there is none. */
export async function videoCandidate(now = new Date()): Promise<{ skip: string } | { candidate: VideoCandidate }> {
  const log = await loadShareLog()
  const blocked = await gate(now, log)
  if (blocked) return blocked
  const rows: VideoRow[] = await db
    .select({
      id: articles.id, slug: articles.slug, title: articles.title, excerpt: articles.excerpt, content: articles.content,
      coverImage: articles.coverImage, publishedAt: articles.publishedAt, categorySlug: categories.slug, categoryName: categories.name,
    })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .where(and(eq(articles.status, 'published'), gte(articles.publishedAt, new Date(now.getTime() - VIDEO_MAX_AGE_MS))))
    .orderBy(desc(articles.publishedAt))
    .limit(40)
  const pick = pickVideoRow(rows, log, now)
  if (!pick) return { skip: 'no recent story with a credited photo and a safe topic' }
  const loaded = await loadArticle(pick.row.id)
  if (!loaded) return { skip: 'article not found' }
  const { words, issues } = await writeWords((m) => askJson(m, 500), loaded.article)
  if (!words) return { skip: `the video text did not pass the checks: ${issues.join(' ')}`.slice(0, 400) }
  return { candidate: { id: pick.row.id, slug: pick.row.slug, title: pick.row.title, spec: buildSpec(pick.row, words, now), photoUrl: pick.photoUrl, photoCredit: pick.credit } }
}

export interface VideoOutcome {
  ok: boolean
  status: number
  message: string
  ref?: string
}

/** Posts the rendered video with its tweet (preview mode only writes the tweet into the log). */
export async function publishVideo(slug: string, bytes: Uint8Array, now = new Date()): Promise<VideoOutcome> {
  try {
    const log = await loadShareLog()
    const blocked = await gate(now, log)
    if (blocked) return { ok: false, status: 200, message: blocked.skip }
    const [found] = await db.select({ id: articles.id }).from(articles).where(and(eq(articles.slug, slug), eq(articles.status, 'published'))).limit(1)
    if (!found) return { ok: false, status: 404, message: 'article not found' }
    if (alreadyVideoed(log, found.id)) return { ok: false, status: 200, message: 'this article already has its video' }
    const loaded = await loadArticle(found.id)
    if (!loaded) return { ok: false, status: 404, message: 'article not found' }

    const cfg = loadChannelConfig(process.env)
    const dry = (await getSocialMode()) === 'dry'
    const { draft } = await writeXDraft(loaded.article, false)
    const post = composeXPost({ article: loaded.article, draft, plan: { format: 'post', link: true, image: false } })
    const secrets = [cfg.x?.consumerKey, cfg.x?.consumerSecret, cfg.x?.token, cfg.x?.tokenSecret].filter((s): s is string => !!s)

    let result: { ok: boolean; ref?: string; error?: string } = { ok: false }
    if (!dry && configuredChannels(cfg).includes('x')) {
      result = await sendXVideo(cfg.x!, { text: post.text, video: { bytes, type: 'video/mp4' } }, { fetch: (url, init) => fetch(url, init) })
      if (result.error) result.error = scrub(result.error, secrets)
    }
    const entry: ShareEntry = {
      id: videoLogId(found.id),
      title: `[video] ${loaded.article.title}`,
      at: now.toISOString(),
      dry,
      top: false,
      reason: 'daily X video',
      results: { x: dry ? { ok: false, skipped: 'preview only' } : result.ok ? { ok: true, ref: result.ref } : { ok: false, error: result.error } },
      x: { format: 'video', link: true, image: false, reason: 'daily video', copy: post.copy },
      ...(dry ? { captions: { x: `${post.text}\n[with video, ${bytes.byteLength} bytes]` } } : {}),
    }
    await setSetting(SOCIAL_LOG_KEY, JSON.stringify(addEntry(await loadShareLog(), entry)))
    if (dry) return { ok: true, status: 200, message: 'preview written to the log' }
    return result.ok ? { ok: true, status: 200, message: 'posted', ref: result.ref } : { ok: false, status: 502, message: result.error ?? 'X did not accept the video' }
  } catch (err) {
    console.error('X video error:', err instanceof Error ? err.message : err)
    return { ok: false, status: 500, message: 'video post failed' }
  }
}
