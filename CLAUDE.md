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

# Outside cron service (optional, production): shared secret for /api/cron/news
CRON_SECRET=                # openssl rand -hex 32

# Social posting (optional; a platform with no keys is skipped; mode is set in Admin > News Automation, default OFF)
TELEGRAM_BOT_TOKEN=         # bot that is an admin of the channel
TELEGRAM_CHAT_ID=           # @channelusername or numeric id
X_API_KEY=                  # X developer console, OAuth 1.0a keys of the posting account
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=
X_LINK_MODE=top             # always | top | never: a tweet with a link costs $0.20 on the X API, without $0.015
X_MODE=growth               # growth (default: curated posts, polls, photos, video) | legacy (every article, old behaviour)
X_DAILY_CAP=10              # tweets a day in growth mode (default 10, max 40); links are capped at 5 a day, polls at 1, videos at 1
OPENAI_X_MODEL=             # model for tweet, poll, reply and video-frame copy (default OPENAI_TEXT_MODEL, else gpt-4o-mini)
X_REPLIES=                  # set to off to stop answer-back and the reply desk
X_REPLY_TARGETS=            # comma list of handles for the reply desk (default: ANI, PTI_News, PIB_India, RBI, SEBI_India, NSEIndia, the_hindu, ...)
META_PAGE_ACCESS_TOKEN=     # Page access token (pages_manage_posts, instagram_content_publish)
FACEBOOK_PAGE_ID=
INSTAGRAM_ACCOUNT_ID=       # Instagram professional account linked to the Page
META_GRAPH_VERSION=v23.0
SOCIAL_WEBHOOK_URL=         # Make / Zapier / n8n URL: gets every article as JSON
SOCIAL_WEBHOOK_SECRET=      # sent as Authorization: Bearer

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

### SEO helpers
All SEO identity and JSON-LD live in `src/lib/seo.ts` (site URL, X handle, logo, `cleanName()`, title/description rules, `newsArticleJsonLd()`, `breadcrumbJsonLd()`, `organizationJsonLd()`). Use them instead of hand-writing metadata or JSON-LD in a page.
- A page that sets `alternates` replaces the layout's, so always build it with `pageAlternates(canonicalUrl)` (keeps the RSS `<link rel="alternate">`).
- A page that sets `openGraph` replaces the layout's entirely, so repeat `siteName` and `locale`.
- RSS feed: `/feed.xml` (`src/app/feed.xml/route.ts`). AI-bot crawl policy: `src/app/robots.ts`. LLM summary file: `public/llms.txt`.

### Image Upload Flow
1. Client POSTs file to `/api/upload`
2. Server uploads to Cloudinary, returns `url` + `publicId`
3. Article saves both — `publicId` needed for deletion
4. On article delete: `deleteFromCloudinary(publicId)` called before DB row removal

---

## Social Posting (`/admin/news-automation`, card "Social media")

Every article that goes live is shared on social media by `shareArticle()` (`lib/social/share.ts`), called from `lib/news/publish.ts` (scheduled and admin-generated articles) and, through `after()`, from `POST /api/articles` and the draft-to-published `PATCH /api/articles/[id]`. It never throws and never undoes a publish.

- **Mode** (`settings.socialAutoPost`): `off` (default, nothing happens), `dry` (writes the posts into the log so the admin can read them, sends nothing), `on`. Live asks for confirmation. A platform without its keys is skipped.
- **Who gets what:** Telegram gets every article. **X is in growth mode** (`X_MODE`, default; `legacy` restores "every article"): `planX()` in `lib/social/xplan.ts` picks at most `X_DAILY_CAP` (10) tweets a day, 07:00-23:00 IST, paced, at least 40 min apart, only top stories or stories from 2+ trusted publishers (an editor's own article always goes). Per day: at most 5 tweets carry a link (`X_LINK_MODE` decides which), one **poll** (17:00-22:00 IST, safe topics only, 24 h, no link, no picture, because a tweet carries a poll or media, never both), one **video**. A real-photo cover is attached as a picture (a labelled AI illustration never is). Instagram and Facebook get *top stories* only (`lib/social/policy.ts`): at most 8 a day, 07:00-23:00 IST, paced over the day, at least 45 min apart; a top story is one carried by 2+ trusted publishers (or any story after a 2 h quiet stretch; an editor's own article always qualifies). Instagram also skips covers that are labelled AI illustrations. The webhook gets every article with `feed: true|false`.
- **X copy** (`lib/social/xcopy.ts`, model call in `xwriter.ts`): the model writes a hook (25-110 chars) and one checked fact (20-180 chars), plus a poll question and 2-4 options (<= 25 chars each) when a poll is planned. Every figure, quotation and capitalised name must be in the article (same grounding rules as `news/quality.ts`), no clickbait, one retry with the reasons; if nothing passes, the plain headline-and-summary post is used (`copy: 'plain'`) and a poll falls back to a fixed neutral one. Sensitive topics (deaths, crime, faith, party politics) are never made into polls.
- **X video** (`lib/social/xvideo.ts`, `xvideoRun.ts`, `POST /api/social/x-video`, `.github/workflows/x-video.yml`, `scripts/x-video/`): once a day at 19:00 IST a GitHub Action asks `GET /api/social/x-video` for a fresh story with a credited photo, renders a 1080x1920 Reel-style MP4 (<= 4 MB, ~14 s) with `scripts/x-video/make_reel.py`, and uploads it with `POST` (multipart `slug` + `video`); the route tweets it with a chunked X media upload. Both calls are authorised by `lib/news/cronGate.ts` (GitHub OIDC for `x-video.yml` on master, or `CRON_SECRET`). Preview mode logs only. The live X video upload is not tested against the real API: run the workflow with `workflow_dispatch` in Preview mode first.
- **X replies** (`lib/social/xreplies.ts` pure, `xread.ts` API calls, `xinbox.ts` orchestration; called with `after()` from `GET /api/cron/news`, 25-minute guard, `X_REPLIES=off` stops it). X forbids unsolicited automated replies and allows an automated reply only to someone who mentioned or replied to the account, so there are two parts. **Answer-back** (automatic): short checked answers to people who replied to or mentioned the account, at most 10 a day, 2 per run, 4 min apart, one per person per day, never to abusive, political, sensitive, link-carrying or brand-new accounts; Preview mode drafts into the log only. **Reply desk** (admin "X replies" card, `/api/admin/x-replies`): 4 refreshes a day between 08:30 and 22:30 IST read fresh posts of `X_REPLY_TARGETS` (search costs $0.005 per post read), with a model draft per post; a person opens the post, edits the draft and posts it by hand, then clicks Done or Skip. State is in `settings.xReplyState` and `settings.xReplyDesk`.
- **Senders** (`lib/social/channels.ts`): Telegram Bot API (`sendPhoto`, falls back to `sendMessage`), X `POST /2/tweets` with OAuth 1.0a (`oauth1.ts`, tested against X's documented example; picture via `POST /2/media/upload` with the v1.1 endpoint as fallback, poll via the `poll` field, video via the chunked upload; if the picture cannot be attached the tweet goes out as text with a `note`), Facebook Graph `/{page}/feed` (link post), Instagram Graph `/{ig}/media` then `/media_publish`, generic webhook. All take `fetch` as a parameter and return `{ok, ref|error}`.
- **Log** (`settings.socialPostLog`, `lib/social/log.ts`): last 60 shares with the result per platform; an article already shared for real is never posted again, and a failed platform is not retried automatically (avoids doubles). Secrets are scrubbed from stored errors.
- Tests: `npm test` covers composing, hashtags, policy, log, OAuth signing, the X planner, copy checks, reply rules, X reads and every sender with a fake `fetch`. Not covered: live calls to the platforms (X video upload and the X read endpoints have never been run against the real API).

## Reel assets (`GET /api/reel-asset/{slug}`)

Read-only helper for the automatic daily Reel (a scheduled task outside this repo, see the Reel notes in the project docs). The task can read Vercel pages only as text, so this route returns JSON for a *published* article: title, URL, category, the cover credit as plain text (`coverCredit`, read from the `Cover image:` line by `lib/reel/asset.ts`), `coverKind` (`photo` | `ai` | `none`) and, for a credited photo only, a 1080x640 copy of the cover as base64 (a Cloudinary variant). An AI illustration or a cover with no credit line is never sent: the Reel then has no picture. Tests: `lib/reel/asset.test.ts`.

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

---

## News Automation (`/admin/news-automation`)

Admin-driven pipeline (no cron). Articles are `isAiGenerated: true`. Auto-publish is ON by default (owner decision 20 Nov 2026; toggle in the admin screen, stored in `settings.newsAutoPublish`); an article that needs a human look (`holdReason`: names not in the sources, no cover) is saved as a draft instead. Publishing calls `notifyIndexing` + `revalidatePath` like the manual create route.

1. **Discover** (`lib/news/feeds.ts`): public RSS feeds of the trusted publishers in `lib/news/publishers.ts` (The Hindu, Indian Express, HT, NDTV, TOI, India Today, Scroll, BBC, Al Jazeera) + Google Trends India. Business Standard and News18 stay in `PUBLISHERS` as trusted hosts but have `feeds: []`: their feeds answered HTTP 403 to Vercel on every run (21 Nov 2026), so they are not polled. `lib/news/cluster.ts` groups the same story across publishers and ranks it: more publishers (confirmed) > fresh > trending > explainer.
2. **Read**: full text of up to 3 reports (`lib/news/articleText.ts`). Only hosts in `PUBLISHERS` are ever fetched. Paywalled/short pages are skipped.
3. **Write** (`lib/ai/prompts.ts`, `lib/ai/openai.ts`): model sees only the reports; `OPENAI_TEXT_MODEL` picks the model (default `gpt-4o-mini`).
4. **Verify** (`lib/news/quality.ts`): >= 600 words, no copied runs (8-gram), every figure and quotation must be in the reports (a capitalised name must be in the reports too, except nationality adjectives, compass words, generic institution words and acronyms the reports spell out or abbreviate), stock "AI phrases" rejected, publisher named up top, headline rules. One retry with the failure reasons, then the story is skipped (nothing saved). Model HTML is sanitised; the model never writes links.
4b. **Audit** (`lib/news/audit.ts`, `lib/ai/auditPrompt.ts`, `lib/ai/audit.ts`, `auditLog.ts`; owner decision 21 Nov 2026: every article is checked before it is published). After the quality check each draft gets a second model pass that compares its claims with the reports (`OPENAI_AUDIT_MODEL`, default the text model; returns null on any failure so publishing never stops), and the code adds its own checks. The model's findings are only trusted after `verifyFindings`: a snippet must be in the article, and "contradicted" / "misattributed" need evidence that is in the reports, otherwise the claim is downgraded; the model can never add a fact, quotation or source. Result: overall score /100 (facts 30, copying vs the reports 15, AI-style 15, SEO 10, Discover 10, E-E-A-T 10, grammar 5, originality 5), AI-style risk (a writing-style indicator only, never a statement about authorship), plagiarism risk (only against the reports read; the wider web is always "Unverified"), SEO/Discover scores, paragraphs to improve, corrections, an improved SEO title + description (used only when the writer's fail the SEO rules and the improved pair passes them), and PUBLISH / IMPROVE / HOLD. HOLD: a verified contradiction or wrong attribution, 2+ unmatched claims, a figure/quotation not in the reports, or heavy copying. IMPROVE: 1 unmatched claim, High AI-style, Medium copying, grammar < 60, or overall < 65. Anything but PUBLISH is rewritten once with the audit's specific fixes; if it still fails (or the second draft fails the quality check) the better draft is saved as a draft with `holdReason = "pre-publication audit ..."`. The score is recomputed after the cover and links are known, but the verdict on the text stands. `NEWS_AUDIT_MODE` = `enforce` (default) | `log` (audit and record, never retry or hold) | `off`. The last 60 audits are in `settings.newsAuditLog` and shown in the admin "Pre-publication audit" card. Manual articles are not audited.
5. **Finish** (`lib/news/links.ts`, `images.ts`, `meta.ts`): internal links to related published articles, links to the publishers and official documents, tags, SEO fields, FAQs, cover image that is never empty (Wikimedia Commons licensed photo, else the publisher's own news photo credited to them, else a labelled AI illustration; order switchable; a publisher image is rejected when its URL looks like a logo/theme asset, when it equals the og:image of the publisher's home page (`lib/news/siteImage.ts`, the site-wide share card that pages without a photo fall back to), or when the stored picture is under 600 px wide, shorter than 300 px or has a banner/poster shape; if the image model refuses the story's prompt a neutral abstract prompt is tried once; when no cover can be saved the draft's `holdReason` and the runtime log list why each step failed) with the NewsEdition logo burned in through a Cloudinary overlay (`lib/news/watermark.ts`, logo bytes in `watermarkData.ts`), standard `Source:` line (the Reel automation reads it). Further reading, the image credit and the `Source:` line sit in one `<div class="article-sources">` at the end of the stored HTML (`lib/news/sourcesBlock.ts`); the article page lifts that block out (older articles: the same three pieces at the tail) and shows it small at the very bottom of the page. Set `OPENAI_TEXT_MODEL` (production is `gpt-4.1`; GPT-5 / o-series are handled but slower).

**Featured / breaking / coverage** (owner decision 21 Nov 2026: chosen automatically). `lib/news/placement.ts` (pure) decides per published article: *breaking* needs 3+ trusted publishers and an urgent headline, max 2 at once, and `expireBreaking()` removes the flag from AI articles after 6 hours; *featured* needs 2+ publishers, a real photo (not an AI illustration), 700+ words and an audit score of 80+ (when audited), max 6 a day and 2 per category; everything else is neither. Editor-set flags on non-AI articles are never touched. Every category should get an article daily: a category with none in the last 24 hours (`lib/news/coverage.ts`) may also take a story that fits it second best (`alternativeCategories`), and the admin "Every category, every day" card shows the counts. Haryana local feeds (HT Chandigarh and Gurugram, Indian Express Chandigarh) are unverified: a feed that fails logs `Feed not loaded`.
**Article structure** (`lib/ai/prompts.ts`, checked in `quality.ts`): a lead of 30 to 45 words with the main fact and what it changes, official statements stated plainly (up to three exact quotes), no line-by-line paraphrase of a press release, an `<h2>` starting with "Analysis" with 2 to 3 points built only from the reports, FAQs phrased like real reader questions with a direct first answer, and no repeated information or same-opening sentence runs (`repetitionIssues`). Sources appear only in the block at the end (10px); publisher names in the text are plain words, never links.

**Schedule (every 30 min):** `.github/workflows/news-schedule.yml` calls `GET /api/cron/news` with a GitHub OIDC token (no secret to store; `lib/news/githubOidc.ts` only accepts this repo's `news-schedule.yml` on master; Vercel Hobby cron is daily only). One article per run (`lib/news/scheduler.ts`): the category that has waited longest goes first, stories are sorted into categories by headline keywords (`lib/news/desks.ts`), and the article is published under that category's author: Amit Gautam = India, Business; News Edition Desk = World, Politics; Sanjay Kumar = State, Governance, Haryana News; Rinki Gautam = Entertainment. Author accounts are found by name (owner account wins on duplicates); a missing account skips its categories. Pause/resume in the admin screen (`settings.newsScheduleEnabled`). A run within 20 min of the last AI article does nothing. Second way in for an outside cron service (cron-job.org etc.) when GitHub's timer is late: `GET /api/cron/news?async=1` (answers 202 at once and does the work after the response, because such services hang up after 30 s) with header `Authorization: Bearer <CRON_SECRET>` (env var `CRON_SECRET`, production only, min 32 chars; `lib/news/cronAuth.ts`). Both callers are safe together because of the 20-minute guard.

Tests: `npm test` (node test runner via tsx; pure modules only, no network).
