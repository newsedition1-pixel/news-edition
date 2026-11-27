import 'server-only'
import { and, desc, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { articles, categories } from '@/lib/db/schema'
import { getSocialMode, setSetting, SOCIAL_LOG_KEY } from '@/lib/settings'
import { configuredChannels, loadChannelConfig, sendXVideo } from './channels'
import { addEntry, scrub, type ShareEntry } from './log'
import { loadArticle, loadShareLog } from './share'
import { composeXPost } from './xcopy'
import { X_VIDEO_DAILY_CAP, xModeOf } from './xplan'
import { VIDEO_MAX_AGE_MS, alreadyVideoed, buildSpec, hindiScript, hindiWordCounts, pickVideoRows, videoLogId, videosToday, voiceScript, writeHindi, writeWords, type VideoCandidate, type VideoRow } from './xvideo'
import { TTS_STYLE_HINDI, askJson, speak, writeXDraft } from './xwriter'

/** Language of the narration: Hindi by default (the text on the frames stays English); X_VIDEO_VOICE=en reads the English frame text instead. */
const HINDI_VOICE = process.env.X_VIDEO_VOICE !== 'en'

type Gate = { skip: string } | null

async function gate(now: Date, log: ShareEntry[], test = false): Promise<Gate> {
  if ((await getSocialMode()) === 'off') return { skip: 'social posting is off' }
  if (!loadChannelConfig(process.env).x) return { skip: 'X is not set up' }
  // Breaking-news mode (the default since 27 Nov 2026): X gets breaking news only, so no daily video. A test run still renders.
  if (!test && xModeOf(process.env.X_MODE) === 'breaking') return { skip: 'X posts breaking news only (X_MODE=breaking), so there is no daily video' }
  // A test run (workflow started by hand with "test") only renders the video and posts nothing, so the daily limit does not apply.
  if (!test && videosToday(log, now) >= X_VIDEO_DAILY_CAP) return { skip: 'a video already went out today' }
  return null
}

/** The story the next X video is about, with the words for its frames; or the reason there is none. */
export async function videoCandidate(now = new Date(), opts: { test?: boolean } = {}): Promise<{ skip: string } | { candidate: VideoCandidate }> {
  const log = await loadShareLog()
  const blocked = await gate(now, log, opts.test)
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
  const picks = pickVideoRows(rows, log, now)
  if (picks.length === 0) return { skip: 'no recent story with a credited photo and a safe topic' }
  // The first story whose on-screen text passes the checks; the next one is tried when it does not
  // (22 Nov 2026: the only story tried had a 57-character headline, so no video went out that day).
  let failed = 'article not found'
  for (const pick of picks) {
    const loaded = await loadArticle(pick.row.id)
    if (!loaded) continue
    const { words, issues } = await writeWords((m) => askJson(m, 500), loaded.article)
    if (!words) {
      failed = `the video text did not pass the checks: ${issues.join(' ')}`
      continue
    }
    // The narration: the same four facts as the frame text, in Hindi (22 Nov 2026: English text, Hindi voice). When the Hindi does
    // not pass its checks the English frame text is read instead. No voice (no key, a failed call) is not an error: the video then has music only.
    const hindi = HINDI_VOICE ? await writeHindi((m) => askJson(m, 900), words) : { lines: null, issues: [] as string[] }
    if (HINDI_VOICE && !hindi.lines) console.log(`X video Hindi narration rejected, reading the English text: ${hindi.issues.join(' ')}`)
    const text = hindi.lines ? hindiScript(hindi.lines) : voiceScript(words)
    const audio = await speak(text, hindi.lines ? TTS_STYLE_HINDI : undefined)
    const voice = audio ? { mp3Base64: Buffer.from(audio).toString('base64'), text, ...(hindi.lines ? { lang: 'hi' as const, words: hindiWordCounts(hindi.lines) } : { lang: 'en' as const }) } : undefined
    console.log(`X video voice: ${voice ? `${audio!.byteLength} bytes, ${voice.lang}` : 'none (music only)'}`)
    return { candidate: { id: pick.row.id, slug: pick.row.slug, title: pick.row.title, spec: buildSpec(pick.row, words, now), photoUrl: pick.photoUrl, photoCredit: pick.credit, ...(voice ? { voice } : {}) } }
  }
  return { skip: failed.slice(0, 400) }
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
