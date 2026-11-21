import 'server-only'
import { getSetting, getSocialMode, setSetting, X_REPLY_DESK_KEY, X_REPLY_STATE_KEY } from '@/lib/settings'
import { loadChannelConfig, secretsOf } from './channels'
import { scrub } from './log'
import { getMe, getMentions, postReply, searchRecent } from './xread'
import {
  ANSWER_DAILY_CAP, DESK_MAX_ITEMS, DESK_REFRESH_GAP_MS, deskDue, deskQuery, mayAnswerNow, mergeDesk, parseState, rankDeskTweets, rollDay,
  skipReason, targetsOf, writeAnswer, writeDeskDraft, type DeskItem, type ReplyLogEntry, type ReplyState,
} from './xreplies'
import { askJson } from './xwriter'

/** A run within this time of the last one does nothing: the news schedule calls every 30 minutes, an outside cron may too. */
const RUN_GAP_MS = 25 * 60 * 1000
/** Answers sent in one run; the daily cap and the gap since the last answer apply on top. */
const ANSWERS_PER_RUN = 2
/** In preview mode nothing is sent, so only a few drafts are written per run. */
const DRY_DRAFTS_PER_RUN = 3
const LOG_MAX = 40
const RECENT_MAX = 20

export interface InboxOutcome {
  ran: boolean
  message: string
}

function parseDesk(raw: string | null): DeskItem[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? (v as DeskItem[]).filter((i) => i && typeof i.id === 'string' && typeof i.username === 'string') : []
  } catch {
    return []
  }
}

export async function loadReplyState(now = new Date()): Promise<ReplyState> {
  return rollDay(parseState(await getSetting(X_REPLY_STATE_KEY), now), now)
}

export async function loadDesk(): Promise<DeskItem[]> {
  return parseDesk(await getSetting(X_REPLY_DESK_KEY))
}

/** The admin's "done" and "skip" buttons. Reads the current desk, so a refresh that just ran is not overwritten. */
export async function markDesk(id: string, status: 'done' | 'skipped'): Promise<DeskItem[]> {
  const desk = await loadDesk()
  const next = desk.map((i) => (i.id === id ? { ...i, status } : i))
  await setSetting(X_REPLY_DESK_KEY, JSON.stringify(next))
  return next
}

const repliesOff = () => (process.env.X_REPLIES ?? '').trim().toLowerCase() === 'off'

/**
 * Two jobs, both from the news schedule's cron call, both safe to repeat:
 * 1. Answer-back: a short, checked answer to people who replied to or mentioned the account (the only
 *    case the X API allows an automated reply to), at most ANSWER_DAILY_CAP a day, one per person per day.
 *    Preview mode writes the answers into the log and sends nothing.
 * 2. Reply desk: a few times a day, fresh posts of the target accounts with a draft reply for a person to
 *    post by hand (X forbids automated unsolicited replies). The desk only reads and drafts.
 * Never throws; a failed step is written to the log and the next step still runs.
 */
export async function runXInbox(opts: { force?: boolean; deskNow?: boolean; now?: Date } = {}): Promise<InboxOutcome> {
  const now = opts.now ?? new Date()
  try {
    if (repliesOff()) return { ran: false, message: 'replies are switched off (X_REPLIES=off)' }
    const mode = await getSocialMode()
    if (mode === 'off') return { ran: false, message: 'social posting is off' }
    const cfg = loadChannelConfig(process.env)
    if (!cfg.x) return { ran: false, message: 'X is not set up' }
    const xKeys = cfg.x
    const secrets = secretsOf(cfg)
    const deps = { fetch: (url: string, init?: RequestInit) => fetch(url, init) }

    let state = await loadReplyState(now)
    if (!opts.force && !opts.deskNow && state.runAt && now.getTime() - new Date(state.runAt).getTime() < RUN_GAP_MS) {
      return { ran: false, message: 'ran a moment ago' }
    }
    // Claim the run first, so a second caller that arrives while this one works sees it.
    state = { ...state, runAt: now.toISOString() }
    await setSetting(X_REPLY_STATE_KEY, JSON.stringify(state))

    const notes: string[] = []
    const add = (e: Omit<ReplyLogEntry, 'at'>) => {
      state = { ...state, log: [{ at: now.toISOString(), ...e, error: e.error ? scrub(e.error, secrets) : undefined }, ...state.log].slice(0, LOG_MAX) }
    }

    if (!state.myId || !state.myUsername) {
      const me = await getMe(xKeys, deps)
      if (typeof me === 'string') {
        notes.push(`account lookup failed: ${scrub(me, secrets)}`)
      } else {
        state = { ...state, myId: me.id, myUsername: me.username }
      }
    }

    // ── 1. answer-back ──
    const myId = state.myId
    const myUsername = state.myUsername
    if (!opts.deskNow && myId && myUsername) {
      const read = await getMentions(xKeys, deps, myId, state.sinceId)
      if (typeof read === 'string') {
        notes.push(`mentions not read: ${scrub(read, secrets)}`)
      } else {
        if (read.newestId) state = { ...state, sinceId: read.newestId }
        let sent = 0
        let drafted = 0
        for (const m of read.mentions) {
          const dry = mode === 'dry'
          if (dry ? drafted >= DRY_DRAFTS_PER_RUN : sent >= ANSWERS_PER_RUN) break
          if (skipReason(m, state, now, myUsername)) continue
          // The gap between answers is judged once per run (before the first answer of this run).
          const wait = dry ? null : sent === 0 ? mayAnswerNow(state, now) : state.answered >= ANSWER_DAILY_CAP ? 'daily limit reached' : null
          if (wait) {
            notes.push(wait)
            break
          }
          const text = await writeAnswer((msgs) => askJson(msgs, 200), m, state.recent)
          if (!text) continue
          if (dry) {
            drafted++
            add({ to: m.username, text, dry: true, ok: true })
            continue
          }
          const res = await postReply(xKeys, deps, text, m.id)
          if (res.ok) {
            sent++
            state = {
              ...state,
              answered: state.answered + 1,
              lastAnswerAt: now.toISOString(),
              users: { ...state.users, [m.username.toLowerCase()]: state.day },
              recent: [text, ...state.recent].slice(0, RECENT_MAX),
            }
            add({ to: m.username, text, dry: false, ok: true })
          } else {
            add({ to: m.username, text, dry: false, ok: false, error: res.error })
            notes.push(`answer to @${m.username} failed`)
            if (/credits/i.test(res.error ?? '')) break
          }
        }
        notes.push(mode === 'dry' ? `${drafted} answer(s) drafted` : `${sent} answer(s) sent`)
      }
    }

    // ── 2. reply desk ──
    if (opts.deskNow || deskDue(state.deskAt, now)) {
      const found = await searchRecent(xKeys, deps, deskQuery(targetsOf(process.env.X_REPLY_TARGETS)))
      if (typeof found === 'string') {
        notes.push(`desk not refreshed: ${scrub(found, secrets)}`)
        // Try again in about half an hour instead of waiting the whole gap.
        state = { ...state, deskAt: new Date(now.getTime() - DESK_REFRESH_GAP_MS + 30 * 60 * 1000).toISOString() }
      } else {
        const existing = await loadDesk()
        const fresh: DeskItem[] = []
        for (const t of rankDeskTweets(found, existing, now)) {
          const draft = await writeDeskDraft((msgs) => askJson(msgs, 200), t)
          if (!draft) continue
          fresh.push({ id: t.id, username: t.username, name: t.name, text: t.text, createdAt: t.createdAt, url: `https://x.com/${t.username}/status/${t.id}`, draft, status: 'new' })
        }
        // Read again right before writing, so a "done" click made while the drafts were written is kept.
        await setSetting(X_REPLY_DESK_KEY, JSON.stringify(mergeDesk(await loadDesk(), fresh, now).slice(0, DESK_MAX_ITEMS)))
        state = { ...state, deskAt: now.toISOString() }
        notes.push(`desk: ${fresh.length} new draft(s) from ${found.length} post(s)`)
      }
    }

    await setSetting(X_REPLY_STATE_KEY, JSON.stringify(state))
    return { ran: true, message: notes.join('; ') || 'nothing to do' }
  } catch (error) {
    console.error('X inbox error:', error)
    return { ran: false, message: 'the reply run failed' }
  }
}

export interface ReplyStatus {
  mode: 'off' | 'dry' | 'on'
  repliesOff: boolean
  answered: number
  cap: number
  lastRunAt: string | null
  deskAt: string | null
  targets: string[]
  desk: DeskItem[]
  log: ReplyLogEntry[]
}

export async function getReplyStatus(now = new Date()): Promise<ReplyStatus> {
  const [mode, state, desk] = await Promise.all([getSocialMode(), loadReplyState(now), loadDesk()])
  return {
    mode,
    repliesOff: repliesOff(),
    answered: state.answered,
    cap: ANSWER_DAILY_CAP,
    lastRunAt: state.runAt ?? null,
    deskAt: state.deskAt ?? null,
    targets: targetsOf(process.env.X_REPLY_TARGETS),
    desk: desk.filter((i) => i.status === 'new'),
    log: state.log,
  }
}
