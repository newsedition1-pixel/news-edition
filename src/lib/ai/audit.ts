import 'server-only'
import type { LlmFindings } from '@/lib/news/audit'
import { buildAuditSystemPrompt, buildAuditUserPrompt, parseAuditJson, type AuditPromptInput } from './auditPrompt'
import { isReasoningModel } from './openai'

const AUDIT_MODEL = process.env.OPENAI_AUDIT_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini'
const TIMEOUT_MS = 45_000
/** Reports are long; the audit needs the facts, not every word of a very long page. */
const MAX_REPORT_CHARS = 9000

/**
 * The claim-by-claim pass. Returns null when it fails for any reason (no key, timeout, bad JSON):
 * the code checks still run, and publishing never stops because the audit model was unavailable.
 */
export async function runLlmAudit(input: AuditPromptInput): Promise<LlmFindings | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  const trimmed: AuditPromptInput = { ...input, reports: input.reports.map((r) => ({ ...r, text: r.text.slice(0, MAX_REPORT_CHARS) })) }
  const params = isReasoningModel(AUDIT_MODEL) ? { max_completion_tokens: 9000, reasoning_effort: 'low' } : { temperature: 0.1, max_tokens: 2500 }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: AUDIT_MODEL,
        messages: [
          { role: 'system', content: buildAuditSystemPrompt() },
          { role: 'user', content: buildAuditUserPrompt(trimmed) },
        ],
        response_format: { type: 'json_object' },
        ...params,
      }),
    })
    if (!res.ok) {
      console.error(`Audit model failed (${res.status})`)
      return null
    }
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content
    if (!raw || data.choices?.[0]?.finish_reason === 'length') return null
    return parseAuditJson(raw)
  } catch (err) {
    console.error('Audit model error:', err instanceof Error ? err.message : err)
    return null
  } finally {
    clearTimeout(timer)
  }
}
