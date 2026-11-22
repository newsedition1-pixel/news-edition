import 'server-only'
import { isReasoningModel } from '@/lib/ai/openai'
import type { ArticleForSocial } from './compose'
import { writeDraft, type Message, type XDraft } from './xcopy'

/** The model for tweets and replies. Short, checked text: a small model is enough and cheap. */
export const X_MODEL = process.env.OPENAI_X_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini'

/** One JSON answer from the chat model, or null when there is no key, the call fails or it takes too long. Never throws. */
export async function askJson(messages: Message[], maxTokens = 450): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  try {
    const params = isReasoningModel(X_MODEL)
      ? { max_completion_tokens: maxTokens + 3000, reasoning_effort: 'low' }
      : { temperature: 0.7, presence_penalty: 0.2, max_tokens: maxTokens }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: X_MODEL, messages, response_format: { type: 'json_object' }, ...params }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] }
    return data.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

/** The checked hook-and-fact copy (and poll, when asked) for one article; `draft` is null when nothing passed the checks. */
export async function writeXDraft(article: ArticleForSocial, wantPoll: boolean): Promise<{ draft: XDraft | null; issues: string[] }> {
  return writeDraft((messages) => askJson(messages), article, wantPoll)
}

/** The narrator of the X video. Model and voice can be changed in Vercel (OPENAI_TTS_MODEL, OPENAI_TTS_VOICE). */
export const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'
export const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'onyx'
const TTS_STYLE = 'A calm, clear Indian news presenter. Neutral, factual tone, moderate pace, short natural pauses between sentences.'

/** The text read aloud as an MP3, or null when there is no key, the call fails or it takes too long. Never throws. */
export async function speak(text: string): Promise<Uint8Array | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key || !text.trim() || text.length > 1500) return null
  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      // `instructions` exists on the gpt-4o TTS models only; tts-1 would reject it.
      body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input: text, response_format: 'mp3', ...(/^gpt-4o/i.test(TTS_MODEL) ? { instructions: TTS_STYLE } : {}) }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) {
      console.warn('X video voice: speech request failed', res.status)
      return null
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    return bytes.byteLength > 2000 ? bytes : null
  } catch (err) {
    console.warn('X video voice: speech request error', err instanceof Error ? err.message : err)
    return null
  }
}
