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
  // Owner decision (24 Nov 2026): the new Sports and Technology categories are published under Gaurav.
  // The name must match the account exactly (after trimming and ignoring case): "GAURAV" is a different
  // account from "Gaurav Kumar".
  { authorName: 'Gaurav', slugs: ['sports', 'technology'] },
]

/** Fixed order used to break ties when several categories are equally due. */
export const SCHEDULE_SLUGS: string[] = ['india', 'business', 'world', 'politics', 'entertainment', 'governance', 'state', 'haryana-news', 'sports', 'technology']

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
    /\b(u\.s\.|usa|united states|china|chinese|russia|russian|ukraine|gaza|israel|iran|iraq|syria|pakistan|bangladesh|sri lanka|nepal|afghanistan|taiwan|japan|south korea|north korea|europe|european|eu|nato|united nations|uk|britain|british|france|germany|canada|australia|trump|putin|xi jinping|zelensky|netanyahu|white house|kremlin|beijing|washington|london|brussels|middle east|africa|latin america|international|global|vietnam|hanoi|indonesia|jakarta|malaysia|singapore|thailand|philippines|myanmar|cambodia|turkey|türkiye|turkiye|ankara|istanbul|antalya|egypt|saudi|saudi arabia|uae|dubai|abu dhabi|qatar|kuwait|oman|yemen|lebanon|jordan|brazil|mexico|argentina|chile|colombia|peru|venezuela|cuba|nigeria|kenya|ethiopia|sudan|south africa|italy|spain|portugal|poland|sweden|norway|denmark|finland|switzerland|netherlands|belgium|austria|greece|ireland|new zealand|tokyo|seoul|paris|berlin|rome|madrid|moscow|kyiv|kiev|tehran|islamabad|lahore|karachi|dhaka|kathmandu|colombo|kabul|cop\d+|g7|g20|brics|imf|world bank|nato|asean|michigan|california|texas|new york|florida|chicago|los angeles|toronto|sydney|melbourne)\b/i,
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
  // Sports and Technology (24 Nov 2026). Words that also mean something else in ordinary news are left out on
  // purpose ("match", "goal", "final", "medal", "internet", "drone", "cyber", bare "technology"): a wrong hit files
  // a story under Gaurav's desk, and the headline counts double.
  sports: [
    /\b(cricket|cricketer|cricketers|ipl|bcci|icc|t20|t20i|odi|odis|test match|test series|ranji|wicket|wickets|innings|batter|batters|batsman|bowler|bowlers|football|footballer|footballers|fifa|uefa|premier league|la liga|champions league|indian super league|tennis|wimbledon|grand slam|hockey|kabaddi|badminton|basketball|nba|nfl|baseball|rugby|olympic|olympics|olympian|olympians|paralympic|paralympics|commonwealth games|asian games|world cup|athlete|athletes|athletics|medallist|medalist|wrestler|wrestlers|wrestling|boxer|boxers|golf|chess|grandmaster|formula 1|formula one|f1|grand prix|motogp|marathon|tournament|tournaments|trophy|goalkeeper|striker|midfielder|semi-?finals?|quarter-?finals?|sports|sport|sportsperson)\b/i,
  ],
  technology: [
    // "AI" followed by a number is an Air India flight code (AI-171), not artificial intelligence.
    /\b(artificial intelligence|ai(?![-\s]?\d)|generative ai|machine learning|chatgpt|openai|anthropic|chatbot|chatbots|deepfake|deepfakes|software|hardware|app|apps|smartphone|smartphones|iphone|android|ios|samsung|google|microsoft|apple|nvidia|qualcomm|whatsapp|semiconductor|semiconductors|chip|chips|chipmaker|chipmakers|gpu|processor|laptop|laptops|gadget|gadgets|smartwatch|5g|6g|broadband|cybersecurity|cyberattack|cyberattacks|ransomware|malware|hacker|hackers|data breach|data centre|data centres|data center|data centers|cloud computing|quantum computing|quantum|robot|robots|robotics|big tech|tech giant|tech giants|tech company|tech companies|tech firm|tech firms|tech stocks|tech sector|tech industry)\b/i,
  ],
}

/**
 * Tie-break priority when two categories score the same: the more specific one wins. Sports and Technology
 * come right after Haryana News, so a story that fits one of them equally well as a general category
 * ("India beat Australia in the third T20I", "US tightens AI chip exports to China") goes to them.
 */
const PRIORITY = ['haryana-news', 'sports', 'technology', 'entertainment', 'business', 'world', 'governance', 'politics', 'state', 'india']

export interface StoryText {
  title: string
  summary?: string
  publisherKeys?: string[]
}

const WORLD_ONLY_PUBLISHERS = new Set(['bbc', 'al-jazeera'])

/**
 * Words that tie a story to India. A story that names a foreign country or city and none of these is a world
 * story, even when an Indian publisher carries it and it also says "accident", "court" or "minister" (24 Nov audit:
 * a Vietnam blast, an Indonesia factory fire and COP31 landed in India, a Michigan lawsuit in Governance).
 */
const INDIA_RX = new RegExp(
  [
    String.raw`\b(india|indian|indians|new delhi|delhi|union government|isro|indian army|lok sabha|rajya sabha|bjp|congress|aap|modi|rahul gandhi|kejriwal|amit shah|rbi|sebi|rupee|rupees|crore|lakh)\b`,
    RULES['haryana-news'][0].source,
    RULES.state[0].source.replace('|district|collector|municipality', ''),
  ].join('|'),
  'i'
)
const DOMESTIC_DESKS = new Set(['india', 'governance', 'politics', 'state'])

/** Every category with a keyword hit, best first (headline hits count double); ties go by `PRIORITY`. */
export function categoryScores(story: StoryText): { slug: string; score: number }[] {
  const title = story.title ?? ''
  const summary = story.summary ?? ''
  return PRIORITY.map((slug, order) => {
    let score = 0
    for (const rx of RULES[slug] ?? []) {
      const g = new RegExp(rx.source, 'gi')
      score += (title.match(g)?.length ?? 0) * 2 + (summary.match(g)?.length ?? 0)
    }
    return { slug, score, order }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ slug, score }) => ({ slug, score }))
}

/** Categories that keep their own desk even when only BBC / Al Jazeera carry the story. */
const FOREIGN_KEEPS_OWN_DESK = new Set(['entertainment', 'sports', 'technology'])

/**
 * Which category a story belongs to, by keywords in its headline (counted double) and summary.
 * Stories with no keyword hit go to India, except that BBC / Al Jazeera-only stories go to World.
 */
export function classifyStory(story: StoryText): string {
  const best = categoryScores(story)[0]?.slug ?? null
  const keys = story.publisherKeys ?? []
  const foreignOnly = keys.length > 0 && keys.every((k) => WORLD_ONLY_PUBLISHERS.has(k))
  if (!best) return foreignOnly ? 'world' : 'india'
  // A foreign-only story that merely mentions "market" or "minister" is still a world story, but a foreign
  // football or AI story is still a sports or technology story.
  if (foreignOnly && !FOREIGN_KEEPS_OWN_DESK.has(best)) return 'world'
  if (DOMESTIC_DESKS.has(best)) {
    const text = `${story.title ?? ''} ${story.summary ?? ''}`
    const worldHit = RULES.world.some((rx) => rx.test(text))
    if (worldHit && !INDIA_RX.test(text)) return 'world'
  }
  return best
}

/**
 * Other categories a story also fits (a keyword hit, but not the best one), best first. Used only to
 * fill a category that has had no article for a day: the story is then published there instead.
 */
export function alternativeCategories(story: StoryText, limit = 2): string[] {
  const chosen = classifyStory(story)
  return categoryScores(story)
    .map((x) => x.slug)
    .filter((slug) => slug !== chosen)
    .slice(0, limit)
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
