'use client'
import { useMemo, useState } from 'react'
import styles from './NewsAutomation.module.scss'

interface Candidate {
  id: string
  title: string
  snippet: string
  score: number
  publisherCount: number
  publishers: string[]
  trendTerm: string | null
  isExplainer: boolean
  publishedAt: string | null
  sources: { name: string; url: string; title: string }[]
}

interface ItemResult {
  title: string
  sourceUrl: string
  status: 'published' | 'draft' | 'skipped' | 'failed'
  id?: number
  slug?: string
  imageSource?: 'commons' | 'publisher' | 'generated' | 'none'
  faqCount?: number
  wordCount?: number
  internalLinks?: number
  externalLinks?: number
  warnings?: string[]
  reason?: string
}

type ImageMode = 'licensed_first' | 'source_first'

const MAX_ITEMS = 6
const MIN_WORDS = 600
const MAX_WORDS = 4000
const MAX_FAQS = 20

export function NewsAutomation({ defaultWordLength, defaultAutoPublish }: { defaultWordLength: number; defaultAutoPublish: boolean }) {
  const [query, setQuery] = useState('')
  const [wordLength, setWordLength] = useState(defaultWordLength)
  const [imageMode, setImageMode] = useState<ImageMode>('licensed_first')
  const [autoPublish, setAutoPublish] = useState(defaultAutoPublish)
  const [faqCount, setFaqCount] = useState(6)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [autoPick, setAutoPick] = useState(false)
  const [autoCount, setAutoCount] = useState(3)

  const [finding, setFinding] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ItemResult[] | null>(null)
  const [failedPublishers, setFailedPublishers] = useState<string[]>([])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const findNews = async () => {
    setFinding(true)
    setError(null)
    setMessage(null)
    setResults(null)
    setCandidates([])
    setSelected(new Set())
    try {
      const res = await fetch('/api/admin/news-automation/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to fetch news'); return }
      setFailedPublishers(Array.isArray(json.failedPublishers) ? json.failedPublishers : [])
      if (!json.candidates?.length) {
        setMessage(json.message || 'No news found for your preference.')
        return
      }
      setCandidates(json.candidates)
    } catch {
      setError('Failed to fetch news')
    } finally {
      setFinding(false)
    }
  }

  // Candidates arrive best-first (confirmed by the most publishers, freshest, trending), so
  // "auto-pick" takes the top of the list.
  const itemsToProcess = useMemo(() => {
    if (autoPick) return candidates.slice(0, Math.min(autoCount, MAX_ITEMS))
    return candidates.filter((c) => selected.has(c.id)).slice(0, MAX_ITEMS)
  }, [autoPick, autoCount, candidates, selected])

  const generate = async () => {
    if (itemsToProcess.length === 0) return
    setGenerating(true)
    setError(null)
    setResults(null)
    try {
      const res = await fetch('/api/admin/news-automation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stories: itemsToProcess.map((c) => ({ title: c.title, sources: c.sources, trendTerm: c.trendTerm })),
          wordLength,
          imageMode,
          autoPublish,
          faqCount,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to generate'); return }
      setResults(json.results || [])
      // Drop stories that now have a draft (or were already covered) from the list.
      const done = new Set<string>(
        (json.results as ItemResult[])
          .filter((r) => r.status === 'published' || r.status === 'draft' || r.reason === 'Already covered')
          .map((r) => r.sourceUrl)
      )
      setCandidates((prev) => prev.filter((c) => !c.sources.some((s) => done.has(s.url))))
      setSelected(new Set())
    } catch {
      setError('Failed to generate')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <label className={styles.label} htmlFor="hint">What kind of news are you looking for?</label>
        <div className={styles.searchRow}>
          <input
            id="hint"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !finding) findNews() }}
            placeholder="e.g. RBI, cricket, Haryana, budget… (leave empty for the top stories)"
            className={styles.input}
            disabled={finding}
          />
          <button type="button" onClick={findNews} className={styles.findBtn} disabled={finding}>
            {finding ? 'Finding…' : 'Find news'}
          </button>
        </div>
        <div className={styles.lengthRow}>
          <label htmlFor="wordLength" className={styles.lengthLabel}>Article length</label>
          <input
            id="wordLength"
            type="number"
            min={MIN_WORDS}
            max={MAX_WORDS}
            step={50}
            value={wordLength}
            onChange={(e) => setWordLength(Math.min(MAX_WORDS, Math.max(MIN_WORDS, Number(e.target.value) || MIN_WORDS)))}
            className={styles.lengthInput}
          />
          <span className={styles.lengthUnit}>words</span>
          {wordLength !== defaultWordLength && <span className={styles.lengthNote}>· becomes the new default on publish</span>}
        </div>

        <div className={styles.optionGrid}>
          <fieldset className={styles.option}>
            <legend className={styles.optionLegend}>Cover image (never left empty)</legend>
            <label className={styles.radio}>
              <input type="radio" name="imageMode" checked={imageMode === 'licensed_first'} onChange={() => setImageMode('licensed_first')} />
              Licensed Wikimedia photo first, else the publisher&apos;s news photo
            </label>
            <label className={styles.radio}>
              <input type="radio" name="imageMode" checked={imageMode === 'source_first'} onChange={() => setImageMode('source_first')} />
              The publisher&apos;s news photo first, else a licensed photo
            </label>
            <p className={styles.radio}>
              If neither exists, a labelled AI illustration is made. The NewsEdition logo is added to every cover.
              Publisher photos are copyrighted. Since 28 Nov 2026 no credit line is added to photos (owner decision); the AI illustration keeps its label.
            </p>
          </fieldset>

          <fieldset className={styles.option}>
            <legend className={styles.optionLegend}>Publishing</legend>
            <label className={styles.radio}>
              <input type="radio" name="publishMode" checked={autoPublish} onChange={() => setAutoPublish(true)} />
              Publish automatically when every check passes
            </label>
            <label className={styles.radio}>
              <input type="radio" name="publishMode" checked={!autoPublish} onChange={() => setAutoPublish(false)} />
              Save as draft for an editor
            </label>
            <p className={styles.radio}>
              An article that needs a human look (for example names that are not in the sources) is always saved as a draft.
              {' '}Your choice is remembered for the next run.
            </p>
          </fieldset>

          <fieldset className={styles.option}>
            <legend className={styles.optionLegend}>FAQs per article</legend>
            <div className={styles.faqRow}>
              <input
                type="number"
                min={0}
                max={MAX_FAQS}
                value={faqCount}
                onChange={(e) => setFaqCount(Math.min(MAX_FAQS, Math.max(0, Math.round(Number(e.target.value)) || 0)))}
                className={styles.lengthInput}
              />
              <span className={styles.lengthUnit}>{faqCount === 0 ? 'no FAQs' : 'FAQs'}</span>
            </div>
          </fieldset>
        </div>

        <p className={styles.hintNote}>
          Stories come from the public feeds of trusted publishers (The Hindu, Indian Express, Hindustan Times, NDTV, Times of India,
          India Today, Scroll, BBC, Al Jazeera). The AI works from the full text of up to three reports, never from a headline alone. An
          article that fails the fact, copy or 600-word check is skipped, not saved. Duplicates are skipped automatically.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.notice}>{message}</div>}
      {failedPublishers.length > 0 && (
        <div className={styles.notice}>Could not load right now: {failedPublishers.join(', ')}. The other publishers were used.</div>
      )}

      {candidates.length > 0 && (
        <div className={styles.card}>
          <div className={styles.controls}>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={autoPick} onChange={(e) => setAutoPick(e.target.checked)} />
              Auto-pick the top
              <input
                type="number"
                min={1}
                max={Math.min(MAX_ITEMS, candidates.length)}
                value={autoCount}
                onChange={(e) => setAutoCount(Math.max(1, Number(e.target.value) || 1))}
                className={styles.countInput}
                disabled={!autoPick}
              />
              of {candidates.length}
            </label>
            <span className={styles.selCount}>
              {autoPick ? `${Math.min(autoCount, candidates.length, MAX_ITEMS)} will be processed` : `${selected.size} selected (max ${MAX_ITEMS})`}
            </span>
          </div>

          <ul className={`${styles.list} ${autoPick ? styles.dim : ''}`}>
            {candidates.map((c) => (
              <li key={c.id} className={styles.item}>
                <label className={styles.itemLabel}>
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    disabled={autoPick}
                  />
                  <span className={styles.itemBody}>
                    <span className={styles.itemTitle}>{c.title}</span>
                    {c.snippet && <span className={styles.itemSnippet}>{c.snippet}</span>}
                    <span className={styles.itemMeta}>
                      <span>{c.publisherCount > 1 ? `Confirmed by ${c.publisherCount} publishers: ${c.publishers.join(', ')}` : c.publishers[0]}</span>
                      {c.trendTerm && <span>· Trending: {c.trendTerm}</span>}
                      {c.isExplainer && <span>· Explainer</span>}
                      {c.publishedAt && <span>· {new Date(c.publishedAt).toLocaleString('en-IN')}</span>}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={generate}
              className={styles.generateBtn}
              disabled={generating || itemsToProcess.length === 0}
            >
              {generating
                ? (autoPublish ? 'Generating and publishing…' : 'Generating drafts…')
                : `${autoPublish ? 'Generate and publish' : 'Generate drafts'} (${itemsToProcess.length})`}
            </button>
            {generating && <span className={styles.working}>This takes a minute or two per article: reading the full reports, writing, fact-checking, finding an image.</span>}
          </div>
        </div>
      )}

      {results && (
        <div className={styles.card}>
          <h2 className={styles.resultsTitle}>Results</h2>
          <ul className={styles.results}>
            {results.map((r, i) => (
              <li key={i} className={styles[`res_${r.status}`]}>
                <span className={styles.resBadge}>{r.status}</span>
                <span className={styles.resTitle}>
                  {r.status === 'published' && r.slug
                    ? <a href={`/article/${r.slug}`} target="_blank" rel="noopener noreferrer">{r.title}</a>
                    : r.status === 'draft' && r.id
                    ? <a href={`/admin/articles/${r.id}/edit`} target="_blank" rel="noopener noreferrer">{r.title}</a>
                    : r.title}
                </span>
                {(r.status === 'published' || r.status === 'draft') && (
                  <span className={styles.resImg}>
                    {r.wordCount} words · {r.internalLinks ?? 0} internal / {r.externalLinks ?? 0} external links · {r.faqCount ?? 0} FAQs · image: {r.imageSource}
                  </span>
                )}
                {(r.status === 'published' || r.status === 'draft') && r.warnings && r.warnings.length > 0 && (
                  <span className={styles.resReason}>Check: {r.warnings.join(' ')}</span>
                )}
                {r.reason && <span className={styles.resReason}>{r.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
