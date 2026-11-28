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
X_MODE=breaking             # breaking (default since 27 Nov 2026: only breaking news) | growth (20 curated posts a day, polls, photos, video) | legacy (every article, old behaviour)
X_BREAKING_MIN_PUBLISHERS=  # breaking mode: trusted publishers a story with an urgent headline needs to be tweeted without the site's breaking flag (default 2, range 2-10; 3 or more = in practice only the site flag)
NEWS_BREAKING_EXTRA=8        # articles a day the breaking fast lane may publish on top of NEWS_DAILY_CAP (default 8, 0-24)
X_ALERTS=                   # set to off to stop the X breaking alerts (see "Breaking alert" below)
X_ALERT_DAILY_CAP=10        # alerts a day (default 10, 0-30; 0 = none)
X_ALERT_POSTS=              # set to off to stop reading official news accounts on X for alerts (see "Breaking alert")
X_BREAKING_SOURCES=         # comma list of official news handles to watch (default: India: ANI, PTI_News, ndtv, the_hindu, htTweets, IndianExpress, IndiaToday; world: Reuters, AP, AFP, BBCBreaking, BBCWorld, AJEnglish, cnnbrk, SkyNews, DWNews, France24_en, business; max 20, read with 2 searches); a post needs a second source
X_DAILY_CAP=20              # tweets a day (default 20 since 22 Nov 2026, max 40; in breaking mode only a guard); links are capped at 5 a day, polls at 1, videos at 1 (growth mode)
OPENAI_IMAGE_MODEL=          # AI cover illustration (default gpt-image-2.5-flare, then gpt-image-2, gpt-image-1.5, gpt-image-1-mini; gpt-image-1 was shut down 23 Oct 2026)
NEWS_COVER_LOGO_CHECK=      # set to off to stop the vision check for a media brand's logo/watermark on publisher cover photos (default on)
OPENAI_LOGO_MODEL=          # vision model for that check (default OPENAI_TEXT_MODEL, else gpt-4o-mini; must accept image input)
OPENAI_X_MODEL=             # model for tweet, poll, reply and video-frame copy (default OPENAI_TEXT_MODEL, else gpt-4o-mini)
X_REPLIES=                  # set to off to stop answer-back and the reply desk
X_VIDEO_VOICE=              # hi (default: Hindi narration, English text on the frames) | en (reads the English frame text)
OPENAI_TTS_MODEL=           # narrator of the daily X video (default gpt-4o-mini-tts)
OPENAI_TTS_VOICE=           # onyx (default) | alloy | nova | echo ...
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
- Article `<title>` / og:title / twitter:title come from `articleTitleText(seoTitle, title)`: the stored SEO title, unless it looks cut mid-phrase (the pipeline trims it to 60 chars at a word, which left titles ending "... injured in" / "... century and"); then the full headline up to 75 chars, else the headline shortened at a word with "…" (weekly SEO run, 24 Nov 2026).
- RSS feed: `/feed.xml` (`src/app/feed.xml/route.ts`). AI-bot crawl policy: `src/app/robots.ts`. LLM summary file: `/llms.txt` (`src/app/llms.txt/route.ts`, text built from the database by `src/lib/llms.ts`: active categories + the 30 newest stories, revalidated every 15 min; the old static `public/llms.txt` is gone).
- **AI search (ChatGPT, Gemini, Claude, Perplexity)**, owner decision 24 Nov 2026: `robots.ts` allows the answer/search bots (OAI-SearchBot, ChatGPT-User, GPTBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, plus Googlebot and Bingbot) and `robots.test.ts` fails if one of them is ever blocked. `NewsArticle` JSON-LD carries `wordCount`, `citation` (the "Further reading" and "Source:" links, not the cover credit) and an author `@id` equal to the Person on the author page; the publisher has `ethicsPolicy`, `contactPoint`, `areaServed`. Crawler access is not what limits AI citations (authority and original reporting are); measure with GA4 referrals from chatgpt.com, perplexity.ai, gemini.google.com, claude.ai, copilot.microsoft.com.

### Image Upload Flow
1. Client POSTs file to `/api/upload`
2. Server uploads to Cloudinary, returns `url` + `publicId`
3. Article saves both — `publicId` needed for deletion
4. On article delete: `deleteFromCloudinary(publicId)` called before DB row removal

---

## Social Posting (`/admin/news-automation`, card "Social media")

Every article that goes live is shared on social media by `shareArticle()` (`lib/social/share.ts`), called from `lib/news/publish.ts` (scheduled and admin-generated articles) and, through `after()`, from `POST /api/articles` and the draft-to-published `PATCH /api/articles/[id]`. It never throws and never undoes a publish.

- **Mode** (`settings.socialAutoPost`): `off` (default, nothing happens), `dry` (writes the posts into the log so the admin can read them, sends nothing), `on`. Live asks for confirmation. A platform without its keys is skipped.
- **Who gets what** (owner decision 22 Nov 2026: **20 posts a day on every account**): Telegram gets every article. **X: breaking news only** (owner decision 27 Nov 2026, "x account me sirf breaking news post kiya kro"; `X_MODE=breaking`, the default, `planBreaking()` in `lib/social/xplan.ts`): an article is tweeted only when it is breaking news (`xBreakingVerdict()`): its row carries `isBreaking` (set by `decidePlacement` for a scheduled article: 3+ trusted publishers and an urgent headline, max 2 at once, flag removed after 6 h; or ticked by an editor), **or**, looser and for X only (owner "ok krdo" 27 Nov 2026, after the strict rule produced no tweet), a scheduled story carried by 2+ trusted publishers (`X_BREAKING_MIN_PUBLISHERS`, default 2) whose headline is urgent (`isUrgentHeadline()` in `placement.ts`; the count comes from `shareArticle(id, { publishers })`, so an article an editor published by hand needs the tick, and an admin "generate" run too; the site's breaking ticker is not affected and the "max 2 at once" limit does not apply to X, `X_DAILY_CAP` is the brake; the urgent word list also matches routine court and crime words such as "arrested" or "verdict", so some tweets will be ordinary news), at once and at any hour, with hook + one checked fact, the link (`X_LINK_MODE=never` and the 5-links-a-day budget still apply) and a picture when the cover is a real photo; no poll, no daily video (`x-video` answers `{ skip }`; a test run still renders), `X_DAILY_CAP` only as a guard. A breaking flag is read when the article is first shared, so ticking it on an article that is already published tweets nothing. The site flag alone is strict, so expect few tweets even with the looser rule (22 Nov 2026: none of the 22 articles published that day was flagged; how many stories have 2 publishers and an urgent headline is not measured yet: look at the `Social share` lines, `x=sent` shows `urgent story carried by N publishers`); to tweet less set `X_BREAKING_MIN_PUBLISHERS=3`, to tweet more set `X_MODE=growth` (or lower `BREAKING_MIN_PUBLISHERS` in `placement.ts`, which also changes the site's breaking ticker). Answer-back to replies and the reply desk are unchanged. Instagram, Facebook and Telegram are unchanged. The rest of this bullet describes **growth mode** (`X_MODE=growth`; `legacy` restores "every article"): `planX()` in `lib/social/xplan.ts` picks at most `X_DAILY_CAP` (20) tweets a day, 07:00-23:00 IST, paced evenly over the window (`allowedSoFar`), at least 25 min apart; every story is eligible now (until 22 Nov it was 40 min apart and single-source stories waited for a 90 min quiet stretch; an editor's own article always goes). Per day: at most 5 tweets carry a link (`X_LINK_MODE` decides which; the links go to stories carried by 2+ trusted publishers), one **poll** (17:00-22:00 IST, safe topics only, 24 h, no link, no picture, because a tweet carries a poll or media, never both), one **video**. A real-photo cover is attached as a picture (a labelled AI illustration never is). Instagram and Facebook get up to `FEED_DAILY_CAP` = 20 a day (`lib/social/policy.ts`): 07:00-23:00 IST, paced over the day, at least 25 min apart (`FEED_MIN_GAP_MS`); `FEED_QUIET_GAP_MS` equals the minimum gap, so single-source stories are posted too (it was 8 a day, top stories only: 2+ trusted publishers or a 2 h quiet stretch). Instagram still skips covers that are labelled AI illustrations. The webhook gets every article with `feed: true|false`. A story the pacing skips is not posted later (each article is shared once, when it is published). The 21 Nov audit warned that many near-identical posts can lower X reach (3-9 views per post); to go back, lower `FEED_DAILY_CAP` / `X_DAILY_CAP` and raise the gaps.
- **X copy** (`lib/social/xcopy.ts`, model call in `xwriter.ts`): the model writes a hook (25-110 chars) and one checked fact (20-180 chars), plus a poll question and 2-4 options (<= 25 chars each) when a poll is planned. Every figure, quotation and capitalised name must be in the article (same grounding rules as `news/quality.ts`), no clickbait, one retry with the reasons; if nothing passes, the plain headline-and-summary post is used (`copy: 'plain'`) and a poll falls back to a fixed neutral one. Sensitive topics (deaths, crime, faith, party politics) are never made into polls.
- **X video** (`lib/social/xvideo.ts`, `xvideoRun.ts`, `POST /api/social/x-video`, `.github/workflows/x-video.yml`, `scripts/x-video/`): once a day at 19:00 IST a GitHub Action asks `GET /api/social/x-video` for a fresh story with a credited photo, renders a 1080x1920 Reel-style MP4 (<= 4 MB, ~14-24 s) with `scripts/x-video/make_reel.py`, and uploads it with `POST` (multipart `slug` + `video`); the route tweets it with a chunked X media upload. Both calls are authorised by `lib/news/cronGate.ts` (GitHub OIDC for `x-video.yml` on master, or `CRON_SECRET`). Preview mode logs only. **Voice (22 Nov 2026):** the text on the frames stays English, the narration is Hindi. `writeHindi()` (`xvideo.ts`) turns the four checked frame texts into four short Devanagari lines (numbers and acronyms spelled out, no digits/Latin/symbols; one retry with the reasons), `speak()` reads them with `TTS_STYLE_HINDI`, and `run.py` times each frame text by the spoken word count of its line (`voice.words`). It sees only the frame texts, so it can add no fact, but the translation is checked for form, not meaning: listen to a test video. If the Hindi is rejected the English frame text is read; with no voice the video has music only; `X_VIDEO_VOICE=en` switches back. A test run (`workflow_dispatch` with `test` = true) renders only and keeps the MP4 as the artifact `x-video-test`. The live X video upload is not tested against the real API: run the workflow with `workflow_dispatch` in Preview mode first.
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
Share image: a page that sets its own `openGraph` loses the inherited `/opengraph-image`, so category and author pages list `DEFAULT_OG_IMAGE` (`src/lib/seo.ts`). Author names go through `cleanName()` everywhere they are shown (all-capitals "GAURAV" -> "Gaurav"; the URL slug is unchanged).
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

Admin-driven pipeline (no cron). Articles are `isAiGenerated: true`. Auto-publish is ON by default (owner decision 20 Nov 2026; toggle in the admin screen, stored in `settings.newsAutoPublish`); an article that needs a human look (`holdReason`: names not in the sources, no cover) is saved as a draft instead. Publishing calls `notifyIndexing` + `revalidatePath` like the manual create route. `notifyIndexing` (`lib/googleIndexing.ts`) pings IndexNow; the Google Indexing API part is off since 25 Nov 2026 (job/livestream pages only, and it failed on quota and URL ownership all day) unless `GOOGLE_INDEXING_API=on`.

1. **Discover** (`lib/news/feeds.ts`): public RSS feeds of the trusted publishers in `lib/news/publishers.ts` (The Hindu, Indian Express, HT, NDTV, TOI, India Today, Scroll, BBC, Al Jazeera) + Google Trends India. Business Standard and News18 stay in `PUBLISHERS` as trusted hosts but have `feeds: []`: their feeds answered HTTP 403 to Vercel on every run (21 Nov 2026), so they are not polled. `lib/news/cluster.ts` groups the same story across publishers and ranks it: more publishers (confirmed) > fresh > trending > explainer.
2. **Read**: full text of up to 3 reports (`lib/news/articleText.ts`). Only hosts in `PUBLISHERS` are ever fetched. Paywalled/short pages are skipped.
3. **Write** (`lib/ai/prompts.ts`, `lib/ai/openai.ts`): model sees only the reports; `OPENAI_TEXT_MODEL` picks the model (default `gpt-4o-mini`).
4. **Verify** (`lib/news/quality.ts`): >= 600 words, no copied runs (8-gram), every figure and quotation must be in the reports (a capitalised name must be in the reports too, except nationality adjectives, compass words, generic institution words and acronyms the reports spell out or abbreviate), stock "AI phrases" rejected, no outlet named as a source (see "Sources are never named" below), headline rules. One retry with the failure reasons, then the story is skipped (nothing saved). Model HTML is sanitised; the model never writes links.
4b. **Audit** (`lib/news/audit.ts`, `lib/ai/auditPrompt.ts`, `lib/ai/audit.ts`, `auditLog.ts`; owner decision 21 Nov 2026: every article is checked before it is published). After the quality check each draft gets a second model pass that compares its claims with the reports (`OPENAI_AUDIT_MODEL`, default the text model; returns null on any failure so publishing never stops), and the code adds its own checks. The model's findings are only trusted after `verifyFindings`: a snippet must be in the article, and "contradicted" / "misattributed" need evidence that is in the reports, otherwise the claim is downgraded; the model can never add a fact, quotation or source. Result: overall score /100 (facts 30, copying vs the reports 15, AI-style 15, SEO 10, Discover 10, E-E-A-T 10, grammar 5, originality 5), AI-style risk (a writing-style indicator only, never a statement about authorship), plagiarism risk (only against the reports read; the wider web is always "Unverified"), SEO/Discover scores, paragraphs to improve, corrections, an improved SEO title + description (used only when the writer's fail the SEO rules and the improved pair passes them), and PUBLISH / IMPROVE / HOLD. HOLD: a verified contradiction or wrong attribution, 2+ unmatched claims, a figure/quotation not in the reports, or heavy copying. IMPROVE: 1 unmatched claim, High AI-style, Medium copying, grammar < 60, or overall < 65. Anything but PUBLISH is rewritten once with the audit's specific fixes. **Which verdicts stop an article (owner decision 26 Nov 2026, `auditHoldReason` in `audit.ts`):** a HOLD, or an IMPROVE that doubts a fact (one claim the reports do not contain) or scores under 65, is saved as a draft with `holdReason = "pre-publication audit ..."`; any other IMPROVE (most often "several passages stay close to the reports' wording", Medium copying) is published as the better of the two drafts. Reason: with every IMPROVE held, 13 of 15 scheduled runs on 26 Nov 2026 (04:00-11:00 IST) ended as drafts and the site went 3.5 hours without a new article. The writer prompt has an "ORIGINAL WORDING" block (new order of information, merge/split sentences, no run of six words, long name lists shortened) so fewer drafts reach IMPROVE; the retry prompt repeats it when the audit says "too close". The score is recomputed after the cover and links are known, but the verdict on the text stands. `NEWS_AUDIT_MODE` = `enforce` (default; holds as described above) | `log` (audit and record, never retry or hold) | `off`. The last 60 audits are in `settings.newsAuditLog` and shown in the admin "Pre-publication audit" card. Manual articles are not audited.
5. **Finish** (`lib/news/links.ts`, `images.ts`, `meta.ts`): internal links to related published articles, links to the publishers and official documents, tags, SEO fields, FAQs, cover image that is never empty (Wikimedia Commons licensed photo, else the publisher's own news photo credited to them, else a labelled AI illustration (`lib/ai/openai.ts` `generateCoverImage`, models in `lib/ai/imageModels.ts`: `OPENAI_IMAGE_MODEL` first, then `gpt-image-2.5-flare`, `gpt-image-2`, `gpt-image-1.5`, `gpt-image-1-mini`; a model the API calls gone or closed to the account is skipped; `gpt-image-1` was shut down on 23 Oct 2026 and until 22 Nov 2026 its error turned every story without a photo into a draft); order switchable; a publisher image is rejected when its URL looks like a logo/theme asset, when it equals the og:image of the publisher's home page (`lib/news/siteImage.ts`, the site-wide share card that pages without a photo fall back to), or when the stored picture is under 600 px wide, shorter than 300 px or has a banner/poster shape; **a publisher picture that carries a media brand's logo, watermark, channel bug or credit stamp is never used** (owner decision 22 Nov 2026): before the upload a vision model (`lib/ai/logoCheck.ts`, prompt and parsing in `logoPrompt.ts`, `OPENAI_LOGO_MODEL`) looks at the picture, and a mark printed on top of it (kind `overlay`) or a branded news card rejects it, while logos that are part of the real scene (microphone flags, signboards) do not; the picture is sent to OpenAI by URL and, if OpenAI cannot download it, as bytes fetched here (https and public hosts only); "could not check" counts as "do not use"; candidates are the page's og:image, twitter:image and JSON-LD article images (`imageCandidatesOf`, up to 3 per publisher, max 4 vision checks per story), then the next publisher's pictures, then Wikimedia, then the AI illustration; every skip and its reason (`brand logo on the picture (NDTV (top-left))`) is in the cover notes; `NEWS_COVER_LOGO_CHECK=off` switches it off; the Wikimedia photos and the AI illustrations are not checked; if the image model refuses the story's prompt a neutral abstract prompt is tried once; when no cover can be saved the draft's `holdReason` and the runtime log list why each step failed) with the NewsEdition logo burned in through a Cloudinary overlay (`lib/news/watermark.ts`, logo bytes in `watermarkData.ts`), no `Source:` line any more (see "Sources are never named" below). Official-document links ("Further reading") and the image credit sit in one `<div class="article-sources">` at the end of the stored HTML (`lib/news/sourcesBlock.ts`); the article page lifts that block out (older articles: the same pieces plus their `Source:` line at the tail) and shows it small at the very bottom of the page. Set `OPENAI_TEXT_MODEL` (production is `gpt-4.1`; GPT-5 / o-series are handled but slower).

**Featured / breaking / coverage** (owner decision 21 Nov 2026: chosen automatically). `lib/news/placement.ts` (pure) decides per published article: *breaking* needs 3+ trusted publishers and an urgent headline, max 2 at once, and `expireBreaking()` removes the flag from AI articles after 6 hours; *featured* needs 2+ publishers, a real photo (not an AI illustration), 700+ words and an audit score of 80+ (when audited), max 6 a day and 2 per category; everything else is neither. Editor-set flags on non-AI articles are never touched. Every category should get an article daily: a category with none in the last 24 hours (`lib/news/coverage.ts`) may also take a story that fits it second best (`alternativeCategories`), and the admin "Every category, every day" card shows the counts. Haryana local feeds (HT Chandigarh and Gurugram, Indian Express Chandigarh) are unverified: a feed that fails logs `Feed not loaded`.
**Article structure** (`lib/ai/prompts.ts`, checked in `quality.ts`): a lead of 30 to 45 words with the main fact and what it changes, official statements stated plainly (up to three exact quotes), no line-by-line paraphrase of a press release, an `<h2>` starting with "Analysis" with 2 to 3 points built only from the reports, FAQs phrased like real reader questions with a direct first answer, and no repeated information or same-opening sentence runs (`repetitionIssues`). **Sources are never named** (owner decision 28 Nov 2026, "article me sources ka naam mention nahi krna"): the article text, FAQs and title never name a newspaper, agency, channel, website or journalist as the source of a fact (no "according to The Hindu", "PTI reported"). `lib/ai/prompts.ts` forbids it and no longer gives the writer the outlet names; `outletAttributions()` in `lib/news/quality.ts` blocks an article that does it anyway (one retry with the reason, then the story is skipped), and it replaced the old rule that required the publisher in the first three paragraphs. People and bodies in the story (an official, a ministry, a court, a company) are still named: they are who said or did it. There is no `Source:` line and no link to another publisher; the audit no longer scores "publishers named", "links to the publishers" or "sources listed" (the scores are out of the checks that remain). Kept on purpose: links to official documents. **No image credit either** (second owner decision the same day, "image credit ka bhi hata do"): a Wikimedia or publisher cover photo gets no `Cover image:` line (`coverNoteHtml()` in `lib/news/images.ts`, used by `pipeline.ts`; `buildImageCredit` / `buildPublisherImageCredit` stay unused to put it back). The labelled AI illustration keeps its `Cover image: AI-generated illustration, ...` line, because it says the picture is not a photograph and `hasAiCover()` (social posting, reel asset) reads it; the audit no longer scores "cover image is credited or labelled". Articles published before this date keep their text, `Source:` line and credit. Trade-offs to know: the NewsArticle `citation` in JSON-LD now holds official documents only; the daily Reel tasks no longer have a `Source:` line to check (they pass an article that has an "Analysis" `<h2>` and was published on or after 28 Nov 2026); a Wikimedia licence (CC BY and similar) asks for attribution and a publisher photo is used without its "courtesy" line, so a rights holder can object (risk accepted by the owner); `coverOf()` (`lib/reel/asset.ts`) now answers `none` for new photo articles, so the daily X video (`xvideo.ts`, growth mode only, needs a credited photo) finds only articles from before this date, and `/api/reel-asset` sends no photo for new articles.

**Schedule (every 30 min):** `.github/workflows/news-schedule.yml` calls `GET /api/cron/news` with a GitHub OIDC token (no secret to store; `lib/news/githubOidc.ts` only accepts this repo's `news-schedule.yml` on master; Vercel Hobby cron is daily only). One article per run (`lib/news/scheduler.ts`): the category that has waited longest goes first, stories are sorted into categories by headline keywords (`lib/news/desks.ts`), and the article is published under that category's author: Amit Gautam = India, Business; News Edition Desk = World, Politics; Sanjay Kumar = State, Governance, Haryana News; Rinki Gautam = Entertainment; Gaurav = Sports, Technology (owner decision 24 Nov 2026; the account named exactly "Gaurav", which is not the separate account "Gaurav Kumar"; sports and technology stories are sorted by keywords in `desks.ts`, and a BBC/Al Jazeera-only sports or technology story stays in its own category instead of going to World). Author accounts are found by name (owner account wins on duplicates); a missing account skips its categories. Pause/resume in the admin screen (`settings.newsScheduleEnabled`). A run within 20 min of the last AI article does nothing (5 min for a breaking story, see the fast lane below). **Volume and duplicates (owner decision 25 Nov 2026, after the 24 Nov SEO audit found ~40 articles a day and the same story published 2-4 times):** at most `NEWS_DAILY_CAP` (default 20, env, 1-48) AI articles are published per IST day, spread evenly (`lib/news/pace.ts` `allowedSoFar`: about one every 72 min; an admin forced run is not counted against it), and a story whose publisher headlines match one of our articles of the last 48 hours (headline similarity >= 0.45, or >= 3 distinctive words and 60% of a headline's distinctive words in our headline + excerpt + tags; `lib/news/dedupe.ts`, used by `fresh.ts`) is not written again. A story that names a foreign country or city and nothing Indian is filed under World even when an Indian publisher carries it (`desks.ts` `INDIA_RX`). Second way in for an outside cron service (cron-job.org etc.) when GitHub's timer is late: `GET /api/cron/news?async=1` (answers 202 at once and does the work after the response, because such services hang up after 30 s) with header `Authorization: Bearer <CRON_SECRET>` (env var `CRON_SECRET`, production only, min 32 chars; `lib/news/cronAuth.ts`). Both callers are safe together because of the 20-minute guard.

**Breaking-news fast lane (owner decision 28 Nov 2026, "jo breaking news hogi poore world me wahi x par post ho"; `lib/news/breaking.ts`, used first in `runScheduledArticle`):** before this a breaking story waited for its category's turn (about ten categories, one article every 72 min, nothing within 20 min of the last article), so a big story could sit for hours and X only tweets what the site publishes. Now every run first looks for a breaking story: fresh (newest report under 6 h old), carried by `X_BREAKING_MIN_PUBLISHERS` (default 2) or more trusted publishers, any publisher's headline urgent (`isUrgentHeadline`), not an explainer. The most widely carried goes first; up to 3 stories are looked at and 2 written per run. Such a story ignores the category rotation and the daily pace, may run 5 minutes after the last article instead of 20 (`BREAKING_MIN_GAP_MS`), and may exceed the day's normal volume by `NEWS_BREAKING_EXTRA` articles (default 8, 0-24; 0 = priority only, no extra room; the ceiling is `NEWS_DAILY_CAP + NEWS_BREAKING_EXTRA` per IST day). The fact check and the pre-publication audit still apply: a breaking story the audit holds is a draft (the next candidate is tried, the draft is reported if none goes live) and is not tweeted. `saveBuiltArticle(..., { breaking: true })` hands it to `shareArticle`, where X counts it as breaking whatever the article's own flag says (log line `breaking news: picked up at once, carried by N publishers`), so it is tweeted at once with link and picture as in `X_MODE=breaking`. The site's own breaking flag is unchanged (3+ publishers, max 2 at once), so a 2-publisher lane story is tweeted but not in the site's breaking ticker. The urgent-word list was widened the same day (shootings, bombings, missiles, air strikes, quakes, tsunamis, landslides, stampedes, wildfires, derailments, hijackings, invasions, coups, martial law, "passes away"); it also feeds the site flag, so a few more headlines can reach the ticker. Not covered: the schedule still runs every 30 min, so a story can wait up to 30 min plus the writing time; to cut that, call `GET /api/cron/news?async=1` from an outside cron service every 5-10 min (the 5-minute guard keeps two callers from doubling up). Routine "arrested"/"verdict" headlines also qualify, so some lane articles and tweets will be ordinary news; raise `X_BREAKING_MIN_PUBLISHERS` to 3 (it also moves the lane) or set `NEWS_BREAKING_EXTRA=0` to tone it down. Tests: `breaking.test.ts`, `placement.test.ts`.

**Breaking alert on X, link after (owner decision 28 Nov 2026, "jo sabse phle break ho news tab hi turant x pr post ho"; answers: "pehle alert, baad me link", "trusted sites ke feeds"; `lib/social/xalert.ts` pure, `xalertRun.ts` database and X calls, `app/api/cron/breaking/route.ts`):** the fast lane above still needs minutes to read, write, fact-check and audit an article, so X first gets ONE short line, `BREAKING: <one plain sentence>`, tweeted as soon as 2+ trusted publishers carry a fresh story (newest report under 2 h old, an urgent headline, `X_BREAKING_MIN_PUBLISHERS`). The line is written by the model from the publishers' headlines and feed summaries only and checked in code (`checkAlertLine`): 50-220 characters, in its own words (no run of 8 words copied), every name in the reports, **every number given by at least two reports** (so a casualty count the outlets disagree on is left out), strong words ("terror", "murder", "massacre", "sabotage" ...) only when two reports use them, no outlet or agency named, no clickbait, `!`, shouting capitals, hashtags, links or emoji; one retry with the reasons, then **no alert** (the article path still tweets later; a story with no safe line is tried again after 15 min). The alert is a plain text tweet (about $0.015), not counted against the 5 links a day. When the article is published, `shareArticle` finds the alert (`findAlertFor`: same story by `findSameStory`, sent, not yet linked, under 12 h old) and posts the link as a **reply under the alert** (`postReply`, `Full report: <url>` with the checked fact line; this counts as the day's link, so `X_LINK_MODE=never` or an used-up link budget means no reply and the article tweet is skipped because the alert already told the story). If X refuses the reply the article gets its own tweet as before. An article the audit holds is a draft and gets no link: the alert then stands alone, so the audit's verdict is the check on the alert's story, not on its wording. State: one `settings` row per story (`xAlert:<hash of the lead headline>`, preview `xAlertDry:`), created with an insert that does nothing on conflict, so two overlapping cron calls cannot alert the same story twice; rows are pruned after 3 days. Budget: `X_ALERT_DAILY_CAP` (10) and `X_DAILY_CAP` over article tweets and alerts together, 2 alerts per run. Switches: the social mode in Admin > News Automation (off / preview / on: preview writes the line into the runtime log and sends nothing), `X_MODE=breaking`, X keys, `X_ALERTS=off`. **Who calls it:** `GET|POST /api/cron/breaking?async=1` (header `Authorization: Bearer <CRON_SECRET>`, same gate as `/api/cron/news`; does nothing when the schedule is paused in the admin): one read of the feeds, then `runXAlerts({stories})`, then the fast lane only (`runScheduledArticle({ breakingOnly: true, stories })`; the normal category flow never runs from this route). It is meant for an outside cron service **every 5 minutes** (cron-job.org; not every minute: Vercel Hobby function hours). `/api/cron/news` also runs `runXAlerts()` through `after()`, so alerts work at the 30-minute pace before the new job exists. Not covered: live posting of the alert and of the reply under it (X accepts a reply to one's own tweet, but it has never been run against the real API; use preview mode first and read the `X alerts:` log lines). Trade-offs to know: the alert is written from headlines and summaries, not from a full read, so it is only as good as the two reports agreeing; routine "arrested"/"verdict" headlines also qualify as urgent. **Second way in: a breaking post of an official news account on X, confirmed by a second source** (owner decision 28 Nov 2026, "jaroori nhi jo news website pr break ho wahi pick krna hai, x par official news organisation se break ho use bhi pick krna hai", then "2 sources se check krk post krna"; `lib/social/xposts.ts` pure, `searchSince()` in `xread.ts`, step 2 of `runXAlerts`). The story need not be on a website yet, but a post never goes out alone: it is a **claim until a second, independent organisation says the same**, either another account's post about the same event or a story in the feeds of the trusted publishers (`confirmPost`; same-event test = the headline rule of `dedupe.ts`). An account and the website of the same outlet count once (`ndtv` and NDTV, `the_hindu` and The Hindu BusinessLine: `orgOfHandle` / `orgOfPublisher`). Every run (the 5-minute breaking watch and the 30-minute news call) reads new posts of the handles in `X_BREAKING_SOURCES` (India and the world, up to 20 handles, split into as many searches as the 512-character query limit needs, usually 2: `searchPosts`/`postQueries`) with X search (`/tweets/search/recent`: original English posts only, no replies, retweets or quotes; the query already asks for a breaking marker or urgent words so X bills only posts that can qualify, about $0.005 a post; `since_id` and the waiting list live in `settings.xAlertPosts`; at least 90 s between reads). A post qualifies when it starts with a real breaking mark (BREAKING, JUST IN, FLASH, NEWS ALERT, DEVELOPING; a bare "Alert:" or "Urgent" does not count: weather, traffic and promos use them) or has an urgent headline (`isUrgentHeadline`: routine "arrested" and "verdict" posts qualify too, but each still needs a second organisation), and is under 45 min old. When one of the searches fails the cursor is not advanced (the posts already seen are dropped by id), and the log says `X post read partly failed`. An unconfirmed post waits in `pending` (max 20) and is re-checked every run against the new posts and the feeds, until it is 45 min old and is dropped. Not alerted: a story already alerted (headline match against earlier alert records) or already one of our articles of the last 48 h. Once two organisations agree, the line is written from **both** reports and checked exactly as a feeds alert is (`xalert.ts`: every name in the reports, every number and strong word given by both, no outlet named, no copied run of 8 words), so a casualty count only one of them gives is left out. If our own article about the event is published later, its link goes under the alert as for the feeds path. The allow-list of handles is still the safeguard against a hacked or parody account (edit `X_BREAKING_SOURCES`, a wrong handle just finds nothing). If the X search is refused (plan without search access, credits used up) the run logs `X post read failed: ...` and the feeds path keeps working. The X search has never been run against the real API: use preview mode first and read the `X alerts:` lines. Tests: `xalert.test.ts`, `xposts.test.ts`, `breaking.test.ts`.

**Only real breaking news on X, hashtags on the alert (owner decision 28 Nov 2026, after the Diljit Dosanjh concert "bomb threats" story went out as BREAKING: "jo breaking news ho usi ko breaking post krna hai"; "Hashtag and keywords bhi lagana hai post pr"; `lib/news/realBreaking.ts` pure, `hashtags.ts` `alertHashtags`, `xalert.ts` `cleanAlertTags`).** The site's `isUrgentHeadline` is wide on purpose (ticker, fast lane) and also matches routine words such as "arrested", "verdict", "sentenced" and a bare "bomb", so for X there is a stricter test, `isRealBreaking()`: a headline word from the same list **without** "arrested", "verdict", "sentenced" and bare "bomb(s)"; a bomb threat, scare or hoax is not breaking unless someone was hurt or killed (`ROUTINE_RE` / `GRAVE_RE`); and an **entertainment or sports** story (desk by `classifyStory`, or the article's own category) is not breaking unless something grave happened (death toll, stampede, blast, shooting, an earthquake, terror, a plane/bus/train crash, a star's death; "crash out", "dead rubber", "collapsed to 80 all out" do not count). It decides (1) which stories get an **alert** from the feeds (`runXAlerts`: `breakingCandidates(...).filter(isRealBreakingStory)`), (2) which **official X posts** can start one (`isBreakingPost`: a BREAKING/JUST IN mark still needs the story not to be quiet), (3) which **articles** X tweets as breaking (`shareArticle`: the fast lane's `breaking: true` and the 2-publisher rule use it; the site's own flag counts for X only when the article is an editor's or passes it; an editor's tick always counts). The site's ticker, the fast lane's publishing and `decidePlacement` are unchanged, so an entertainment story can still be published through the lane and shown in the ticker, but is not tweeted as breaking. Not covered: a headline whose urgent word is missing from the list (e.g. "kills") is not breaking for X; the Hindi word list is not used. **Hashtags on the alert:** the writer names 1-3 topic keywords of 1-3 words (`tags` in its JSON); `cleanAlertTags` keeps one only when every word is a word of the reports, it names no outlet and any strong claim word ("terror", "massacre" ...) is also in the checked line (a bad keyword is dropped, the alert still goes). The tweet is `BREAKING: <line>` + a line of up to three hashtags: two keywords (or one keyword and the desk tag, `#WorldNews`, `#IndiaNews` ...) and `#NewsEdition`; when the tweet is too long the last hashtag goes first, the line is never cut for a tag. The link reply under the alert carries the article's own hashtags (`pickHashtags('x')`) after `Full report: <url>` (fewer, then none, when too long). Article tweets, Telegram, Facebook and Instagram already had hashtags. Tests: `realBreaking.test.ts`, `xalert.test.ts`, `hashtags.test.ts`, `xposts.test.ts`.

Tests: `npm test` (node test runner via tsx; pure modules only, no network).
