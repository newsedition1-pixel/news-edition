import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ANSWER_DAILY_CAP, bareText, checkReply, deskDue, deskQuery, emptyState, mayAnswerNow, mergeDesk, parseReply, parseState, rankDeskTweets,
  rollDay, skipReason, targetsOf, writeAnswer, writeDeskDraft, DEFAULT_TARGETS, type DeskItem, type DeskTweet, type Mention,
} from './xreplies'

const NOW = new Date('2026-11-22T12:30:00Z') // 18:00 IST
const mention = (over: Partial<Mention> = {}): Mention => ({
  id: '1', authorId: 'u1', username: 'reader', text: '@NewsEdition_1 Will home loan EMIs change after this?', createdAt: new Date(NOW.getTime() - 20 * 60 * 1000).toISOString(),
  parentText: 'RBI keeps the repo rate unchanged at 5.5%. Home loan EMIs stay where they are.', followers: 120, accountCreatedAt: '2022-01-01T00:00:00Z', ...over,
})
const state = () => emptyState(NOW)

test('the message is read without the @names X puts in front, and without links', () => {
  assert.equal(bareText('@NewsEdition_1 @other Nice  summary https://t.co/x'), 'Nice summary')
})

test('only genuine, recent, answerable messages get an answer', () => {
  assert.equal(skipReason(mention(), state(), NOW, 'NewsEdition_1'), null)
  assert.match(skipReason(mention({ username: 'NewsEdition_1' }), state(), NOW, 'NewsEdition_1') ?? '', /own/)
  assert.match(skipReason(mention({ createdAt: new Date(NOW.getTime() - 9 * 3600 * 1000).toISOString() }), state(), NOW, 'x') ?? '', /old/)
  assert.match(skipReason(mention({ text: '@NewsEdition_1 ok' }), state(), NOW, 'x') ?? '', /short/)
  assert.match(skipReason(mention({ text: '@NewsEdition_1 check this https://spam.example/win' }), state(), NOW, 'x') ?? '', /link/)
  assert.match(skipReason(mention({ text: '@NewsEdition_1 you are a stupid godi media channel' }), state(), NOW, 'x') ?? '', /abusive/)
  assert.match(skipReason(mention({ text: '@NewsEdition_1 why is BJP silent on this one?' }), state(), NOW, 'x') ?? '', /political/)
  assert.match(skipReason(mention({ accountCreatedAt: '2026-11-15T00:00:00Z' }), state(), NOW, 'x') ?? '', /under 14 days/)
  const answered = { ...state(), users: { reader: state().day } }
  assert.match(skipReason(mention(), answered, NOW, 'x') ?? '', /already answered/)
})

test('answers are capped per day and kept apart; a new day starts again', () => {
  assert.equal(mayAnswerNow(state(), NOW), null)
  assert.match(mayAnswerNow({ ...state(), answered: ANSWER_DAILY_CAP }, NOW) ?? '', /daily limit/)
  assert.match(mayAnswerNow({ ...state(), lastAnswerAt: new Date(NOW.getTime() - 60 * 1000).toISOString() }, NOW) ?? '', /too soon/)
  const old = { ...state(), day: '2026-11-21', answered: 9, users: { reader: '2026-11-21' } }
  const next = rollDay(old, NOW)
  assert.deepEqual({ answered: next.answered, users: next.users }, { answered: 0, users: {} })
  assert.equal(rollDay(state(), NOW).answered, 0)
})

test('a reply must stay in its size, free of links and stay inside the facts', () => {
  const known = 'RBI keeps the repo rate unchanged at 5.5%. Home loan EMIs stay where they are.\nWill home loan EMIs change after this?'
  assert.deepEqual(checkReply('No change for now: the repo rate stays at 5.5%, so home loan EMIs stay as they are.', known, [], 200), [])
  assert.match(checkReply('See https://newsedition.in for more details on this story.', known, [], 200).join(' '), /link/)
  assert.match(checkReply('The repo rate stays at 6.5%, so EMIs stay as they are for now.', known, [], 200).join(' '), /figures/)
  assert.match(checkReply('Great question!', known, [], 200).join(' '), /characters|exclamation/)
  const again = 'No change for now: the repo rate stays at 5.5%, so home loan EMIs stay as they are.'
  assert.match(checkReply(again, known, [again], 200).join(' '), /sent before/)
})

test('the writer answers, refuses, or retries once', async () => {
  const good = JSON.stringify({ reply: 'No change for now: the repo rate stays at 5.5%, so home loan EMIs stay as they are.' })
  assert.match((await writeAnswer(async () => good, mention(), [])) ?? '', /No change for now/)
  assert.equal(await writeAnswer(async () => JSON.stringify({ reply: null }), mention(), []), null)
  assert.equal(await writeAnswer(async () => null, mention(), []), null)
  const answers = [JSON.stringify({ reply: 'The repo rate stays at 9% so EMIs stay put for the time being.' }), good]
  assert.match((await writeAnswer(async () => answers.shift() ?? null, mention(), [])) ?? '', /5.5%/)
  assert.equal(parseReply('not json'), null)
})

const tweet = (over: Partial<DeskTweet> = {}): DeskTweet => ({
  id: '10', username: 'RBI', name: 'RBI', text: 'RBI keeps the policy repo rate unchanged at 5.5%; the stance stays neutral, the Governor said on Friday.',
  createdAt: new Date(NOW.getTime() - 15 * 60 * 1000).toISOString(), likes: 40, replies: 10, followers: 1_000_000, ...over,
})

test('the desk picks fresh posts on safe topics and puts the freshest first', () => {
  const fresh = tweet({ id: '1' })
  const older = tweet({ id: '2', createdAt: new Date(NOW.getTime() - 80 * 60 * 1000).toISOString() })
  const stale = tweet({ id: '3', createdAt: new Date(NOW.getTime() - 5 * 3600 * 1000).toISOString() })
  const harm = tweet({ id: '4', text: 'Five workers killed in a factory fire in the industrial area, the police said on Friday.' })
  const short = tweet({ id: '5', text: 'Good morning' })
  const picked = rankDeskTweets([older, stale, harm, short, fresh], [], NOW)
  assert.deepEqual(picked.map((t) => t.id), ['1', '2'])
  const have: DeskItem[] = [{ id: '1', username: 'RBI', name: 'RBI', text: '', createdAt: '', url: '', draft: '', status: 'new' }]
  assert.deepEqual(rankDeskTweets([fresh, older], have, NOW).map((t) => t.id), ['2'])
})

test('a desk draft must add something checkable and not repeat the post', async () => {
  const good = JSON.stringify({ draft: 'Unchanged at 5.5% with a neutral stance: no new move on rates for now.' })
  assert.match((await writeDeskDraft(async () => good, tweet())) ?? '', /5.5%/)
  assert.equal(await writeDeskDraft(async () => JSON.stringify({ draft: null }), tweet()), null)
  const copy = JSON.stringify({ draft: 'RBI keeps the policy repo rate unchanged at 5.5%; the stance stays neutral, the Governor said.' })
  assert.equal(await writeDeskDraft(async () => copy, tweet()), null)
})

test('the desk refreshes a few times a day, in daytime only', () => {
  assert.equal(deskDue(undefined, NOW), true)
  assert.equal(deskDue(new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(), NOW), false)
  assert.equal(deskDue(new Date(NOW.getTime() - 4 * 3600 * 1000).toISOString(), NOW), true)
  assert.equal(deskDue(undefined, new Date('2026-11-22T20:00:00Z')), false) // 01:30 IST
})

test('the desk keeps open items of the last day, newest first, at most 20', () => {
  const item = (id: string, status: DeskItem['status'], ageH: number): DeskItem => ({ id, username: 'a', name: 'a', text: 't', createdAt: new Date(NOW.getTime() - ageH * 3600 * 1000).toISOString(), url: '', draft: 'd', status })
  const merged = mergeDesk([item('1', 'new', 2), item('2', 'done', 1), item('3', 'new', 30), item('4', 'new', 3)], [item('9', 'new', 0), item('4', 'new', 0)], NOW)
  assert.deepEqual(merged.map((i) => i.id), ['9', '4', '1'])
  const many = Array.from({ length: 30 }, (_, i) => item(`n${i}`, 'new', 0))
  assert.equal(mergeDesk([], many, NOW).length, 20)
})

test('targets come from the environment or the default list; the query asks for original posts only', () => {
  assert.deepEqual(targetsOf(undefined), DEFAULT_TARGETS)
  assert.deepEqual(targetsOf('@ANI, PTI_News  ANI bad-handle!'), ['ANI', 'PTI_News'])
  assert.equal(deskQuery(['ANI', 'RBI']), '(from:ANI OR from:RBI) -is:reply -is:retweet -is:quote lang:en')
})

test('stored state survives a bad value', () => {
  assert.deepEqual(parseState(null, NOW).users, {})
  assert.equal(parseState('{broken', NOW).answered, 0)
  assert.equal(parseState(JSON.stringify({ day: '2026-11-22', answered: 3 }), NOW).answered, 3)
})
