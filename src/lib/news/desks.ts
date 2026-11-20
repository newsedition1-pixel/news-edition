/**
 * Desks: which author account publishes which category, and how a story is sorted into a category.
 *
 * Owner decision (20 Nov 2026): every category is published under a fixed author account.
 * Pure data + helpers (no server-only import) so it can be unit-tested.
 */

export interface Desk {
  /** Name of the author account, matched case-insensitively against `user.name`. */
  authorName: string
  /** Category slugs this author publishes. */
  slugs: string[]
}

export const DESKS: Desk[] = [
  { authorName: 'Amit Gautam', slugs: ['india', 'business'] },
  { authorName: 'News Edition Desk', slugs: ['world', 'politics'] },
  // "Haryana News" is the state-level section of the site, so it goes with State.
  { authorName: 'Sanjay Kumar', slugs: ['state', 'governance', 'haryana-news'] },
  { authorName: 'Rinki Gautam', slugs: ['entertainment'] },
]

/** Fixed order used to break ties when several categories are equally due. */
export const SCHEDULE_SLUGS: string[] = ['india', 'business', 'world', 'politics', 'entertainment', 'governance', 'state', 'haryana-news']

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function deskForSlug(slug: string): Desk | null {
  return DESKS.find((d) => d.slugs.includes(slug)) ?? null
}

export interface AuthorCandidate {
  id: string
  name: string
  role: string | null
  banned: boolean | null
  createdAt: Date | string
}

const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1 }

/**
 * The account to publish under for an author name. Several accounts can share a name (the site has
 * two "Amit Gautam"), so prefer the owner, then an admin, then the oldest account. Banned accounts
 * are never used. Returns null when there is no such account.
 */
export function pickAuthorId(candidates: AuthorCandidate[], authorName: string): string | null {
  const want = normalizeName(authorName)
  const matches = candidates
    .filter((c) => normalizeName(c.name) === want && !c.banned)
    .sort((a, b) => {
      const ra = ROLE_RANK[a.role ?? ''] ?? 2
      const rb = ROLE_RANK[b.role ?? ''] ?? 2
      if (ra !== rb) return ra - rb
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
  return matches[0]?.id ?? null
}

// ─── Sorting a story into a category ───────────────────────────────────────────

const RULES: Record<string, RegExp[]> = {
  entertainment: [
    /\b(bollywood|tollywood|kollywood|film|films|movie|movies|cinema|actor|actress|box office|trailer|teaser|ott|web series|netflix|prime video|jiocinema|hotstar|singer|album|concert|celebrity|celebrities|director|screenplay|sequel|biopic|grammy|oscar|oscars|bigg boss|reality show|television|tv show|serial)\b/i,
  ],
  business: [
    /\b(sensex|nifty|stock|stocks|shares|share price|market|markets|rbi|reserve bank|gdp|inflation|rupee|economy|economic|earnings|profit|revenue|ipo|sebi|tax|gst|bank|banks|banking|loan|startup|startups|trade|tariff|tariffs|exports|imports|crude|oil prices|gold|silver|investors|investment|mutual fund|company|companies|merger|acquisition|fiscal|budget|insurance|brokerage|bond|bonds|auto sales)\b/i,
  ],
  world: [
    /\b(u\.s\.|usa|united states|china|chinese|russia|russian|ukraine|gaza|israel|iran|iraq|syria|pakistan|bangladesh|sri lanka|nepal|afghanistan|taiwan|japan|south korea|north korea|europe|european|eu|nato|united nations|uk|britain|british|france|germany|canada|australia|trump|putin|xi jinping|zelensky|netanyahu|white house|kremlin|beijing|washington|london|brussels|middle east|africa|latin america|international|global)\b/i,
  ],
  politics: [
    /\b(bjp|congress|aap|tmc|shiv sena|ncp|rjd|jdu|sp|bsp|dmk|aiadmk|opposition|election|elections|poll|polls|campaign|lok sabha|rajya sabha|parliament|mp|mps|mla|mlas|minister|ministers|cabinet|prime minister|modi|rahul gandhi|kejriwal|amit shah|party|parties|coalition|manifesto|rally|vote|voters|voting|bypoll|seat sharing|speaker|resignation|ally|allies)\b/i,
  ],
  governance: [
    /\b(scheme|schemes|policy|policies|ministry|notification|guidelines|regulation|regulations|bill|amendment|ordinance|supreme court|high court|court|judgment|verdict|tribunal|rti|municipal|corporation|panchayat|public service|welfare|subsidy|pension|ration|aadhaar|digital india|smart city|infrastructure|rules|compliance|audit|cag|commission|bureaucrat|ias|civil services|administration|government)\b/i,
  ],
  'haryana-news': [/\b(haryana|gurugram|gurgaon|faridabad|rohtak|hisar|panipat|karnal|ambala|sonipat|sonepat|yamunanagar|kurukshetra|bhiwani|jind|sirsa|rewari|chandigarh|saini|khattar)\b/i],
  state: [
    /\b(state government|chief minister|punjab|uttar pradesh|bihar|maharashtra|gujarat|rajasthan|madhya pradesh|karnataka|kerala|tamil nadu|telangana|andhra pradesh|odisha|west bengal|assam|jharkhand|chhattisgarh|uttarakhand|himachal|goa|kashmir|jammu|manipur|meghalaya|tripura|mumbai|pune|lucknow|patna|jaipur|bhopal|bengaluru|bangalore|chennai|hyderabad|kolkata|ahmedabad|district|collector|municipality)\b/i,
  ],
  india: [/\b(india|indian|indians|new delhi|delhi|national|centre|union government|isro|army|indian army|railways|railway|monsoon|weather|flood|accident)\b/i],
}

/** Tie-break priority when two categories score the same: the more specific one wins. */
const PRIORITY = ['haryana-news', 'entertainment', 'business', 'world', 'governance', 'politics', 'state', 'india']

export interface StoryText {
  title: string
  summary?: string
  publisherKeys?: string[]
}

const WORLD_ONLY_PUBLISHERS = new Set(['bbc', 'al-jazeera'])

/**
 * Which category a story belongs to, by keywords in its headline (counted double) and summary.
 * Stories with no keyword hit go to India, except that BBC / Al Jazeera-only stories go to World.
 */
export function classifyStory(story: StoryText): string {
  const title = story.title ?? ''
  const summary = story.summary ?? ''
  let best: string | null = null
  let bestScore = 0
  for (const slug of PRIORITY) {
    let score = 0
    for (const rx of RULES[slug] ?? []) {
      const g = new RegExp(rx.source, 'gi')
      score += (title.match(g)?.length ?? 0) * 2 + (summary.match(g)?.length ?? 0)
    }
    if (score > bestScore) {
      best = slug
      bestScore = score
    }
  }
  const keys = story.publisherKeys ?? []
  if (!best || bestScore === 0) {
    return keys.length > 0 && keys.every((k) => WORLD_ONLY_PUBLISHERS.has(k)) ? 'world' : 'india'
  }
  // A foreign-only story that merely mentions "market" or "minister" is still a world story.
  if (keys.length > 0 && keys.every((k) => WORLD_ONLY_PUBLISHERS.has(k)) && best !== 'entertainment') return 'world'
  return best
}

/**
 * Categories ordered by how long ago the schedule last published in them: never-published first,
 * then the oldest. Ties keep the fixed `SCHEDULE_SLUGS` order. Slugs not in `lastPublished` are ignored.
 */
export function rotationOrder(lastPublished: Record<string, number | null>): string[] {
  const slugs = SCHEDULE_SLUGS.filter((s) => s in lastPublished)
  return slugs
    .map((slug, index) => ({ slug, index, at: lastPublished[slug] }))
    .sort((a, b) => {
      const aa = a.at ?? -Infinity
      const bb = b.at ?? -Infinity
      if (aa !== bb) return aa - bb
      return a.index - b.index
    })
    .map((x) => x.slug)
}

/**
 * The later of "last published" and "last tried" per category, so a category that was just tried
 * (even if it failed) goes behind the ones that were not.
 */
export function lastActivity(published: Record<string, number | null>, tried: Record<string, number>): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const [slug, at] of Object.entries(published)) {
    const t = tried[slug]
    out[slug] = at === null ? (t ?? null) : t === undefined ? at : Math.max(at, t)
  }
  return out
}
