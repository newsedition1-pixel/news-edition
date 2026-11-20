import { notFound, permanentRedirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { articles, users } from '@/lib/db/schema'
import { authorPath } from '@/lib/seo'
import { slugify } from '@/lib/utils'

interface Props {
  params: Promise<{ id: string }>
}

/**
 * Short author URLs. The canonical author URL is /author/{userId}/{name-slug}, so these two
 * shorter forms used to 404 and now redirect to it:
 *   /author/{userId}      (id only)
 *   /author/{name-slug}   (e.g. /author/amit-gautam), only for people who have published articles
 */
export default async function AuthorShortUrl({ params }: Props) {
  const { id } = await params

  const [byId] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id)).limit(1)
  if (byId) permanentRedirect(authorPath(byId))

  const wanted = slugify(id)
  if (!wanted) notFound()

  // Few accounts publish articles, so matching the slug in JS is cheap and avoids a SQL slug function.
  const publishers = await db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(articles, eq(articles.authorId, users.id))
  const matches = publishers.filter((u) => slugify(u.name) === wanted)

  // Two different people with the same name slug: do not guess which one is meant.
  if (matches.length !== 1) notFound()
  permanentRedirect(authorPath(matches[0]))
}
