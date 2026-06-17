import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/dal'
import { db } from '@/lib/db'
import { assets, articles } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import { AssetsManager, type AssetUsage } from './AssetsManager'
import styles from './page.module.scss'

export const metadata: Metadata = { title: 'Assets' }

export default async function AssetsPage() {
  await requireAdmin()

  const [allAssets, allArticles] = await Promise.all([
    db.select().from(assets).orderBy(desc(assets.createdAt)).limit(200),
    db
      .select({
        id: articles.id,
        title: articles.title,
        status: articles.status,
        coverImage: articles.coverImage,
        coverImagePublicId: articles.coverImagePublicId,
        content: articles.content,
      })
      .from(articles),
  ])

  // Map each asset → the articles that reference it (as cover and/or in content).
  const usage: Record<number, AssetUsage[]> = {}
  for (const asset of allAssets) {
    const refs: AssetUsage[] = []
    for (const article of allArticles) {
      const isCover =
        (!!asset.publicId && article.coverImagePublicId === asset.publicId) ||
        (!!article.coverImage && article.coverImage === asset.url)
      const inContent =
        !!article.content &&
        ((!!asset.publicId && article.content.includes(asset.publicId)) ||
          article.content.includes(asset.url))
      if (isCover || inContent) {
        refs.push({
          id: article.id,
          title: article.title,
          status: article.status,
          inCover: isCover,
          inContent,
        })
      }
    }
    usage[asset.id] = refs
  }

  const usedCount = allAssets.filter((a) => usage[a.id]?.length).length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Assets</h1>
        <p className={styles.subtitle}>
          {allAssets.length} files · {usedCount} in use · {allAssets.length - usedCount} unused
        </p>
      </div>
      <AssetsManager assets={allAssets} usage={usage} />
    </div>
  )
}
