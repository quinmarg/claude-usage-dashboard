import { expect, test } from 'claude-code/testing'
import { fitFont, fmt, levelFor, miniWidths, recommend, summarize, textWidth, untilText } from '../hooks/register'

const d = (out: number, sessions = 1) => ({ in: 10, out, cr: 1000, cw: 5, sessions })
const stats = {
  today: '2026-11-10',
  at: 0,
  models: [['claude-opus-5-5', 900]] as [string, number][],
  days: {
    '2026-11-07': d(900),
    '2026-11-08': d(100),
    '2026-11-09': d(300),
    '2026-11-10': d(800),
  },
}
const live = { now: Date.parse('2026-11-10T15:00:00Z'), agents: [], limits: [], ctxPercent: null, ctxTokens: null, ctxWindow: null, usd: null }

test('numbers shorten', () => {
  expect(fmt(950)).toBe('950')
  expect(fmt(6_200_000)).toBe('6.2M')
  expect(fmt(2_110_000_000)).toBe('2.11B')
})

test('summary totals, busiest day and streaks', () => {
  const s = summarize(stats)
  expect(s.best).toBe('2026-11-07')
  expect(s.sum.out).toBe(2100)
  expect(s.longest).toBe(4)
  expect(s.current).toBe(4)
})

test('heaviest day is the darkest square, no activity is empty', () => {
  const level = levelFor(stats)
  expect(level('2026-11-07')).toBe(4)
  expect(level('2026-11-01')).toBe(0)
})

test('time until a reset', () => {
  expect(untilText('2026-11-10T17:14:00Z', live.now)).toBe('2h')
  expect(untilText('2026-11-10T15:12:00Z', live.now)).toBe('15m')
  expect(untilText('2026-11-10T14:00:00Z', live.now)).toBe('now')
  expect(untilText(null, live.now)).toBe('')
})

test('recommendations react to limits, a full chat and a heavy day', () => {
  const tips = recommend(stats, {
    ...live,
    ctxPercent: 72,
    limits: [{ kind: 'five_hour', percentUsed: 93, resetsAt: '2026-11-10T17:00:00Z' }],
  })
  expect(tips[0]).toMatch(/5-hour limit at 93%, resets in 2h/)
  expect(tips.some(t => /72% full/.test(t))).toBe(true)
  expect(tips.length).toBeLessThanOrEqual(4)
  expect(recommend(null, live)).toEqual(['Usage looks healthy. Nothing to change.'])
})

import { busyChats, dashboardSvg, describeTool, esc, suggestEnv, workRows, wrap, EMPTY_WORK } from '../hooks/register'

test('text wraps by words and escapes markup', () => {
  expect(wrap('one two three four', 9)).toEqual(['one two', 'three', 'four'])
  expect(esc('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;')
})

test('dashboard svg: total at the top, every section, sized to the pane', () => {
  const l = { ...live, agents: [{ id: 'a1', name: 'Fix <bug> & ship', type: 'mid-worker', status: 'running' }], limits: [{ kind: 'five_hour', percentUsed: 41, resetsAt: '2026-11-10T17:00:00Z' }], ctxPercent: 22, ctxTokens: 44000 }
  const wk = { ...EMPTY_WORK, agents: [{ id: 'a1', name: 'Fix <bug> & ship', type: 'mid-worker', model: 'claude-sonnet-5-5', status: 'running', startedAt: live.now - 180000, endedAt: null, tools: 4, lastTool: 'Bash ls' }] }
  const narrow = dashboardSvg(stats, l, 420, wk)
  expect(narrow.width).toBe(420)
  expect(narrow.svg.startsWith('<svg')).toBe(true)
  expect(narrow.svg.endsWith('</svg>')).toBe(true)
  for (const part of ['TOTAL TOKENS', 'Activity', 'Last 14 days', 'Working now', 'Models', 'Recommendations', '5-hour', 'Weekly', 'This chat']) {
    expect(narrow.svg.includes(part)).toBe(true)
  }
  expect(narrow.svg.indexOf('TOTAL TOKENS')).toBeLessThan(narrow.svg.indexOf('Activity'))
  expect(narrow.svg.includes('Fix &lt;bug&gt; &amp; ship')).toBe(true)
  expect(narrow.svg.includes('<bug>')).toBe(false)
  expect(narrow.svg.length).toBeLessThan(131072)
  // A wide pane shows more weeks in the activity rectangle.
  const wide = dashboardSvg(stats, l, 860, wk)
  const weeksOf = (svg: string) => Number(/last (\d+) weeks/i.exec(svg)?.[1])
  expect(weeksOf(wide.svg)).toBeGreaterThan(weeksOf(narrow.svg))
  expect(dashboardSvg(null, null, 420).svg.includes('Reading your Claude Code logs')).toBe(true)
})

test('work: main chat first, running agents next, finished ones kept 15 minutes', () => {
  const now = live.now
  const wk = {
    main: { busy: true, since: now - 60000, tools: 3, lastTool: 'Edit register.tsx' },
    agents: [
      { id: 'b', name: 'Second', type: 'opus-worker', model: '', status: 'running', startedAt: now - 30000, endedAt: null, tools: 1, lastTool: '' },
      { id: 'a', name: 'First', type: 'mid-worker', model: '', status: 'running', startedAt: now - 90000, endedAt: null, tools: 2, lastTool: '' },
      { id: 'c', name: 'Done', type: 'mid-worker', model: '', status: 'completed', startedAt: now - 600000, endedAt: now - 120000, tools: 9, lastTool: '' },
      { id: 'd', name: 'Old', type: 'mid-worker', model: '', status: 'completed', startedAt: now - 9e6, endedAt: now - 3e6, tools: 9, lastTool: '' },
    ],
  }
  const { running, done } = workRows(wk, now, 'Weekly report')
  expect(running.map(r => r.name)).toEqual(['Weekly report', 'First', 'Second'])
  expect(workRows(wk, now).running[0].name).toBe('Main chat')
  expect(done.map(r => r.name)).toEqual(['Done'])
  expect(workRows(null, now).running.length).toBe(0)
})

test('work card moves to the top while anything runs', () => {
  const busy = { ...EMPTY_WORK, main: { busy: true, since: live.now - 60000, tools: 2, lastTool: 'Bash ls' } }
  const top = dashboardSvg(stats, live, 420, busy).svg
  expect(top.includes('Working now')).toBe(true)
  expect(top.indexOf('Working now')).toBeLessThan(top.indexOf('TOTAL TOKENS'))
  const idle = dashboardSvg(stats, live, 420, EMPTY_WORK).svg
  expect(idle.includes('Nothing running right now')).toBe(true)
  expect(idle.indexOf('TOTAL TOKENS')).toBeLessThan(idle.indexOf('Nothing running'))
})

test('suggests the folder a task fits, only when it is clear', () => {
  const envs = [
    { path: '/u/Documents/budget-tracker', last: '', name: ['budget', 'tracker'], words: ['spreadsheet', 'expense', 'receipt', 'skill'] },
    { path: '/u/Documents/recipe-blog', last: '', name: ['recipe', 'blog'], words: ['sourdough', 'post', 'idea'] },
    { path: '/u/Downloads/notes-standalone', last: '', name: ['notes', 'standalone'], words: ['model', 'app', 'words'] },
  ]
  expect(suggestEnv('add a receipt scanner to the budget tracker spreadsheet', envs)?.path).toBe('/u/Documents/budget-tracker')
  expect(suggestEnv('new recipe post idea for sourdough', envs)?.path).toBe('/u/Documents/recipe-blog')
  expect(suggestEnv('the notes app rewrites words', envs)?.path).toBe('/u/Downloads/notes-standalone')
  expect(suggestEnv('what is 2 + 2', envs)).toBe(null)
  // generic words are not a project match
  expect(suggestEnv('make me a button to pull up the dashboard in a chat on claude, its easy', envs)).toBe(null)
  // two shared project words is chance, not a fit
  expect(suggestEnv('a model app', envs)).toBe(null)
  expect(suggestEnv('', envs)).toBe(null)
})

test('front card (new chat) and work card (busy) are compact cuts of the dashboard', () => {
  const busy = { ...EMPTY_WORK, main: { busy: true, since: live.now - 60000, tools: 2, lastTool: 'Bash ls' }, agents: [{ id: 'a', name: 'Helper', type: 'mid-worker', model: '', status: 'running', startedAt: live.now - 30000, endedAt: null, tools: 1, lastTool: '' }] }
  const home = dashboardSvg(stats, live, 600, busy, 'home').svg
  expect(home.includes('TOTAL TOKENS')).toBe(true)
  expect(home.includes('Working now')).toBe(true)
  expect(home.includes('Activity')).toBe(false)
  expect(home.includes('Recommendations')).toBe(false)
  const work = dashboardSvg(stats, { ...live, title: 'Weekly report' }, 600, busy, 'work').svg
  expect(work.includes('Working now')).toBe(true)
  expect(work.includes('Weekly report')).toBe(true)
  expect(work.includes('TOTAL TOKENS')).toBe(false)
  expect(work.includes('CLAUDE CODE')).toBe(false)
})

test('work from every chat on the Mac: this chat first, then each other chat by name', () => {
  const now = live.now
  const mine = { main: { busy: true, since: now - 60000, tools: 2, lastTool: '' }, agents: [] }
  const others = [
    { sessionId: 's2', title: 'Repository evaluation', cwd: '/u/repo', updatedAt: now, main: { busy: true, since: now - 30000, tools: 5, lastTool: 'Run tests' },
      agents: [{ id: 'x', name: 'Scan imports', type: 'Explore', model: '', status: 'running', startedAt: now - 20000, endedAt: null, tools: 3, lastTool: '' }] },
    { sessionId: 's3', title: null, cwd: '/u/Documents/budget-tracker', updatedAt: now, main: { busy: false, since: 0, tools: 0, lastTool: '' },
      agents: [{ id: 'y', name: 'Load data', type: 'opus-worker', model: '', status: 'running', startedAt: now - 10000, endedAt: null, tools: 1, lastTool: '' }] },
  ]
  const { running } = workRows(mine, now, 'Weekly report', others)
  expect(running.map(r => r.name)).toEqual(['Weekly report', 'Repository evaluation', 'Scan imports', 'Load data'])
  expect(running.map(r => r.where)).toEqual([undefined, 'Repository evaluation', 'Repository evaluation', 'Chat in budget-tracker'])
  expect(busyChats(running)).toBe(3)
  const svg = dashboardSvg(stats, { ...live, title: 'Weekly report', others }, 600, mine, 'work').svg
  expect(svg.includes('4 running · 3 chats')).toBe(true)
  expect(svg.includes('in Repository evaluation')).toBe(true)
})

test('a Bash call shows its description, not the raw command', () => {
  expect(describeTool('Bash', { command: 'R="/private/tmp/x"; ls $R', description: 'List the temp folder' })).toBe('List the temp folder')
  expect(describeTool('Bash', { command: 'git status' })).toBe('Bash git status')
  expect(describeTool('Read', { file_path: '/a/b/register.tsx' })).toBe('Read register.tsx')
})

test('the live top and the slow body are separate pictures', () => {
  const busy = { ...EMPTY_WORK, main: { busy: true, since: live.now - 60000, tools: 2, lastTool: '' } }
  const top = dashboardSvg(stats, live, 600, busy, 'top').svg
  const body = dashboardSvg(stats, live, 600, busy, 'body').svg
  expect(top.includes('Working now')).toBe(true)
  expect(top.includes('TOTAL TOKENS')).toBe(false)
  expect(body.includes('TOTAL TOKENS')).toBe(true)
  expect(body.includes('Working now')).toBe(false)
  expect(body.includes('CLAUDE CODE')).toBe(false)
  // the body does not change when only the clock or the work moves on
  const later = { ...live, now: live.now + 60000 }
  const busier = { ...busy, main: { ...busy.main, tools: 9, lastTool: 'Edit x' } }
  expect(dashboardSvg(stats, later, 600, busier, 'body').svg).toBe(body)
})

test('hero mini stats: every value fits its column, even long Fable totals', () => {
  for (const total of [300, 360, 520]) {
    const items: [string, string][] = [['Fable', '140.6M'], ['Output', '7.3M'], ['Sessions', '141'], ['Days', '17'], ['Streak', '7d']]
    const w = miniWidths(items, total)
    expect(Math.round(w.reduce((a, b) => a + b, 0))).toBe(total)
    items.forEach(([, v], i) => {
      const size = fitFont(v, w[i] - (i === 0 ? 20 : 12), i === 0 ? 16 : 14)
      expect(textWidth(v, size)).toBeLessThanOrEqual(w[i] - (i === 0 ? 20 : 12) + 0.5)
    })
    expect(w[0]).toBeGreaterThan(w[3])  // the Fable column is wider than Days
  }
})

import { addDays, quoteFor, QUOTES } from '../hooks/register'

test('museum cards: the painting as a wall label, reminders, and a line of the day', () => {
  const mu = { wall: { title: 'Ulysses Deriding Polyphemus', artist: 'J.M.W. Turner', year: '1829', room: 'Odyssey' }, reminders: ['Run the widgets install.sh', 'Allow Accessibility for <Window Border>'] }
  for (const width of [380, 560, 760]) {
    const home = dashboardSvg(stats, live, width, EMPTY_WORK, 'home', mu).svg
    expect(home.includes('ON YOUR WALL')).toBe(true)
    expect(home.includes('Ulysses Deriding Polyphemus')).toBe(true)
    expect(home.includes('J.M.W. Turner · 1829')).toBe(true)
    expect(home.includes('For you today')).toBe(true)
    expect(home.includes('2 REMINDERS')).toBe(true)
    expect(home.includes('&lt;Window Border&gt;')).toBe(true)
    expect(home.indexOf('TOTAL TOKENS')).toBeLessThan(home.indexOf('ON YOUR WALL'))
    expect(home.includes('Activity')).toBe(false)
  }
  // No reminders: says so; no museum data yet: the cards wait instead of claiming "all clear".
  const clear = dashboardSvg(stats, live, 560, EMPTY_WORK, 'home', { wall: null, reminders: [] }).svg
  expect(clear.includes('all clear'.toUpperCase())).toBe(true)
  expect(clear.includes('ON YOUR WALL')).toBe(false)
  expect(dashboardSvg(stats, live, 560, EMPTY_WORK, 'home').svg.includes('For you today')).toBe(false)
  // More than four reminders: four shown and a count.
  const many = dashboardSvg(stats, live, 560, EMPTY_WORK, 'body', { wall: null, reminders: ['a', 'b', 'c', 'd', 'e', 'f'] }).svg
  expect(many.includes('+2 more')).toBe(true)
})

test('line of the day: one per day, same all day, cycles through the list', () => {
  expect(quoteFor('2026-11-11')).toEqual(quoteFor('2026-11-11'))
  expect(quoteFor('2026-11-11')).not.toEqual(quoteFor('2026-11-12'))
  const seen = new Set(Array.from({ length: QUOTES.length }, (_, i) => quoteFor(addDays('2026-01-01', i))[0]))
  expect(seen.size).toBe(QUOTES.length)
  const svg = dashboardSvg(stats, live, 380, EMPTY_WORK, 'body', { wall: null, reminders: [] }).svg
  expect(svg.includes(esc(quoteFor(stats.today)[1]))).toBe(true)
})

test('the look is Museum + glass: gold accent, Baskerville, no iOS blue', () => {
  const svg = dashboardSvg(stats, live, 560, EMPTY_WORK, 'full', { wall: null, reminders: [] }).svg
  expect(svg.includes('#C9A45C')).toBe(true)
  expect(svg.includes('Baskerville')).toBe(true)
  expect(svg.includes('#EFE6D2')).toBe(true)
  for (const blue of ['#007aff', '#0a84ff', '#5e5ce6']) expect(svg.includes(blue)).toBe(false)
})

test('limits warn with a sign as well as a colour, like the desktop widget', () => {
  const hot = { ...live, limits: [{ kind: 'five_hour', percentUsed: 93, resetsAt: null }, { kind: 'seven_day', percentUsed: 74, resetsAt: null }] }
  const svg = dashboardSvg(stats, hot, 560, EMPTY_WORK, 'body', null).svg
  expect(svg.includes('‼ limit')).toBe(true)
  expect(svg.includes('▲ limit')).toBe(true)
  expect(svg.includes('#C8452E')).toBe(true)
  expect(svg.includes('#E58A3A')).toBe(true)
})

test('a reminder with a long path stays inside the card', () => {
  const svg = dashboardSvg(stats, live, 380, EMPTY_WORK, 'home', { wall: null, reminders: ['Install: double-click Documents/museum-screensaver/build/Museum.saver now'] }).svg
  expect(svg.includes('Documents/museum-screensaver/build/Museum.saver')).toBe(false)
  expect(svg.includes('…')).toBe(true)
})
