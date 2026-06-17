'use client'
import { useState, useRef, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { formatBytes } from '@/lib/utils'
import styles from './AssetsManager.module.scss'
import type { Asset } from '@/lib/db/schema'

export interface AssetUsage {
  id: number
  title: string
  status: string
  inCover: boolean
  inContent: boolean
}

interface Props {
  assets: Asset[]
  usage: Record<number, AssetUsage[]>
}

type Filter = 'all' | 'used' | 'unused'

export function AssetsManager({ assets: initialAssets, usage }: Props) {
  const [assets, setAssets] = useState(initialAssets)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [copied, setCopied] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [selected, setSelected] = useState<Asset | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const inputRef = useRef<HTMLInputElement>(null)

  const usageFor = (asset: Asset): AssetUsage[] => usage[asset.id] ?? []

  const visibleAssets = useMemo(() => {
    if (filter === 'all') return assets
    return assets.filter((a) => {
      const used = (usage[a.id]?.length ?? 0) > 0
      return filter === 'used' ? used : !used
    })
  }, [assets, usage, filter])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    setUploadError('')
    const newAssets: Asset[] = []
    for (const file of files) {
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('folder', 'newsedition/assets')
        const res = await fetch('/api/upload', { method: 'POST', body: form })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Upload failed')
        newAssets.push(json)
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      }
    }
    if (newAssets.length > 0) setAssets((prev) => [...newAssets, ...prev])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const copyUrl = async (asset: Asset) => {
    await navigator.clipboard.writeText(asset.url)
    setCopied(asset.id)
    setTimeout(() => setCopied(null), 2000)
  }

  const deleteAsset = async (asset: Asset) => {
    const refs = usageFor(asset)
    const warning = refs.length
      ? `⚠️ "${asset.name}" is used in ${refs.length} article${refs.length > 1 ? 's' : ''}:\n\n${refs
          .map((r) => `• ${r.title}`)
          .join('\n')}\n\nDeleting it will break those images. Delete anyway?`
      : `Delete "${asset.name}"?`
    if (!confirm(warning)) return
    setDeleting(asset.id)
    try {
      const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' })
      if (!res.ok) return
      setAssets((prev) => prev.filter((a) => a.id !== asset.id))
      if (selected?.id === asset.id) setSelected(null)
    } finally {
      setDeleting(null)
    }
  }

  const counts = useMemo(() => {
    const used = assets.filter((a) => (usage[a.id]?.length ?? 0) > 0).length
    return { all: assets.length, used, unused: assets.length - used }
  }, [assets, usage])

  return (
    <div className={styles.layout}>
      {/* Upload zone */}
      <div className={styles.uploadZone}>
        <label className={`${styles.dropTarget} ${uploading ? styles.uploading : ''}`}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p>{uploading ? 'Uploading…' : 'Click or drop images to upload'}</p>
          <small>JPG, PNG, WebP, GIF · Max 10MB each</small>
          <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
        </label>
        {uploadError && <p className={styles.error}>{uploadError}</p>}
      </div>

      {/* Filter tabs */}
      <div className={styles.filterBar}>
        {(['all', 'used', 'unused'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`${styles.filterTab} ${filter === f ? styles.filterActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'used' ? 'In use' : 'Unused'}
            <span className={styles.filterCount}>{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className={styles.grid}>
        {visibleAssets.length === 0 && (
          <div className={styles.empty}>
            {filter === 'unused'
              ? 'No unused assets — every image is referenced by an article.'
              : filter === 'used'
                ? 'No assets are currently used in any article.'
                : 'No assets uploaded yet. Upload your first image above.'}
          </div>
        )}
        {visibleAssets.map((asset) => {
          const refs = usageFor(asset)
          return (
            <div
              key={asset.id}
              className={`${styles.assetCard} ${selected?.id === asset.id ? styles.selectedCard : ''}`}
              onClick={() => setSelected(selected?.id === asset.id ? null : asset)}
            >
              <div className={styles.thumb}>
                {asset.url && (
                  <Image src={asset.url} alt={asset.name} fill style={{ objectFit: 'cover' }} sizes="160px" />
                )}
                <span
                  className={`${styles.usageBadge} ${refs.length ? styles.usageUsed : styles.usageUnused}`}
                  title={refs.length ? refs.map((r) => r.title).join('\n') : 'Not used by any article'}
                >
                  {refs.length ? `Used ×${refs.length}` : 'Unused'}
                </span>
              </div>
              <div className={styles.assetInfo}>
                <p className={styles.assetName}>{asset.name}</p>
                <p className={styles.assetMeta}>
                  {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ''}
                  {asset.size ? formatBytes(asset.size) : ''}
                </p>
              </div>
              <div className={styles.assetActions}>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${copied === asset.id ? styles.copied : ''}`}
                  onClick={(e) => { e.stopPropagation(); copyUrl(asset) }}
                  title="Copy URL"
                >
                  {copied === asset.id ? '✓' : '📋'}
                </button>
                <a href={asset.url} target="_blank" rel="noopener noreferrer" className={styles.actionBtn} onClick={(e) => e.stopPropagation()} title="Open">↗</a>
                <button
                  type="button"
                  className={`${styles.actionBtn} ${styles.deleteAction}`}
                  onClick={(e) => { e.stopPropagation(); deleteAsset(asset) }}
                  disabled={deleting === asset.id}
                  title="Delete"
                >
                  🗑
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className={styles.detail}>
          <button type="button" className={styles.closeDetail} onClick={() => setSelected(null)}>✕</button>
          <div className={styles.detailImage}>
            <Image src={selected.url} alt={selected.name} fill style={{ objectFit: 'contain' }} />
          </div>
          <div className={styles.detailInfo}>
            <p className={styles.detailName}>{selected.name}</p>
            {selected.width && selected.height && <p className={styles.detailMeta}>{selected.width} × {selected.height}px</p>}
            {selected.size && <p className={styles.detailMeta}>{formatBytes(selected.size)}</p>}
            <div className={styles.urlBox}>
              <input type="text" value={selected.url} readOnly className={styles.urlInput} />
              <button type="button" onClick={() => copyUrl(selected)} className={styles.copyBtn}>
                {copied === selected.id ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Usage — which articles reference this image */}
          <div className={styles.usageSection}>
            <p className={styles.usageHeading}>
              Used in {usageFor(selected).length} article{usageFor(selected).length === 1 ? '' : 's'}
            </p>
            {usageFor(selected).length === 0 ? (
              <p className={styles.usageEmpty}>
                Not referenced by any article — safe to delete.
              </p>
            ) : (
              <ul className={styles.usageList}>
                {usageFor(selected).map((ref) => (
                  <li key={ref.id} className={styles.usageItem}>
                    <Link href={`/admin/articles/${ref.id}/edit`} className={styles.usageLink}>
                      <span className={styles.usageTitle}>{ref.title}</span>
                      <span className={styles.usageTags}>
                        <span className={`${styles.statusTag} ${styles[`status_${ref.status}`] ?? ''}`}>{ref.status}</span>
                        {ref.inCover && <span className={styles.roleTag}>cover</span>}
                        {ref.inContent && <span className={styles.roleTag}>in&nbsp;body</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
