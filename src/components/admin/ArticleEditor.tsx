'use client'
import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { RichTextEditor } from './RichTextEditor'
import styles from './ArticleEditor.module.scss'
import type { Category } from '@/lib/db/schema'

interface ArticleEditorProps {
  articleId?: number
  initialData?: {
    title: string
    slug: string
    content: string
    excerpt: string
    coverImage: string | null
    coverImageAlt: string
    coverImagePublicId: string | null
    categoryId: number | null
    status: string
    isFeatured: boolean
    isBreaking: boolean
    tags: string[]
    faqs: { question: string; answer: string }[]
    seoTitle: string
    seoDescription: string
    publishedAt: string | null
  }
  categories: Category[]
}

const DEFAULT_DATA = {
  title: '', slug: '', content: '', excerpt: '',
  coverImage: null as string | null, coverImageAlt: '', coverImagePublicId: null as string | null,
  categoryId: null as number | null, status: 'draft', isFeatured: false, isBreaking: false,
  tags: [] as string[], faqs: [] as { question: string; answer: string }[],
  seoTitle: '', seoDescription: '', publishedAt: null as string | null,
}

function slugify(text: string) {
  return text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '')
}

export function ArticleEditor({ articleId, initialData, categories }: ArticleEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [data, setData] = useState({ ...DEFAULT_DATA, ...initialData })
  const [tagInput, setTagInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [slugManual, setSlugManual] = useState(!!articleId)

  const set = useCallback(<K extends keyof typeof DEFAULT_DATA>(key: K, value: typeof DEFAULT_DATA[K]) => {
    setData((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value
    set('title', title)
    if (!slugManual) set('slug', slugify(title))
  }

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugManual(true)
    set('slug', e.target.value)
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const tag = tagInput.trim().toLowerCase()
      if (!data.tags.includes(tag)) set('tags', [...data.tags, tag])
      setTagInput('')
    }
    if (e.key === 'Backspace' && !tagInput && data.tags.length > 0) {
      set('tags', data.tags.slice(0, -1))
    }
  }

  const removeTag = (tag: string) => set('tags', data.tags.filter((t) => t !== tag))

  const addFaq = () => set('faqs', [...data.faqs, { question: '', answer: '' }])
  const removeFaq = (index: number) => set('faqs', data.faqs.filter((_, i) => i !== index))
  const updateFaq = (index: number, key: 'question' | 'answer', value: string) => {
    set('faqs', data.faqs.map((f, i) => (i === index ? { ...f, [key]: value } : f)))
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('folder', 'newsedition/covers')
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      set('coverImage', json.url)
      set('coverImagePublicId', json.publicId)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const removeCover = () => {
    set('coverImage', null)
    set('coverImagePublicId', null)
    set('coverImageAlt', '')
  }

  const save = async (targetStatus?: string) => {
    setSaveError('')
    const payload = { ...data, status: targetStatus ?? data.status }

    startTransition(async () => {
      try {
        const url = articleId ? `/api/articles/${articleId}` : '/api/articles'
        const method = articleId ? 'PATCH' : 'POST'
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Save failed')

        if (targetStatus === 'published') {
          router.push('/admin/articles?status=published')
        } else {
          router.push(`/admin/articles/${json.id}/edit`)
          router.refresh()
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  const wordCount = data.content.replace(/<[^>]+>/g, '').trim().split(/\s+/).filter(Boolean).length

  return (
    <div className={styles.editor}>
      <div className={styles.main}>
        {/* Title */}
        <div className={styles.field}>
          <input
            type="text"
            placeholder="Article title…"
            value={data.title}
            onChange={handleTitleChange}
            className={styles.titleInput}
            maxLength={500}
          />
        </div>

        {/* Slug */}
        <div className={styles.slugRow}>
          <span className={styles.slugLabel}>slug:</span>
          <input
            type="text"
            value={data.slug}
            onChange={handleSlugChange}
            placeholder="auto-generated"
            className={styles.slugInput}
          />
        </div>

        {/* Cover Image */}
        <div className={styles.coverSection}>
          {data.coverImage ? (
            <div className={styles.coverPreview}>
              <Image src={data.coverImage} alt={data.coverImageAlt || 'Cover'} fill style={{ objectFit: 'cover' }} />
              <button type="button" className={styles.removeCover} onClick={removeCover} title="Remove image">✕</button>
            </div>
          ) : (
            <label className={`${styles.coverUpload} ${uploading ? styles.uploading : ''}`}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>{uploading ? 'Uploading…' : 'Upload cover image'}</span>
              <small>JPG, PNG, WebP · Max 10MB</small>
              <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} style={{ display: 'none' }} />
            </label>
          )}
          {uploadError && <p className={styles.error}>{uploadError}</p>}
          {data.coverImage && (
            <input
              type="text"
              placeholder="Image alt text (for accessibility & SEO)"
              value={data.coverImageAlt}
              onChange={(e) => set('coverImageAlt', e.target.value)}
              className={styles.altInput}
            />
          )}
        </div>

        {/* Rich Text Editor */}
        <div className={styles.field}>
          <RichTextEditor
            content={data.content}
            onChange={(html) => set('content', html)}
            placeholder="Write your article content here…"
          />
          <div className={styles.wordCount}>{wordCount} words</div>
        </div>

        {/* Excerpt */}
        <div className={styles.field}>
          <label className={styles.label}>Excerpt</label>
          <textarea
            value={data.excerpt}
            onChange={(e) => set('excerpt', e.target.value)}
            placeholder="Brief summary shown in article cards (auto-generated if empty)"
            className={styles.textarea}
            rows={3}
            maxLength={500}
          />
          <div className={styles.charCount}>{data.excerpt.length}/500</div>
        </div>

        {/* SEO */}
        <details className={styles.seoSection}>
          <summary className={styles.seoToggle}>SEO Settings</summary>
          <div className={styles.seoFields}>
            <div className={styles.field}>
              <label className={styles.label}>SEO Title <small>(overrides article title in search results)</small></label>
              <input
                type="text"
                value={data.seoTitle}
                onChange={(e) => set('seoTitle', e.target.value)}
                placeholder={data.title || 'SEO title…'}
                className={styles.input}
                maxLength={200}
              />
              <div className={styles.charCount}>{data.seoTitle.length}/200</div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>SEO Description <small>(shown in search results)</small></label>
              <textarea
                value={data.seoDescription}
                onChange={(e) => set('seoDescription', e.target.value)}
                placeholder={data.excerpt || 'Meta description for search engines…'}
                className={styles.textarea}
                rows={3}
                maxLength={300}
              />
              <div className={styles.charCount}>{data.seoDescription.length}/300</div>
            </div>
          </div>
        </details>

        {/* FAQ */}
        <details className={styles.seoSection} open={data.faqs.length > 0}>
          <summary className={styles.seoToggle}>FAQ ({data.faqs.length})</summary>
          <div className={styles.seoFields}>
            <p className={styles.hint}>
              Shown at the end of the article and emitted as FAQPage structured data for search engines and AI answers.
            </p>
            {data.faqs.map((faq, i) => (
              <div key={i} className={styles.faqItem}>
                <div className={styles.faqHeader}>
                  <label className={styles.label}>FAQ {i + 1}</label>
                  <button type="button" className={styles.faqRemove} onClick={() => removeFaq(i)} title="Remove FAQ">✕</button>
                </div>
                <input
                  type="text"
                  value={faq.question}
                  onChange={(e) => updateFaq(i, 'question', e.target.value)}
                  placeholder="Question…"
                  className={styles.input}
                  maxLength={300}
                />
                <textarea
                  value={faq.answer}
                  onChange={(e) => updateFaq(i, 'answer', e.target.value)}
                  placeholder="Answer…"
                  className={styles.textarea}
                  rows={3}
                  maxLength={2000}
                />
              </div>
            ))}
            <button type="button" className={styles.addFaqBtn} onClick={addFaq} disabled={data.faqs.length >= 20}>
              + Add FAQ
            </button>
          </div>
        </details>
      </div>

      {/* Sidebar */}
      <div className={styles.sidebar}>
        {/* Actions */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Publish</h3>
          <div className={styles.statusRow}>
            <label className={styles.label}>Status</label>
            <select value={data.status} onChange={(e) => set('status', e.target.value)} className={styles.select}>
              <option value="draft">Draft</option>
              <option value="preview">Preview</option>
              <option value="published">Published</option>
            </select>
          </div>
          {data.status === 'published' && (
            <div className={styles.field}>
              <label className={styles.label}>Publish Date</label>
              <input
                type="datetime-local"
                value={data.publishedAt?.slice(0, 16) || ''}
                onChange={(e) => set('publishedAt', e.target.value)}
                className={styles.input}
              />
            </div>
          )}
          {saveError && <p className={styles.error}>{saveError}</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.draftBtn} onClick={() => save('draft')} disabled={isPending}>
              Save Draft
            </button>
            <button type="button" className={styles.previewBtn} onClick={() => save('preview')} disabled={isPending}>
              Save Preview
            </button>
            <button type="button" className={styles.publishBtn} onClick={() => save('published')} disabled={isPending || !data.title.trim()}>
              {isPending ? 'Saving…' : 'Publish'}
            </button>
          </div>
          {articleId && (
            <a href={`/admin/articles/${articleId}/preview`} target="_blank" rel="noopener noreferrer" className={styles.previewLink}>
              Open preview ↗
            </a>
          )}
        </div>

        {/* Category */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Category</h3>
          <select
            value={data.categoryId ?? ''}
            onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : null)}
            className={styles.select}
          >
            <option value="">No category</option>
            {categories.filter((c) => !c.parentId).map((parent) => {
              const children = categories.filter((c) => c.parentId === parent.id)
              return children.length > 0 ? (
                <optgroup key={parent.id} label={parent.name}>
                  <option value={parent.id}>{parent.name}</option>
                  {children.map((sub) => (
                    <option key={sub.id} value={sub.id}>— {sub.name}</option>
                  ))}
                </optgroup>
              ) : (
                <option key={parent.id} value={parent.id}>{parent.name}</option>
              )
            })}
            {categories.filter((c) => c.parentId && !categories.find((p) => p.id === c.parentId)).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Tags</h3>
          <div className={styles.tagInput}>
            {data.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
                <button type="button" onClick={() => removeTag(tag)}>✕</button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="Add tag…"
              className={styles.tagTextInput}
            />
          </div>
          <small className={styles.hint}>Press Enter or comma to add</small>
        </div>

        {/* Options */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Options</h3>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={data.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} />
            Featured Article
          </label>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={data.isBreaking} onChange={(e) => set('isBreaking', e.target.checked)} />
            Breaking News
          </label>
        </div>
      </div>
    </div>
  )
}
