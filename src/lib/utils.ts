export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function formatDate(date: Date | string | null, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  })
}

export function formatRelativeTime(date: Date | string | null): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return formatDate(d)
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + '…'
}

export function generateExcerpt(html: string, maxLength = 160): string {
  const text = html.replace(/<[^>]+>/g, '').trim()
  return truncate(text, maxLength)
}

export function cn(...classes: (string | undefined | null | boolean)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function sanitizeFaqs(input: unknown): { question: string; answer: string }[] | null {
  if (!Array.isArray(input)) return null
  const cleaned = input
    .filter((f): f is { question: string; answer: string } =>
      !!f && typeof f === 'object' && typeof (f as Record<string, unknown>).question === 'string' && typeof (f as Record<string, unknown>).answer === 'string')
    .map((f) => ({ question: f.question.trim().slice(0, 300), answer: f.answer.trim().slice(0, 2000) }))
    .filter((f) => f.question && f.answer)
    .slice(0, 20)
  return cleaned.length > 0 ? cleaned : null
}

export function generateUniqueSlug(base: string, existing: string[]): string {
  let slug = slugify(base)
  if (!existing.includes(slug)) return slug
  let counter = 1
  while (existing.includes(`${slug}-${counter}`)) counter++
  return `${slug}-${counter}`
}
