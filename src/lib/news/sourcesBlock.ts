/**
 * The sources of an article (further reading, image credit, the "Source:" line) live in one block at
 * the very end of the stored HTML. The article page lifts that block out and shows it small, at the
 * bottom of the page. Pure and unit-tested.
 */

import { isTrustedUrl } from './publishers'

export const SOURCES_CLASS = 'article-sources'

const OPEN = `<div class="${SOURCES_CLASS}">`

/** Wraps the source parts in the marked block. Empty input gives an empty string. */
export function wrapSources(parts: string[]): string {
  const inner = parts.map((p) => p.trim()).filter(Boolean).join('\n')
  return inner ? `${OPEN}\n${inner}\n</div>` : ''
}

// Older articles (before the marked block) end with these pieces, in this order:
// Further reading list, cover image credit, "Source:" line.
const LEGACY_TAIL = [
  /<p>\s*<strong>\s*Source:\s*<\/strong>(?:(?!<\/p>)[\s\S])*<\/p>\s*$/i,
  /<p>\s*<em>\s*Cover image:(?:(?!<\/p>)[\s\S])*<\/p>\s*$/i,
  /<h2>\s*Further reading\s*<\/h2>\s*<ul>(?:(?!<\/ul>)[\s\S])*<\/ul>\s*$/i,
]

/** Splits stored article HTML into the reading body and the sources block ('' when there is none). */
export function splitSources(html: string): { body: string; sources: string } {
  const trimmed = html.trimEnd()
  const start = trimmed.lastIndexOf(OPEN)
  if (start !== -1 && trimmed.endsWith('</div>')) {
    const inner = trimmed.slice(start + OPEN.length, trimmed.length - '</div>'.length).trim()
    return { body: trimmed.slice(0, start).trimEnd(), sources: inner }
  }

  let rest = trimmed
  const found: string[] = []
  for (const re of LEGACY_TAIL) {
    const m = rest.match(re)
    if (!m || m.index === undefined) continue
    found.unshift(m[0].trim())
    rest = rest.slice(0, m.index).trimEnd()
  }
  return found.length > 0 ? { body: rest, sources: found.join('\n') } : { body: html, sources: '' }
}

/**
 * Articles written before 21 Nov 2026 link the first mention of each publisher inside the text.
 * Sources belong at the end only, so those anchors are turned back into plain text when the page
 * is shown (the same links are in the sources block). Only links to trusted publishers are touched.
 */
export function unlinkPublisherLinks(html: string): string {
  return html.replace(/<a\b[^>]*?\bhref=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (full, _q: string, href: string, text: string) =>
    isTrustedUrl(href.replace(/&amp;/g, '&')) ? text : full,
  )
}
