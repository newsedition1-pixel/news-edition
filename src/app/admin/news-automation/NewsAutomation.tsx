'use client'
import { useMemo, useState } from 'react'
import styles from './NewsAutomation.module.scss'

interface Candidate {
  sourceUrl: string
  title: string
  snippet: string
  source: string | null
  publishedAt: string | null
}

interface ItemResult {
  title: string
  sourceUrl: string
  status: 'published' | 'skipped' | 'failed'
  slug?: string
  imageSource?: 'source' | 'generated' | 'none'
  reason?: string
}

const MAX_ITEMS = 10
const MIN_WORDS = 100
const MAX_WORDS = 4000

export function NewsAutomation({ defaultWordLength }: { defaultWordLength: number }) {
  const [query, setQuery] = useState('')
  const [wordLength, setWordLength] = useState(defaultWordLength)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [randomize, setRandomize] = useState(false)
  const [randomCount, setRandomCount] = useState(3)

  const [finding, setFinding] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ItemResult[] | null>(null)

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
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

  const itemsToProcess = useMemo(() => {
    if (randomize) {
      const shuffled = [...candidates].sort(() => Math.random() - 0.5)
      return shuffled.slice(0, Math.min(randomCount, MAX_ITEMS))
    }
    return candidates.filter((c) => selected.has(c.sourceUrl)).slice(0, MAX_ITEMS)
  }, [randomize, randomCount, candidates, selected])

  const generate = async () => {
    if (itemsToProcess.length === 0) return
    setGenerating(true)
    setError(null)
    setResults(null)
    try {
      const res = await fetch('/api/admin/news-automation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToProcess, wordLength }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to generate'); return }
      setResults(json.results || [])
      // Drop successfully handled candidates from the list.
      const done = new Set<string>((json.results as ItemResult[]).filter((r) => r.status !== 'failed').map((r) => r.sourceUrl))
      setCandidates((prev) => prev.filter((c) => !done.has(c.sourceUrl)))
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
            placeholder="e.g. Indian startups, cricket, technology policy… (leave empty for top headlines)"
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
        <p className={styles.hintNote}>Source: Google News. Articles are AI-rewritten and published live. Duplicates are skipped automatically.</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {message && <div className={styles.notice}>{message}</div>}

      {candidates.length > 0 && (
        <div className={styles.card}>
          <div className={styles.controls}>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={randomize} onChange={(e) => setRandomize(e.target.checked)} />
              Randomize — auto-pick
              <input
                type="number"
                min={1}
                max={Math.min(MAX_ITEMS, candidates.length)}
                value={randomCount}
                onChange={(e) => setRandomCount(Math.max(1, Number(e.target.value) || 1))}
                className={styles.countInput}
                disabled={!randomize}
              />
              of {candidates.length}
            </label>
            <span className={styles.selCount}>
              {randomize ? `${Math.min(randomCount, candidates.length)} will be published` : `${selected.size} selected`}
            </span>
          </div>

          <ul className={`${styles.list} ${randomize ? styles.dim : ''}`}>
            {candidates.map((c) => (
              <li key={c.sourceUrl} className={styles.item}>
                <label className={styles.itemLabel}>
                  <input
                    type="checkbox"
                    checked={selected.has(c.sourceUrl)}
                    onChange={() => toggle(c.sourceUrl)}
                    disabled={randomize}
                  />
                  <span className={styles.itemBody}>
                    <span className={styles.itemTitle}>{c.title}</span>
                    {c.snippet && <span className={styles.itemSnippet}>{c.snippet}</span>}
                    <span className={styles.itemMeta}>
                      {c.source && <span>{c.source}</span>}
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
              {generating ? 'Generating & publishing…' : `Generate & publish (${itemsToProcess.length})`}
            </button>
            {generating && <span className={styles.working}>This can take a while — AI rewrite + image per article.</span>}
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
                    : r.title}
                </span>
                {r.imageSource && r.status === 'published' && (
                  <span className={styles.resImg}>image: {r.imageSource}</span>
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
