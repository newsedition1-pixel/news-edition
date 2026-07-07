export type Role = 'owner' | 'admin' | 'user'
export type ArticleStatus = 'draft' | 'preview' | 'published'
export type CommentStatus = 'pending' | 'approved' | 'rejected'

export interface ArticleFaq {
  question: string
  answer: string
}

export interface ArticleWithRelations {
  id: number
  title: string
  slug: string
  content: string
  excerpt: string | null
  coverImage: string | null
  coverImageAlt: string | null
  coverImagePublicId: string | null
  status: ArticleStatus
  isFeatured: boolean
  isBreaking: boolean
  tags: string[] | null
  faqs?: ArticleFaq[] | null
  seoTitle: string | null
  seoDescription: string | null
  viewCount: number
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  category: {
    id: number
    name: string
    slug: string
    color: string
  } | null
  author: {
    id: string
    name: string
    image: string | null
  } | null
  _count?: {
    comments: number
  }
}

export interface CategoryWithCount {
  id: number
  name: string
  slug: string
  description: string | null
  color: string
  icon: string | null
  isActive: boolean
  sortOrder: number
  articleCount: number
}

export interface CommentWithRelations {
  id: number
  content: string
  status: CommentStatus
  createdAt: Date
  updatedAt: Date
  article: { id: number; title: string; slug: string } | null
  user: { id: string; name: string; image: string | null } | null
  guestName: string | null
  guestEmail: string | null
}

export interface DashboardStats {
  totalArticles: number
  publishedArticles: number
  draftArticles: number
  totalCategories: number
  totalComments: number
  pendingComments: number
  totalAssets: number
  totalUsers: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
