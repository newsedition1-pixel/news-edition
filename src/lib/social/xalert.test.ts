import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALERT_DAILY_CAP_DEFAULT, alertDailyCap, alertKeyOf, alertLinkText, alertsToday, alertTweetText, buildAlertPrompt, checkAlertLine,
  isAlerted, matchAlertForArticle, mentionedOutlets, parseAlertRecord, writeAlertLine, type AlertInput, type AlertRecord,
} from './xalert'
import { weightedLength, X_LIMIT } from './compose'

const NAMES = ['The Hindu', 'NDTV', 'BBC News', 'Al Jazeera', 'Scroll.in']

const blast: AlertInput = {
  reports: [
    { title: 'Seven killed, over 90 injured in explosion at school in Kabul', summary: 'An explosion tore through a school in the Afghan capital on Saturday morning, officials said.' },
    { title: 'Blast at Kabul school leaves 7 dead and more than 90 hurt', summary: 'Hospitals in Kabul received dozens of wounded children after the blast, the health ministry said.' },
  ],
}
const GOOD = 'A blast at a school in Kabul has killed 7 people and injured over 90, officials said.'

test('a plain, grounded line passes', () => {
  assert.deepEqual(checkAlertLine(GOOD, blast, NAMES), [])
})

test('an outlet or agency is never named', () => {
  assert.deepEqual(mentionedOutlets('NDTV says 7 people died', NAMES), ['NDTV'])
  assert.deepEqual(mentionedOutlets('Reuters reports a blast in Kabul', NAMES), ['Reuters'])
  assert.deepEqual(mentionedOutlets('A man named Ani Kumar was hurt', NAMES), [])
  const issues = checkAlertLine('According to The Hindu, a blast at a school in Kabul killed 7 and injured over 90 people.', blast, NAMES)
  assert.ok(issues.some((i) => /names a news outlet/.test(i)), issues.join(' | '))
})

test('a number that only one report gives is refused, a number both give is fine', () => {
  const issues = checkAlertLine('A blast at a school in Kabul has killed 12 people and injured over 90, officials said.', blast, NAMES)
  assert.ok(issues.some((i) => /not given by at least two reports: 12/.test(i)), issues.join(' | '))
  const oneSided: AlertInput = { reports: [blast.reports[0], { title: 'Blast at Kabul school: hospitals overwhelmed', summary: 'Dozens of wounded children were brought in.' }] }
  assert.ok(checkAlertLine(GOOD, oneSided, NAMES).some((i) => /not given by at least two reports/.test(i)))
})

test('spelled-out and digit numbers count as the same number', () => {
  assert.deepEqual(checkAlertLine('Seven people were killed and over 90 injured when an explosion hit a school in Kabul, officials said.', blast, NAMES), [])
})

test('a name that is in no report is refused', () => {
  const issues = checkAlertLine('A blast at a school in Kabul has killed 7 people and injured over 90, said Taliban spokesman Mujahid.', blast, NAMES)
  assert.ok(issues.some((i) => /not in the reports: .*Taliban/.test(i)), issues.join(' | '))
})

test('a strong word must be used by two reports', () => {
  const issues = checkAlertLine('A terror attack at a school in Kabul has killed 7 people and injured over 90, officials said.', blast, NAMES)
  assert.ok(issues.some((i) => /strong words/.test(i) && /terror/.test(i)), issues.join(' | '))
  const both: AlertInput = {
    reports: [
      { title: 'Terror attack at Kabul school kills 7, injures over 90', summary: 'Officials called it a terror attack.' },
      { title: 'Kabul school hit by terror attack, 7 dead, over 90 hurt', summary: 'The terror attack struck in the morning.' },
    ],
  }
  assert.deepEqual(checkAlertLine('A terror attack at a school in Kabul has killed 7 people and injured over 90, officials said.', both, NAMES), [])
})

test('copying a report, wrong length, clickbait, shouting and "Breaking" are refused', () => {
  const copied = checkAlertLine('An explosion tore through a school in the Afghan capital on Saturday morning, officials said.', blast, NAMES)
  assert.ok(copied.some((i) => /copies a run/.test(i)), copied.join(' | '))
  assert.ok(checkAlertLine('Blast at school', blast, NAMES).some((i) => /characters/.test(i)))
  assert.ok(checkAlertLine('Shocking blast at a school in Kabul has killed 7 people and injured over 90, officials said.', blast, NAMES).some((i) => /clickbait/.test(i)))
  assert.ok(checkAlertLine('A blast at a school in Kabul has killed 7 people and injured over 90, officials said!', blast, NAMES).some((i) => /exclamation/.test(i)))
  assert.ok(checkAlertLine('Breaking: a blast at a school in Kabul has killed 7 people and injured over 90, officials said.', blast, NAMES).some((i) => /Breaking/.test(i)))
})

test('the prompt carries the reports and no outlet name', () => {
  const p = buildAlertPrompt(blast)
  assert.match(p.user, /Report 1: Seven killed/)
  assert.match(p.user, /Report 2: Blast at Kabul school/)
  assert.doesNotMatch(p.user, /NDTV|BBC|Hindu/)
  assert.match(p.system, /at least two reports/)
})

test('writeAlertLine: first answer bad, second good', async () => {
  const answers = [JSON.stringify({ line: 'A blast at a school in Kabul has killed 12 people and injured over 90, officials said.' }), JSON.stringify({ line: GOOD })]
  let calls = 0
  const out = await writeAlertLine(async () => answers[calls++], blast, NAMES)
  assert.equal(calls, 2)
  assert.equal(out.line, GOOD)
})

test('writeAlertLine: gives up after two bad answers, on null, on no key and on one report', async () => {
  const bad = JSON.stringify({ line: 'According to The Hindu, a blast at a school in Kabul killed 7 and injured over 90 people.' })
  const out = await writeAlertLine(async () => bad, blast, NAMES)
  assert.equal(out.line, null)
  assert.ok(out.issues.length > 0)
  assert.equal((await writeAlertLine(async () => JSON.stringify({ line: null }), blast, NAMES)).line, null)
  assert.equal((await writeAlertLine(async () => null, blast, NAMES)).line, null)
  assert.equal((await writeAlertLine(async () => JSON.stringify({ line: GOOD }), { reports: [blast.reports[0]] }, NAMES)).line, null)
})

test('the alert text carries the prefix and fits a tweet', () => {
  assert.equal(alertTweetText(GOOD), `BREAKING: ${GOOD}`)
  assert.ok(weightedLength(alertTweetText('x'.repeat(220))) <= X_LIMIT)
})

test('the link reply: fact line plus link, or the title plus link, always inside a tweet', () => {
  const url = 'https://newsedition.in/article/blast-at-kabul-school'
  assert.equal(alertLinkText('The health ministry said hospitals are treating dozens of children.', 'Blast at Kabul school', url), `The health ministry said hospitals are treating dozens of children.\n\nFull report: ${url}`)
  assert.equal(alertLinkText(null, 'Blast at Kabul school', url), `Blast at Kabul school\n\nFull report: ${url}`)
  assert.ok(weightedLength(alertLinkText('y'.repeat(400), 'Title', url)) <= X_LIMIT)
})

const rec = (over: Partial<AlertRecord> = {}): AlertRecord => ({
  at: '2026-11-28T10:00:00.000Z', dry: false, status: 'sent', titles: ['Seven killed, over 90 injured in explosion at school in Kabul', 'Blast at Kabul school leaves 7 dead'], tweetId: '111', ...over,
})

test('the key is stable for a story and differs between real and preview', () => {
  assert.equal(alertKeyOf('Seven killed in explosion at Kabul school', false), alertKeyOf('seven killed in explosion at kabul school!', false))
  assert.notEqual(alertKeyOf('Seven killed in explosion at Kabul school', false), alertKeyOf('Seven killed in explosion at Kabul school', true))
  assert.notEqual(alertKeyOf('Seven killed in explosion at Kabul school', false), alertKeyOf('Flood kills dozens in Kerala', false))
  assert.match(alertKeyOf('anything here', false), /^xAlert:[0-9a-f]{8}$/)
  assert.match(alertKeyOf('anything here', true), /^xAlertDry:[0-9a-f]{8}$/)
})

test('a story is alerted once: later headlines of the same story are recognised', () => {
  const records = [rec()]
  assert.equal(isAlerted(records, ['Kabul school blast: 7 dead, over 90 hurt'], false), true)
  assert.equal(isAlerted(records, ['Flood kills dozens in Kerala, rescue under way'], false), false)
  // a preview alert does not block a real one
  assert.equal(isAlerted([rec({ dry: true })], ['Kabul school blast: 7 dead, over 90 hurt'], false), false)
})

test('alerts are counted per Indian day, real and preview apart', () => {
  const now = new Date('2026-11-28T12:00:00Z')
  const records = [rec(), rec({ at: '2026-11-28T05:00:00.000Z' }), rec({ at: '2026-11-27T05:00:00.000Z' }), rec({ status: 'failed' }), rec({ dry: true })]
  assert.equal(alertsToday(records, now, false), 2)
  assert.equal(alertsToday(records, now, true), 1)
})

test('the article finds its alert: same story, sent, not yet linked, recent', () => {
  const article = { title: 'Seven killed as blast hits school in Kabul', excerpt: 'More than 90 were injured in the blast at the Kabul school.', tags: ['Kabul', 'blast'] }
  const now = new Date('2026-11-28T11:00:00Z')
  const a = { key: 'xAlert:aaaaaaaa', rec: rec() }
  assert.equal(matchAlertForArticle([a], article, now), a)
  assert.equal(matchAlertForArticle([{ key: 'k', rec: rec({ linkTweetId: '222' }) }], article, now), null)
  assert.equal(matchAlertForArticle([{ key: 'k', rec: rec({ status: 'failed' }) }], article, now), null)
  assert.equal(matchAlertForArticle([{ key: 'k', rec: rec({ dry: true }) }], article, now), null)
  assert.equal(matchAlertForArticle([{ key: 'k', rec: rec({ at: '2026-11-27T10:00:00.000Z' }) }], article, now), null)
  assert.equal(matchAlertForArticle([a], { title: 'RBI keeps repo rate unchanged', excerpt: null, tags: [] }, now), null)
})

test('the stored record is read back, and junk is refused', () => {
  const r = rec()
  assert.deepEqual(parseAlertRecord(JSON.stringify(r)), r)
  assert.equal(parseAlertRecord(null), null)
  assert.equal(parseAlertRecord('not json'), null)
  assert.equal(parseAlertRecord(JSON.stringify({ at: 5 })), null)
  assert.equal(parseAlertRecord(JSON.stringify({ at: 'x', titles: [], status: 'weird' }))?.status, 'writing')
})

test('X_ALERT_DAILY_CAP: 0..30, default 10', () => {
  assert.equal(alertDailyCap(undefined), ALERT_DAILY_CAP_DEFAULT)
  assert.equal(alertDailyCap('0'), 0)
  assert.equal(alertDailyCap('30'), 30)
  assert.equal(alertDailyCap('31'), ALERT_DAILY_CAP_DEFAULT)
  assert.equal(alertDailyCap('lots'), ALERT_DAILY_CAP_DEFAULT)
})

// ── one official post (xposts.ts) ───────────────────────────────────────────

const post: AlertInput = { single: true, reports: [{ title: 'Explosion near Red Fort in Delhi, 8 injured, fire tenders at the spot', summary: '' }] }

test('single post: the line may use what the post says, a shorter line is fine', () => {
  assert.deepEqual(checkAlertLine('Eight people were hurt in an explosion near the Red Fort in Delhi.', post, NAMES), [])
  assert.deepEqual(checkAlertLine('8 injured in a blast near Red Fort, Delhi.', post, NAMES), [])
})

test('single post: a number, a name or a strong word that is not in the post is refused', () => {
  assert.ok(checkAlertLine('Twelve people were hurt in an explosion near the Red Fort in Delhi.', post, NAMES).some((i) => /numbers/.test(i)))
  assert.ok(checkAlertLine('Eight people were hurt in an explosion near the Red Fort in Delhi, said Delhi Police Commissioner Rao.', post, NAMES).some((i) => /not in the reports/.test(i)))
  assert.ok(checkAlertLine('A terror attack near the Red Fort in Delhi left eight people injured today.', post, NAMES).some((i) => /strong words/.test(i)))
})

test('single post: still no outlet, no copied run, no clickbait', () => {
  assert.ok(checkAlertLine('Reuters says eight people were hurt in an explosion near the Red Fort in Delhi.', post, NAMES).some((i) => /outlet/.test(i)))
  assert.ok(checkAlertLine('Explosion near Red Fort in Delhi, 8 injured, fire tenders at the spot say officials.', post, NAMES).some((i) => /copies a run/.test(i)))
  assert.ok(checkAlertLine('Shocking explosion near the Red Fort in Delhi leaves eight people hurt.', post, NAMES).some((i) => /clickbait/.test(i)))
})

test('single post: one report is enough only in single mode, and the prompt says so', async () => {
  const bad = await writeAlertLine(async () => JSON.stringify({ line: 'Eight people were hurt in an explosion near the Red Fort in Delhi.' }), { reports: post.reports }, NAMES)
  assert.equal(bad.line, null)
  const ok = await writeAlertLine(async () => JSON.stringify({ line: 'Eight people were hurt in an explosion near the Red Fort in Delhi.' }), post, NAMES)
  assert.equal(ok.line, 'Eight people were hurt in an explosion near the Red Fort in Delhi.')
  const p = buildAlertPrompt(post)
  assert.match(p.system, /ONE breaking post/)
  assert.match(p.user, /^Post: Explosion near Red Fort/)
  assert.doesNotMatch(buildAlertPrompt(blast).system, /ONE breaking post/)
})
