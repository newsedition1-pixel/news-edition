import {
  pgTable, text, boolean, timestamp, integer, serial,
  varchar, uniqueIndex, jsonb,
} from 'drizzle-orm/pg-core'

// ─── Better Auth Core Tables ──────────────────────────────────────────────────
export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  // Better Auth admin plugin fields
  role: text('role').default('user'), // 'owner' | 'admin' | 'user'
  banned: boolean('banned').default(false),
  banReason: text('banReason'),
  banExpires: timestamp('banExpires'),
  // Author profile fields
  bio: text('bio'),
  twitterUrl: text('twitterUrl'),
  facebookUrl: text('facebookUrl'),
  instagramUrl: text('instagramUrl'),
  linkedinUrl: text('linkedinUrl'),
  websiteUrl: text('websiteUrl'),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
})

export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expiresAt').notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
})

export const accounts = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull(),
  updatedAt: timestamp('updatedAt').notNull(),
})

export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt'),
  updatedAt: timestamp('updatedAt'),
})

// ─── Categories ───────────────────────────────────────────────────────────────
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  color: varchar('color', { length: 20 }).default('#3b82f6'),
  icon: varchar('icon', { length: 50 }),
  parentId: integer('parentId').references((): any => categories.id, { onDelete: 'set null' }),
  isActive: boolean('isActive').notNull().default(true),
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})

// ─── Articles ─────────────────────────────────────────────────────────────────
export const articles = pgTable('articles', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 500 }).notNull(),
  slug: varchar('slug', { length: 600 }).notNull().unique(),
  content: text('content').notNull().default(''),
  excerpt: text('excerpt'),
  coverImage: text('coverImage'),
  coverImageAlt: varchar('coverImageAlt', { length: 200 }),
  coverImagePublicId: varchar('coverImagePublicId', { length: 300 }),
  categoryId: integer('categoryId').references(() => categories.id, { onDelete: 'set null' }),
  authorId: text('authorId').references(() => users.id, { onDelete: 'set null' }),
  // 'draft' | 'preview' | 'published'
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  isFeatured: boolean('isFeatured').notNull().default(false),
  isBreaking: boolean('isBreaking').notNull().default(false),
  tags: text('tags').array(),
  faqs: jsonb('faqs').$type<{ question: string; answer: string }[]>(),
  seoTitle: varchar('seoTitle', { length: 200 }),
  seoDescription: text('seoDescription'),
  viewCount: integer('viewCount').notNull().default(0),
  publishedAt: timestamp('publishedAt'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})

// ─── Comments ─────────────────────────────────────────────────────────────────
export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  articleId: integer('articleId').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  userId: text('userId').references(() => users.id, { onDelete: 'set null' }),
  guestName: varchar('guestName', { length: 100 }),
  guestEmail: varchar('guestEmail', { length: 200 }),
  content: text('content').notNull(),
  // 'pending' | 'approved' | 'rejected'
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().notNull(),
})

// ─── Assets ───────────────────────────────────────────────────────────────────
export const assets = pgTable('assets', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  url: text('url').notNull(),
  publicId: varchar('publicId', { length: 300 }).notNull().unique(),
  type: varchar('type', { length: 50 }).notNull().default('image'),
  format: varchar('format', { length: 20 }),
  size: integer('size'),
  width: integer('width'),
  height: integer('height'),
  uploadedBy: text('uploadedBy').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
})

// ─── Home Sections ────────────────────────────────────────────────────────────
export const homeSections = pgTable('home_sections', {
  id: serial('id').primaryKey(),
  categoryId: integer('categoryId').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 100 }).notNull(),
  articleCount: integer('articleCount').notNull().default(3),
  sortOrder: integer('sortOrder').notNull().default(0),
  isActive: boolean('isActive').notNull().default(true),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
})

// ─── Type Exports ─────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Category = typeof categories.$inferSelect
export type Article = typeof articles.$inferSelect
export type Comment = typeof comments.$inferSelect
export type Asset = typeof assets.$inferSelect
export type HomeSection = typeof homeSections.$inferSelect

export type NewCategory = typeof categories.$inferInsert
export type NewArticle = typeof articles.$inferInsert
export type NewComment = typeof comments.$inferInsert
export type NewAsset = typeof assets.$inferInsert
export type NewHomeSection = typeof homeSections.$inferInsert
