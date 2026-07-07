@AGENTS.md

# NewsEdition — Project Documentation

Full-stack news platform built with Next.js 16 App Router. Multi-user, role-based, with admin panel, rich text editor, image uploads, comments, and SEO-first architecture.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.4 (App Router, `--webpack` flag — Turbopack disabled) |
| UI | React 19.2.4, SCSS Modules |
| Database | Drizzle ORM 0.45.2 + Neon PostgreSQL (serverless) |
| Auth | Better Auth 1.6.9 (admin plugin, Google OAuth) |
| Images | Cloudinary (upload + delivery), next/image |
| Rich Text | Tiptap 3.22.4 |
| Email | Nodemailer 8.0.6 |
| Validation | Zod 4.3.6 |

---

## Commands

```bash
npm run dev          # Start dev server (uses --webpack, NOT Turbopack)
npm run build        # Production build
npm run db:push      # Push schema changes to Neon (no migrations)
npm run db:studio    # Open Drizzle Studio (DB GUI)
npm run db:seed      # Seed DB with initial owner account (admin@newsedition.in / 12345678)
```

---

## Environment Variables

Copy `.env.example` → `.env.local` and fill in:

```env
# Neon PostgreSQL
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Better Auth
BETTER_AUTH_SECRET=          # openssl rand -hex 32
BETTER_AUTH_URL=http://localhost:3000

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME

# Email / SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=              # App password if Gmail 2FA is on
EMAIL_FROM=NewsEdition <noreply@yourdomain.com>

# Public
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
NEXT_PUBLIC_SITE_NAME=NewsEdition
NEXT_PUBLIC_SITE_DOMAIN=yourdomain.com
```

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/                    # Login, register, verify-email
│   ├── (public)/                  # All public-facing pages
│   │   ├── page.tsx               # Home (featured + latest + sidebar)
│   │   ├── [category]/page.tsx    # Category listing with subcategories
│   │   ├── article/[slug]/        # Article detail + comments
│   │   ├── author/[id]/[name]/    # Author profile (SEO-friendly)
│   │   ├── search/                # Full-text search
│   │   └── settings/profile/      # User profile editor
│   ├── admin/                     # Protected admin panel
│   │   ├── dashboard/
│   │   ├── articles/              # List, new, edit, preview
│   │   ├── categories/
│   │   ├── comments/
│   │   ├── assets/
│   │   └── users/
│   ├── api/
│   │   ├── auth/[...all]/         # Better Auth catch-all handler
│   │   ├── articles/              # CRUD + delete (with Cloudinary cleanup)
│   │   ├── categories/
│   │   ├── comments/
│   │   ├── assets/
│   │   ├── upload/                # Cloudinary upload endpoint
│   │   ├── user/profile/          # PATCH user bio + social URLs
│   │   └── users/[id]/            # Admin user management
│   ├── robots.ts
│   └── sitemap.ts
├── components/
│   ├── admin/
│   │   ├── AdminShell.tsx         # Mobile-aware admin layout with hamburger
│   │   ├── ArticleEditor.tsx      # Tiptap rich text editor wrapper
│   │   ├── DeleteArticleBtn.tsx   # Client component for article deletion
│   │   └── RichTextEditor.tsx
│   ├── layout/
│   │   ├── Header.tsx             # Public header with auth dropdown + theme toggle
│   │   ├── Footer.tsx
│   │   ├── PublicLayout.tsx
│   │   └── AdminSidebar.tsx       # Used inside AdminShell
│   ├── news/
│   │   ├── ArticleCard.tsx        # Variants: default | hero | compact
│   │   ├── BreakingTicker.tsx     # Scrolling breaking news bar
│   │   └── ShareButtons.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Input.tsx
│       └── ThemeToggle.tsx
├── lib/
│   ├── auth.ts                    # Better Auth server config (import server-side only)
│   ├── auth-client.ts             # Better Auth client hooks
│   ├── dal.ts                     # requireAdmin() / requireAuth() guards
│   ├── db/
│   │   ├── index.ts               # Drizzle instance (uses Neon serverless)
│   │   └── schema.ts              # All table definitions + type exports
│   ├── cloudinary.ts              # upload / deleteFromCloudinary helpers
│   ├── email.ts                   # sendEmail() via Nodemailer
│   └── utils.ts                   # slugify(), formatDate(), formatRelativeTime(), cn()
└── types/
    └── index.ts                   # ArticleWithRelations, ApiResponse<T>, etc.
```

---

## Database Schema

### `users`
Better Auth manages this table. Fields added beyond defaults:
- `bio` text, `twitterUrl`, `facebookUrl`, `instagramUrl`, `linkedinUrl`, `websiteUrl`
- `role`: `'owner' | 'admin' | 'user'` (set by Better Auth admin plugin)
- `banned`, `banReason`, `banExpires`
- User IDs are **text** (UUIDs from Better Auth) — not integers

### `categories`
- `parentId` self-referential FK for subcategories
- `color` (hex), `icon` (emoji/string), `isActive`, `sortOrder`
- Slug must be unique — used directly as URL path: `/{slug}`

### `articles`
- `status`: `'draft' | 'preview' | 'published'`
- `coverImagePublicId` — Cloudinary public ID, needed for deletion
- `tags` — PostgreSQL text array
- `authorId` → `users.id` (text FK)

### `comments`
- `status`: `'pending' | 'approved' | 'rejected'` — only `approved` shown publicly
- Guest comments supported: `guestName`, `guestEmail` (no userId)

### `assets`
- Tracks all Cloudinary uploads independently of articles
- `publicId` unique — used for deduplication and deletion

---

## Auth System

**Roles (hierarchy):** `owner` > `admin` > `user`

- `owner` — full access, set via seed script
- `admin` — can manage articles, categories, comments, assets
- `user` — can comment, edit own profile

**Server-side auth check:**
```ts
import { requireAdmin } from '@/lib/dal'
const session = await requireAdmin()  // throws redirect if not admin/owner
```

**Session in server components:**
```ts
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
const session = await auth.api.getSession({ headers: await headers() })
```

**Client-side:**
```ts
import { authClient } from '@/lib/auth-client'
const { data: session } = authClient.useSession()
```

**Google OAuth redirect URIs** (must be set in Google Console):
- `http://localhost:3000/api/auth/callback/google` (dev)
- `https://yourdomain.com/api/auth/callback/google` (prod)

---

## Key Conventions

### URL Patterns
- Articles: `/article/{slug}`
- Categories: `/{categorySlug}` (top-level, no prefix)
- Author profiles: `/author/{userId}/{nameSlug}` — ID for DB lookup, name for SEO
  - Always canonical-redirect if name slug doesn't match current name
- Subcategories: same `/{slug}` pattern, `parentId` distinguishes hierarchy

### Slugify
```ts
import { slugify } from '@/lib/utils'
slugify('John Doe')  // → 'john-doe'
```
Used for author URLs and article slugs.

### Server Actions
Must be in **separate files** from `'use client'` components. Never co-locate `'use server'` and `'use client'` in the same file.

### SCSS Global Variables/Mixins
Variables (`_variables.scss`) and mixins (`_mixins.scss`) are injected via `sassOptions.additionalData` in `next.config.ts` — available in every `.scss` file without importing.

### Theming
- Theme stored in `localStorage` (`theme=dark|light`), falls back to `prefers-color-scheme`
- A blocking inline script in the root layout sets `data-theme` on `<html>` before first paint — no flash of wrong theme
- IMPORTANT: never read `cookies()`/`headers()` in the root layout — it forces every page to render dynamically and disables ISR/static caching sitewide (this is why the theme is applied client-side)

### Image Upload Flow
1. Client POSTs file to `/api/upload`
2. Server uploads to Cloudinary, returns `url` + `publicId`
3. Article saves both — `publicId` needed for deletion
4. On article delete: `deleteFromCloudinary(publicId)` called before DB row removal

---

## Admin Panel

Access: `/admin` — requires `admin` or `owner` role.

Protected via `src/middleware.ts` (cookie check) + `requireAdmin()` in each layout/page.

`AdminShell` component wraps all admin pages with a responsive sidebar + hamburger menu for mobile.

---

## SEO / Structured Data

All public pages emit JSON-LD:
- **Home**: `WebSite` (with `SearchAction`) + `NewsMediaOrganization`
- **Article**: `NewsArticle` + `BreadcrumbList`
- **Category**: `CollectionPage` + `BreadcrumbList` + `ItemList`
- **Author**: `Person` (with `sameAs` social links)

Sitemap: `src/app/sitemap.ts` — auto-generates from DB.
Robots: `src/app/robots.ts`.

---

## Performance Notes

- `next/image` with `fill` + variant-specific `sizes` prop (compact: `100px`, hero: `55vw`, default: responsive)
- AVIF + WebP formats enabled in `next.config.ts`
- 30-day `minimumCacheTTL` for optimized images
- Static assets: `immutable` cache header (1 year)
- Avoid `backdrop-filter` in card overlays — high GPU cost
- `revalidate = 60` on home, `300` on category pages, `3600` on articles
