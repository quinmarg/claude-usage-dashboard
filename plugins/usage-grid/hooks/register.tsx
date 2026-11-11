import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { AgentLine, ChatWork, DayStat, Env, Limit, Live, Stats, Task, Work, WorkRow } from '../types'

type Engine = Parameters<Hook<'session.start'>>[0]

const PANE = 'usage-grid'
const TITLE = 'Dashboard'
// Change a tag when its type changes shape: it declines what an earlier version stored.
const stats = atom({ plugin: 'usage-grid', key: 'stats' } as const, null, { shape: 'stats-2' })
const live = atom({ plugin: 'usage-grid', key: 'live' } as const, null, { shape: 'live-3' })
const task = atom({ plugin: 'usage-grid', key: 'task' } as const, null, { shape: 'task-1' })
export const EMPTY_WORK: Work = { main: { busy: false, since: 0, tools: 0, lastTool: '' }, agents: [] }
const work = atom({ plugin: 'usage-grid', key: 'work' } as const, EMPTY_WORK, { shape: 'work-1' })
const ROW = 'dashboard'
// The chat's folder, as the menu draws it: a folder change redraws the ✓ and the suggestion.
const where = atom({ plugin: 'usage-grid', key: 'where' } as const, '')
// A switch on its way: shown in the menu until the chat lands there (or it plainly did not happen).
const pending = atom({ plugin: 'usage-grid', key: 'pending' } as const, null, { shape: 'pending-1' })
// The work card over the prompt: hidden by the person until they show it again (this chat).
const workHidden = atom({ plugin: 'usage-grid', key: 'workHidden' } as const, false)

// Empty day, then four steps light to heavy. Chosen to read on dark and light panes.
const RAMP = ['#3a4048', '#2f5a8a', '#3f7fc4', '#5fa3e8', '#9fd0ff']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ACTIVE = new Set(['pending', 'running', 'waiting'])

/** "Bash git status", "Read register.tsx": a tool call in a few words. */
export const describeTool = (tool: string, e: Record<string, unknown>): string => {
  const name = tool.startsWith('mcp__') ? tool.split('__').slice(1).join(':') : tool
  const arg =
    (typeof e.file_path === 'string' && e.file_path.split('/').pop()) ||
    (typeof e.description === 'string' && e.description) ||
    (typeof e.pattern === 'string' && e.pattern) ||
    (typeof e.url === 'string' && e.url) ||
    (typeof e.query === 'string' && e.query) ||
    (typeof e.command === 'string' && e.command) ||
    ''
  const one = String(arg).replace(/\s+/g, ' ').trim()
  const shown = tool === 'Bash' && typeof e.description === 'string' ? '' : `${name} `
  return one ? `${shown}${one.length > 40 ? `${one.slice(0, 39)}…` : one}` : name
}

/** `where`: the other chat a row belongs to (absent for this chat's own work). */
export type ShownRow = WorkRow & { kind: 'main' | 'agent'; where?: string }

const folderOf = (path: string): string => path.replace(/\/+$/, '').split('/').pop() || path

/**
 * What runs now across every chat on this Mac and what finished in the last 15 minutes.
 * This chat first (its main, then its agents by start), then each other chat the same way.
 */
export const workRows = (w: Work | null, now: number, title: string | null = null, others: ChatWork[] = []): { running: ShownRow[]; done: ShownRow[] } => {
  const running: ShownRow[] = []
  const done: ShownRow[] = []
  const add = (wk: Work, chat: string, where: string | undefined, idp: string) => {
    if (wk.main.busy) {
      running.push({ id: `${idp}main`, name: chat, kind: 'main', type: where ? 'chat' : 'main chat', model: '', status: 'running', tools: wk.main.tools, lastTool: wk.main.lastTool, startedAt: wk.main.since, endedAt: null, where })
    }
    const agents = wk.agents.map(a => ({ ...a, kind: 'agent' as const, where }))
    running.push(...agents.filter(a => ACTIVE.has(a.status)).sort((a, b) => a.startedAt - b.startedAt))
    done.push(...agents.filter(a => !ACTIVE.has(a.status) && a.endedAt != null && now - a.endedAt < 15 * 60000))
  }
  if (w) add(w, title || 'Main chat', undefined, '')
  for (const o of others) {
    const chat = o.title || `Chat in ${folderOf(o.cwd)}`
    add({ main: o.main, agents: o.agents }, chat, chat, `${o.sessionId}:`)
  }
  done.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  return { running, done: done.slice(0, 4) }
}

/** How many chats have something running. */
export const busyChats = (rows: ShownRow[]): number => new Set(rows.map(r => r.where ?? '')).size

const SWITCH_MARK = "Switch this chat's environment to"
// Marks the mod's own finishing turn after a direct move; the mod answers it without the model.
const DONE_MARK = '(already done by the dashboard; this turn only applies the move)'
let answerNextStep = false
const TEXT_STOP = new Set('the and for with this that from your you are can not but all any how what when why who make need want help please into about just also then them they have has was were will would could should does did fix add new get got put run use its it\'s there where here somewhere easy pull care whatever access folder folders file files claude chat chats session button buttons thing things one way work task'.split(' '))

/**
 * The folder a task fits best: project-name words count 3, words from its README/CLAUDE/PLAN count 1.
 * Null unless the best is clear (score at least 3 and ahead of the next).
 */
export const suggestEnv = (text: string, envs: Env[]): { path: string; score: number } | null => {
  const words = new Set((text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []).filter(w => !TEXT_STOP.has(w)))
  if (words.size === 0) return null
  const scored = envs
    .map(env => {
      // Name words count 3; project words 1 each, distinct, and only from 3 up (two shared words is chance).
      const nameHits = (env.name ?? []).filter(w => !TEXT_STOP.has(w) && (words.has(w) || words.has(w.replace(/s$/, '')))).length
      const wordHits = new Set((env.words ?? []).filter(w => !TEXT_STOP.has(w) && words.has(w))).size
      return { path: env.path, score: nameHits * 3 + (wordHits >= 3 ? wordHits : 0) }
    })
    .sort((a, b) => b.score - a.score)
  const [best, next] = scored
  return best && best.score >= 3 && best.score > (next?.score ?? 0) ? best : null
}

export const ago = (ms: number): string => {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 1 ? 'now' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export const fmt = (n: number): string =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n)

const total = (d: DayStat): number => d.in + d.out + d.cr + d.cw

const toDate = (iso: string): Date => new Date(`${iso}T12:00:00Z`)
const toIso = (d: Date): string => d.toISOString().slice(0, 10)
export const addDays = (iso: string, n: number): string => {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}
export const short = (iso: string): string => `${MONTHS[toDate(iso).getUTCMonth()]} ${toDate(iso).getUTCDate()}`

/** "Tue, Nov 10 · 10:58 AM" in the machine's local time. */
export const clockText = (ms: number): string => {
  const d = new Date(ms)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()} · ${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`
}

/** "2h 14m" until an ISO time, or "now" when past. */
export const untilText = (iso: string | null, nowMs: number): string => {
  if (!iso) return ''
  const mins = Math.round((new Date(iso).getTime() - nowMs) / 60000)
  if (!(mins > 0)) return 'now'
  // Coarse on purpose: the text changes rarely, so the picture is not redrawn every minute.
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h` : `${Math.max(5, Math.ceil(mins / 5) * 5)}m`
}

export const summarize = (s: Stats) => {
  const keys = Object.keys(s.days).sort()
  const sum = { all: 0, out: 0, sessions: 0, fable: 0, fableOut: 0 }
  let best = keys[0]
  let run = 0
  let longest = 0
  keys.forEach((k, i) => {
    const d = s.days[k]
    sum.all += total(d)
    sum.out += d.out
    sum.sessions += d.sessions
    sum.fable += d.fa ?? 0
    sum.fableOut += d.fo ?? 0
    if (d.out > s.days[best].out) best = k
    run = i > 0 && addDays(keys[i - 1], 1) === k ? run + 1 : 1
    longest = Math.max(longest, run)
  })
  let current = 0
  // Today may not have started yet: count back from today, or from yesterday.
  let cursor = s.days[s.today] ? s.today : addDays(s.today, -1)
  while (s.days[cursor]) {
    current += 1
    cursor = addDays(cursor, -1)
  }
  // Average output over the 7 days before today (days with no activity count as 0).
  let prior = 0
  for (let i = 1; i <= 7; i++) prior += s.days[addDays(s.today, -i)]?.out ?? 0
  return { keys, sum, best, longest, current, avgOut7: prior / 7, today: s.days[s.today] }
}

/** Rough width of bold system-font text: digits and capitals ~0.62 em, dots and spaces less. */
export const textWidth = (t: string, size: number): number =>
  [...t].reduce((w, ch) => w + (/[.,:· ]/.test(ch) ? 0.3 : /[A-Z0-9]/.test(ch) ? 0.64 : 0.56), 0) * size

/** The largest font size up to `max` (never under 10) that fits `t` in `room` px. */
export const fitFont = (t: string, room: number, max: number): number =>
  Math.max(10, Math.min(max, Math.floor((max * room) / Math.max(1, textWidth(t, max)))))

/** Column widths for the hero's mini stats: each gets what its label and value need plus a gap,
 * then any spare width is shared evenly. If they can't all fit, widths scale down together. */
export const miniWidths = (items: [string, string][], total: number, leadSize = 16, restSize = 14): number[] =>
  fitColumns(items.map(([label, value], i) => [textWidth(value, i === 0 ? leadSize : restSize), textWidth(label, 10)]), total, 16, [12])

/** Column widths from each column's line widths: the widest line plus `pad` (plus any `extraPad[i]`),
 * then spare width shared evenly; if they don't fit, all scale down together. Always sums to `total`. */
export const fitColumns = (lines: number[][], total: number, pad: number, extraPad: number[] = []): number[] => {
  const need = lines.map((ls, i) => Math.max(...ls) + pad + (extraPad[i] ?? 0))
  const sum = need.reduce((a, b) => a + b, 0)
  if (sum >= total) return need.map(n => (n * total) / sum)
  const extra = (total - sum) / lines.length
  return need.map(n => n + extra)
}

/** Level 1..4 by quartile of output tokens across active days; 0 for no activity. */
export const levelFor = (s: Stats): ((k: string) => number) => {
  const outs = Object.values(s.days).map(d => d.out).sort((a, b) => a - b)
  const q = (p: number) => outs[Math.min(outs.length - 1, Math.floor(p * outs.length))]
  const [a, b, c] = [q(0.25), q(0.5), q(0.75)]
  return k => {
    const d = s.days[k]
    if (!d) return 0
    return d.out < a ? 1 : d.out < b ? 2 : d.out < c ? 3 : 4
  }
}

const limitName = (kind: string): string =>
  kind === 'five_hour' ? '5-hour' : kind === 'seven_day' ? 'Weekly'
    : kind.includes('fable') ? (kind.startsWith('five') ? '5-hour Fable' : 'Weekly Fable')
    : kind.replace(/_/g, ' ')

/** Plain, rule-based tips from what the dashboard can see. At most four, most urgent first. */
export const recommend = (s: Stats | null, l: Live | null): string[] => {
  const tips: string[] = []
  const now = l?.now ?? 0
  for (const lim of l?.limits ?? []) {
    const name = limitName(lim.kind)
    const back = lim.resetsAt ? `, resets in ${untilText(lim.resetsAt, now)}` : ''
    if (lim.percentUsed >= 90) tips.push(`${name} limit at ${Math.round(lim.percentUsed)}%${back}. Pause heavy work or keep chats short.`)
    else if (lim.percentUsed >= 70) tips.push(`${name} limit at ${Math.round(lim.percentUsed)}%${back}. Pace yourself.`)
  }
  if ((l?.ctxPercent ?? 0) >= 60) {
    tips.push(`This chat is ${Math.round(l!.ctxPercent!)}% full. Each message re-reads all of it: save a handoff note and start fresh.`)
  }
  const running = (l?.agents ?? []).filter(a => ACTIVE.has(a.status)).length
  if (running >= 3) tips.push(`${running} agents running at once. Each spends its own tokens.`)
  if (s) {
    const { today, avgOut7, sum } = summarize(s)
    if (today && avgOut7 > 0 && today.out > 2 * avgOut7) {
      tips.push(`Today's output (${fmt(today.out)}) is over 2x your 7-day average (${fmt(avgOut7)}).`)
    }
    const cacheShare = sum.all > 0 ? Object.values(s.days).reduce((a, d) => a + d.cr, 0) / sum.all : 0
    if (cacheShare > 0.9) {
      tips.push(`${Math.round(cacheShare * 100)}% of your tokens are re-read chat history. New topic: fresh chat, not a long one.`)
    }
  }
  if (tips.length === 0) tips.push('Usage looks healthy. Nothing to change.')
  return tips.slice(0, 4)
}

/** Shows the last scan's numbers at once (a new chat), before the fresh scan finishes. */
async function loadCachedStats($: Engine): Promise<void> {
  try {
    const home = (await $.env.get('HOME')) ?? ''
    const parsed = JSON.parse(await $.fs.read(`${home}/.claude/usage-grid/stats.json`)) as Omit<Stats, 'at'>
    await update($, stats, old => old ?? { ...parsed, at: 0 })
  } catch {
    // No cache yet: the scan fills it.
  }
}

async function refreshStats($: Engine): Promise<void> {
  try {
    const ran = await $.process.run(['python3', '-I', `${$.plugin.root}/hooks/stats.py`], { timeoutMs: 60000 })
    if (ran.exitCode !== 0) return
    const parsed = JSON.parse(ran.stdout) as Omit<Stats, 'at'>
    await update($, stats, () => ({ ...parsed, at: Date.now() }))
  } catch {
    // Keep the last good numbers.
  }
}

// ── Work across chats: each chat publishes its own; every dashboard reads all ──
let lastPublish = 0
const workDir = async ($: any): Promise<string> => `${(await $.env.get('HOME')) ?? ''}/.claude/usage-grid/work`

/** Writes this chat's work for the other chats (at most every 2 s unless forced; the heartbeat forces). */
async function publish($: any, force = false): Promise<void> {
  try {
    const now = Date.now()
    if (!force && now - lastPublish < 2000) return
    lastPublish = now
    const [wk, l, sid, cwd, dir] = await Promise.all([read($, work), read($, live), $.session.id(), $.session.cwd(), workDir($)])
    const ctx = l ? { percent: l.ctxPercent, tokens: l.ctxTokens, window: l.ctxWindow } : null
    const mine: ChatWork = { sessionId: sid, title: l?.title ?? null, cwd, main: wk.main, agents: wk.agents.slice(-20), ctx, updatedAt: now }
    await $.fs.write(`${dir}/${sid}.json`, JSON.stringify(mine))
  } catch {
    // Sharing is best effort.
  }
}

/** Reads the other chats' work: fresh files only (heartbeat within 90 s); files idle 2 days are removed. */
async function refreshOthers($: any): Promise<void> {
  try {
    const [dir, sid] = await Promise.all([workDir($), $.session.id()])
    const now = Date.now()
    const entries = await $.fs.list(dir).catch(() => [])
    const others: ChatWork[] = []
    for (const ent of entries) {
      if (ent.kind !== 'file' || !ent.name.endsWith('.json') || ent.name === `${sid}.json`) continue
      if (now - ent.mtimeMs > 2 * 864e5) {
        void $.process.run(['rm', '-f', `${dir}/${ent.name}`], { timeoutMs: 5000 })
        continue
      }
      if (now - ent.mtimeMs > 90000) continue
      try {
        const o = JSON.parse(await $.fs.read(`${dir}/${ent.name}`)) as ChatWork
        if (o && o.main && Array.isArray(o.agents) && now - o.updatedAt < 90000) others.push(o)
      } catch {
        // A file mid-write: skip it this round.
      }
    }
    others.sort((a, b) => a.sessionId.localeCompare(b.sessionId))
    const seen = (list: ChatWork[]) => JSON.stringify(list.map(({ updatedAt, ...rest }) => rest))
    await update($, live, old => (old && seen(old.others) !== seen(others) ? { ...old, others } : old))
  } catch {
    // Leave the last reading.
  }
}

let cachedTitle: { value: string | null; at: number } = { value: null, at: 0 }

/** Reads the chat's folder; on a change, redraws and says where the chat is now. */
async function checkWhere($: any): Promise<void> {
  try {
    const [cwd, home] = await Promise.all([$.session.cwd(), $.env.get('HOME')])
    let moved = false
    await update($, where, old => {
      if (old === cwd) return old
      moved = old !== ''
      return cwd
    })
    if (moved) {
      lastSwitch = { path: '', at: 0 }
      $.ui.toast(`Now in ${envName(cwd, home ?? '')}.`)
    }
    // A switch on its way: done when the chat is there; a nudge after 20 s; given up after 2 minutes.
    const pend = await read($, pending)
    if (pend) {
      const age = Date.now() - pend.at
      const name = envName(pend.path, home ?? '')
      if (pend.path === cwd) await update($, pending, () => null)
      else if (age > 120000) {
        await update($, pending, () => null)
        $.ui.toast(`The switch to ${name} didn't happen. Press it again.`)
      } else if (age > 20000 && !pend.nagged) {
        await update($, pending, p => (p ? { ...p, nagged: true } : p))
        $.ui.toast(`Still switching to ${name}: if a card asks to allow the move, allow it.`)
      }
    }
  } catch {
    // try again on the next tick
  }
}

let lastLimits = { text: '', at: 0 }
/** Shares the plan limits (account-wide) for the desktop widgets: ~/.claude/usage-grid/limits.json. On change, or once a minute. */
async function shareLimits($: any, limits: Limit[], sid: string): Promise<void> {
  try {
    if (!limits.length) return
    const text = JSON.stringify(limits)
    const now = Date.now()
    if (text === lastLimits.text && now - lastLimits.at < 60000) return
    lastLimits = { text, at: now }
    const dir = (await workDir($)).replace(/\/work$/, '')
    await $.fs.write(`${dir}/limits.json`, JSON.stringify({ limits, sessionId: sid, updatedAt: now }))
  } catch {
    // Sharing is best effort.
  }
}

async function refreshLive($: Engine): Promise<void> {
  try {
    const [now, usage, list, sid] = await Promise.all([$.clock.now(), $.session.usage(), $.agent.list(), $.session.id()])
    let title: string | null = cachedTitle.value
    if (now - cachedTitle.at > 60000) {
      try {
        const ran = await $.process.run(['python3', '-I', `${$.plugin.root}/hooks/stats.py`, 'title', sid], { timeoutMs: 8000 })
        title = (JSON.parse(ran.stdout) as { title: string | null }).title
        cachedTitle = { value: title, at: now }
      } catch {
        // keep the last title
      }
    }
    const next: Live = {
      now: Math.floor(now / 60000) * 60000,
      agents: list.map(a => ({ id: a.id, name: a.name ?? a.description ?? a.type, type: a.type, status: a.status })),
      limits: usage.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt ?? null })),
      ctxPercent: usage.context.percent ?? null,
      ctxTokens: usage.context.tokens ?? null,
      ctxWindow: usage.context.window ?? null,
      usd: usage.cost?.usd ?? null,
      title,
      others: [],
    }
    void shareLimits($, next.limits, sid)
    // Only write when something on screen changes, so the pane redraws no more than needed.
    await update($, live, old => {
      const merged = { ...next, others: old?.others ?? [] }
      return old && JSON.stringify(old) === JSON.stringify(merged) ? old : merged
    })
    // Agents the hooks missed (spawned before a reload), and status changes, from the engine's own list.
    await update($, work, wk => {
      let changed = false
      const byId = new Map(list.map(a => [a.id, a]))
      const agents = wk.agents.map(r => {
        const info = byId.get(r.id)
        if (info && info.status !== r.status) {
          changed = true
          return { ...r, status: info.status, endedAt: ACTIVE.has(info.status) ? null : r.endedAt ?? now }
        }
        return r
      })
      for (const info of list) {
        if (!agents.some(r => r.id === info.id) && ACTIVE.has(info.status)) {
          changed = true
          agents.push({ id: info.id, name: info.name ?? info.description ?? info.type, type: info.type, model: '', status: info.status, startedAt: now, endedAt: null, tools: 0, lastTool: '' })
        }
      }
      return changed ? { ...wk, agents: agents.slice(-40) } : wk
    })
  } catch {
    // Leave the last reading.
  }
}

// ───────────────────────── iOS-style dashboard (desktop, phone, editor) ─────────────────────────

const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const RED = '#ff3b30'
const ORANGE = '#ff9500'
const GREEN = '#34c759'

export const esc = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Greedy word wrap by character count (SVG text does not wrap by itself). */
export const wrap = (text: string, maxChars: number): string[] => {
  const lines: string[] = []
  let cur = ''
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word
    if (next.length > maxChars && cur) {
      lines.push(cur)
      cur = word
    } else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

const cut = (t: string, n: number): string => (t.length > n ? `${t.slice(0, Math.max(1, n - 1))}…` : t)
const timeText = (ms: number): string => {
  const d = new Date(ms)
  const h = d.getHours()
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const severity = (pct: number | null): string | null => (pct == null ? null : pct >= 90 ? RED : pct >= 70 ? ORANGE : null)

const STYLE = `
text{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums}
.card{fill:#ffffff;fill-opacity:.78}
.t1{fill:#1c1c1e}.t2{fill:#8a8a8e}
.accent,.heat,.bar,.dot,.mfill{fill:#007aff}
.empty{fill:#e5e5ea}.track{stroke:#e5e5ea}.ringfg{stroke:#007aff}.sepl{stroke:#e5e5ea}.mtrack{fill:#e5e5ea}
.pill{fill:#007aff;fill-opacity:.12}
@media (prefers-color-scheme:dark){
.card{fill:#1c1c1e;fill-opacity:.72}
.t1{fill:#f2f2f7}.t2{fill:#98989f}
.accent,.heat,.bar,.dot,.mfill{fill:#0a84ff}
.empty{fill:#2c2c2e}.track{stroke:#2c2c2e}.ringfg{stroke:#0a84ff}.sepl{stroke:#2c2c2e}.mtrack{fill:#2c2c2e}
.pill{fill:#0a84ff;fill-opacity:.2}
}
.cell:hover{stroke:#8a8a8e;stroke-width:1.5}
`

/**
 * The whole dashboard as one SVG, laid out for a pane `width` pixels wide:
 * one column of cards on a narrow pane, two-up rows from 620 px.
 */
export type SvgMode = 'full' | 'home' | 'work' | 'top' | 'body'

export const dashboardSvg = (s: Stats | null, l: Live | null, width: number, w: Work | null = null, mode: SvgMode = 'full'): { svg: string; width: number; height: number } => {
  const W = Math.round(Math.min(900, Math.max(340, width)))
  const P = 16
  const CW = W - 2 * P
  const GAP = 14
  const wide = W >= 620
  const nowMs = l?.now || Date.now()
  const out: string[] = []
  let y = P
  const assemble = () => {
  const H = Math.round(y)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<style>${STYLE}</style>` +
    `<defs><linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a84ff"/><stop offset=".55" stop-color="#3d6ff0"/><stop offset="1" stop-color="#5e5ce6"/></linearGradient>` +
    `<filter id="sh" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="7" flood-color="#000" flood-opacity=".07"/></filter></defs>` +
    out.join('') +
    `</svg>`
  return { svg, width: W, height: H }
  }

  const T = (x: number, ty: number, str: string, cls: string, size: number, weight = 400, anchor = 'start', extra = '') =>
    `<text x="${x.toFixed(1)}" y="${ty.toFixed(1)}" class="${cls}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" ${extra}>${esc(str)}</text>`
  const card = (x: number, cy: number, w: number, h: number) =>
    `<rect x="${x}" y="${cy}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="20" class="card" filter="url(#sh)"/>`
  const title = (x: number, cy: number, str: string, sub?: string, right?: number) =>
    T(x + 18, cy + 32, str, 't1', 17, 700) + (sub && right ? T(right - 18, cy + 32, sub, 't2', 12, 500, 'end') : '')

  // Header: date and time, like the top of an iOS widget page.
  const now = new Date(nowMs)
  const dateLong = `${LONG_DAYS[now.getDay()]}, ${LONG_MONTHS[now.getMonth()]} ${now.getDate()}`
  if (mode !== 'work' && mode !== 'body') {
  out.push(T(P + 4, y + 14, 'CLAUDE CODE', 't2', 12, 600, 'start', 'letter-spacing="1.4"'))
  out.push(T(P + 4, y + 46, dateLong, 't1', wide ? 30 : 26, 800))
  out.push(T(W - P - 4, wide ? y + 46 : y + 14, timeText(nowMs), 'accent', wide ? 30 : 13, wide ? 300 : 600, 'end'))
  y += 64
  }

  // Work: the main chat and each subagent. At the top whenever anything runs.
  const rows = workRows(w, nowMs, l?.title ?? null, l?.others ?? [])
  const busy = rows.running.length > 0
  const workHeight = (cw: number) =>
    56 + (busy ? Math.min(8, rows.running.length) * 48 : 30) + (rows.done.length ? 30 + rows.done.length * 26 : 0) + (rows.running.length > 8 ? 18 : 0) + 6
  const drawWork = (x: number, wy: number, cw: number, h: number) => {
    out.push(card(x, wy, cw, h))
    out.push(T(x + 18, wy + 32, busy ? 'Working now' : 'Agents', 't1', 17, 700))
    const chats = busyChats(rows.running)
    const pill = busy ? `${rows.running.length} running${chats > 1 ? ` · ${chats} chats` : ''}` : 'idle'
    const pw = pill.length * 6.4 + 22
    out.push(`<rect x="${(x + cw - 18 - pw).toFixed(1)}" y="${wy + 17}" width="${pw.toFixed(1)}" height="22" rx="11" class="pill"/>`)
    out.push(T(x + cw - 18 - pw / 2, wy + 32, pill, busy ? 'accent' : 't2', 11, 600, 'middle'))
    let ry = wy + 64
    if (!busy) {
      out.push(T(x + 18, ry, 'Nothing running right now', 't2', 13, 500))
      ry += 30
    }
    const chars = Math.floor((cw - 110) / 7)
    rows.running.slice(0, 8).forEach(r => {
      const waiting = r.status === 'waiting' || r.status === 'pending'
      out.push(
        `<circle cx="${x + 24}" cy="${ry - 4}" r="5" ${waiting ? `fill="${ORANGE}"` : r.kind === 'main' ? `fill="${GREEN}"` : 'class="dot"'}><animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite"/></circle>`,
      )
      out.push(T(x + 38, ry, cut(r.name, chars), 't1', 14, 600))
      out.push(T(x + cw - 18, ry, r.startedAt ? ago(nowMs - r.startedAt) : '', 't2', 12, 500, 'end'))
      const detail = [r.where && r.kind === 'agent' ? `in ${r.where}` : '', r.kind === 'main' ? (r.where ? 'other chat' : 'this chat') : r.type, r.model.replace(/^claude-/, ''), waiting ? r.status : '', `${r.tools} tool${r.tools === 1 ? '' : 's'}`, r.lastTool]
        .filter(Boolean)
        .join(' · ')
      out.push(T(x + 38, ry + 18, cut(detail, Math.floor((cw - 60) / 6.2)), 't2', 11, 500))
      ry += 48
    })
    if (rows.running.length > 8) {
      out.push(T(x + 38, ry - 8, `+${rows.running.length - 8} more running`, 't2', 11, 600))
      ry += 18
    }
    if (rows.done.length) {
      out.push(`<line x1="${x + 18}" y1="${ry - 14}" x2="${x + cw - 18}" y2="${ry - 14}" class="sepl"/>`)
      out.push(T(x + 18, ry + 4, 'FINISHED RECENTLY', 't2', 10, 700, 'start', 'letter-spacing="1"'))
      ry += 26
      rows.done.forEach(r => {
        const ok = r.status === 'completed' || r.status === 'idle'
        out.push(`<circle cx="${x + 24}" cy="${ry - 4}" r="5" fill="${ok ? GREEN : RED}" fill-opacity=".85"/>`)
        out.push(T(x + 38, ry, cut(r.where ? `${r.name} · ${r.where}` : r.name, chars), 't2', 13, 500))
        out.push(T(x + cw - 18, ry, `${ok ? 'done' : r.status} ${r.endedAt ? ago(nowMs - r.endedAt) : ''}${r.endedAt && nowMs - r.endedAt >= 60000 ? ' ago' : ''}`, 't2', 11, 500, 'end'))
        ry += 26
      })
    }
  }
  if (busy && mode !== 'body') {
    const h = workHeight(CW)
    drawWork(P, y, CW, h)
    y += h + GAP
  }
  if (mode === 'work' || mode === 'top') return assemble()

  if (!s || Object.keys(s.days).length === 0) {
    out.push(card(P, y, CW, 70))
    out.push(T(P + 18, y + 42, 'Reading your Claude Code logs…', 't2', 15, 500))
    y += 70 + GAP
    if (mode === 'home') return assemble()
  } else {
    const { keys, sum, best, longest, current, avgOut7, today } = summarize(s)
    const level = levelFor(s)

    // Hero: total tokens on a blue gradient, with a 30-day sparkline.
    const HH = 178
    out.push(`<clipPath id="hc"><rect x="${P}" y="${y}" width="${CW}" height="${HH}" rx="24"/></clipPath>`)
    out.push(`<g clip-path="url(#hc)"><rect x="${P}" y="${y}" width="${CW}" height="${HH}" fill="url(#hero)"/>`)
    out.push(`<circle cx="${P + CW - 30}" cy="${y + 10}" r="120" fill="#fff" opacity=".10"/>`)
    out.push(`<circle cx="${P + 40}" cy="${y + HH + 30}" r="90" fill="#fff" opacity=".07"/></g>`)
    out.push(`<text x="${P + 20}" y="${y + 32}" fill="#fff" fill-opacity=".85" font-size="14" font-weight="600">Total tokens</text>`)
    out.push(`<text x="${P + 20}" y="${y + 84}" fill="#fff" font-size="${wide ? 52 : 44}" font-weight="800" letter-spacing="-1">${esc(fmt(sum.all))}</text>`)
    out.push(`<text x="${P + 20}" y="${y + 106}" fill="#fff" fill-opacity=".75" font-size="12" font-weight="500">since ${esc(short(keys[0]))} · incl. cache</text>`)
    // Sparkline of all tokens per day, last 30 days.
    const sx0 = P + CW * (wide ? 0.55 : 0.56)
    const sx1 = P + CW - 20
    const sy0 = y + 28
    const sy1 = y + 98
    const series = Array.from({ length: 30 }, (_, i) => {
      const d = s.days[addDays(s.today, i - 29)]
      return d ? total(d) : 0
    })
    const smax = Math.max(1, ...series)
    const pts = series.map((v, i) => [sx0 + ((sx1 - sx0) * i) / 29, sy1 - ((sy1 - sy0) * v) / smax])
    const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
    out.push(`<path d="${line}L${sx1},${sy1}L${sx0},${sy1}Z" fill="#fff" fill-opacity=".16"/>`)
    out.push(`<path d="${line}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`)
    out.push(`<circle cx="${pts[29][0].toFixed(1)}" cy="${pts[29][1].toFixed(1)}" r="3.5" fill="#fff"/>`)
    out.push(`<text x="${sx1}" y="${sy1 + 14}" fill="#fff" fill-opacity=".7" font-size="10" text-anchor="end">30 days</text>`)
    // Five mini stats across the bottom; Fable gets the bright slot.
    const mini: [string, string][] = [
      ['Fable', fmt(sum.fable)],
      ['Output', fmt(sum.out)],
      ['Sessions', String(sum.sessions)],
      ['Days', String(keys.length)],
      ['Streak', `${current}d`],
    ]
    // Each column is as wide as its text needs (SVG text can't shrink itself), then the spare room is shared out.
    // Labels and values are centered in their column, and the Fable highlight is centered on the same point,
    // so it sits evenly around the text whatever the font measures.
    const leadSize = wide ? 18 : 16
    const restSize = wide ? 16 : 14
    const widths = miniWidths(mini, CW - 24, leadSize, restSize)
    let mx = P + 12
    mini.forEach(([label, value], i) => {
      const cw = widths[i]
      const lead = i === 0
      const mid = mx + cw / 2
      const size = fitFont(value, cw - (lead ? 20 : 12), lead ? leadSize : restSize)
      if (i > 1) out.push(`<line x1="${mx.toFixed(1)}" y1="${y + 130}" x2="${mx.toFixed(1)}" y2="${y + 160}" stroke="#fff" stroke-opacity=".25"/>`)
      if (lead) {
        // As wide as the text plus even padding (never wider than the column), centered on the text.
        const bw = Math.min(cw - 6, Math.max(textWidth(value, size), textWidth(label, 10)) + 28)
        out.push(`<rect x="${(mid - bw / 2).toFixed(1)}" y="${y + 121}" width="${bw.toFixed(1)}" height="46" rx="12" fill="#fff" fill-opacity=".16"/>`)
      }
      out.push(`<text x="${mid.toFixed(1)}" y="${y + 138}" text-anchor="middle" fill="#fff" fill-opacity="${lead ? '.95' : '.7'}" font-size="10" font-weight="${lead ? 700 : 500}">${esc(label)}</text>`)
      out.push(`<text x="${mid.toFixed(1)}" y="${y + 158}" text-anchor="middle" fill="#fff" font-size="${size}" font-weight="700">${esc(value)}</text>`)
      mx += cw
    })
    y += HH + GAP
    if (mode === 'home') return assemble()

    // Rings: 5-hour limit, weekly limit, this chat's context.
    const lim = (kind: string) => l?.limits.find(x => x.kind === kind) ?? null
    const five = lim('five_hour')
    const week = lim('seven_day')
    // Fable: its own plan limit when the engine reports one, else its share of all tokens.
    const fableLim = l?.limits.find(x => x.kind.includes('fable')) ?? null
    const fableShare = sum.all > 0 ? (sum.fable / sum.all) * 100 : null
    const rings: { label: string; pct: number | null; sub: string; plain?: boolean }[] = [
      { label: '5-hour', pct: five?.percentUsed ?? null, sub: five?.resetsAt ? `resets ${untilText(five.resetsAt, nowMs)}` : five ? 'limit' : 'after a reply' },
      { label: 'Weekly', pct: week?.percentUsed ?? null, sub: week?.resetsAt ? `resets ${untilText(week.resetsAt, nowMs)}` : week ? 'limit' : 'after a reply' },
      fableLim
        ? { label: 'Fable', pct: fableLim.percentUsed, sub: fableLim.resetsAt ? `resets ${untilText(fableLim.resetsAt, nowMs)}` : 'limit' }
        : { label: 'Fable', pct: fableShare, sub: `${fmt(sum.fable)} · share`, plain: true },
      { label: 'This chat', pct: l?.ctxPercent ?? null, sub: l?.ctxTokens != null ? `${fmt(l.ctxTokens)} tokens` : 'context' },
    ]
    const RH = 146
    out.push(card(P, y, CW, RH))
    const colW = CW / rings.length
    const r = Math.max(18, Math.min(29, colW / 2 - 14))
    const circ = 2 * Math.PI * r
    rings.forEach((ring, i) => {
      const cx = P + colW * (i + 0.5)
      const cy = y + 22 + r + 6
      const pct = Math.max(0, Math.min(100, ring.pct ?? 0))
      const color = ring.plain ? null : severity(ring.pct)
      out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" class="track" stroke-width="7"/>`)
      if (pct > 0) {
        out.push(
          `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" ${color ? `stroke="${color}"` : 'class="ringfg"'} stroke-width="7" stroke-linecap="round" stroke-dasharray="${((circ * pct) / 100).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`,
        )
      }
      out.push(T(cx, cy + 5, ring.pct == null ? '—' : `${Math.round(ring.pct)}%`, 't1', 14, 700, 'middle'))
      out.push(T(cx, cy + r + 22, ring.label, 't1', 12, 600, 'middle'))
      out.push(T(cx, cy + r + 37, cut(ring.sub, Math.floor((colW - 8) / 5.6)), 't2', 10, 500, 'middle'))
    })
    y += RH + GAP

    // Today strip: output, sessions, streak.
    const TH = 88
    out.push(card(P, y, CW, TH))
    const delta = today && avgOut7 > 0 ? Math.round(((today.out - avgOut7) / avgOut7) * 100) : null
    const todayCols: [string, string, string][] = [
      ['Today', today ? fmt(today.out) : '0', delta == null ? 'output' : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs avg`],
      ['Fable today', fmt(today?.fa ?? 0), `${fmt(today?.fo ?? 0)} output`],
      ['Sessions', String(today?.sessions ?? 0), today ? `${fmt(total(today))} all` : 'none yet'],
      ['Streak', `${current}d`, `best ${longest}d`],
    ]
    // Same rule as the hero: each column as wide as its widest line needs, spare room shared out,
    // values shrink only if they still don't fit, everything centered in its column.
    const vSize = wide ? 21 : 18
    const tws = fitColumns(todayCols.map(([label, value, sub]) => [
      textWidth(value, vSize), textWidth(label, 11), textWidth(sub, 10),
    ]), CW - 16, 14)
    let tx = P + 8
    todayCols.forEach(([label, value, sub], i) => {
      const tw = tws[i]
      const mid = tx + tw / 2
      if (i > 0) out.push(`<line x1="${tx.toFixed(1)}" y1="${y + 20}" x2="${tx.toFixed(1)}" y2="${y + TH - 20}" class="sepl"/>`)
      out.push(T(mid, y + 27, label, 't2', 11, 600, 'middle'))
      out.push(T(mid, y + 54, value, 't1', fitFont(value, tw - 12, vSize), 700, 'middle'))
      out.push(T(mid, y + 72, cut(sub, Math.floor((tw - 8) / 5.4)), i === 0 && delta != null ? 'accent' : 't2', 10, 500, 'middle'))
      tx += tw
    })
    y += TH + GAP

    // Activity: a wide rectangle of weeks (up to a year), one rounded square per day.
    const gap = 3
    const labelW = 28
    const avail = CW - 36 - labelW
    const weeks = Math.min(53, Math.max(8, Math.floor((avail + gap) / (12 + gap))))
    const cell = Math.min(20, (avail - (weeks - 1) * gap) / weeks)
    const lastWeekStart = addDays(s.today, -toDate(s.today).getUTCDay())
    const gridStart = addDays(lastWeekStart, -(weeks - 1) * 7)
    const gx = P + 18 + labelW
    const gy = y + 68
    const gridH = 7 * (cell + gap) - gap
    const AH = 68 + gridH + 48
    out.push(card(P, y, CW, AH))
    out.push(title(P, y, 'Activity', `last ${weeks} weeks · output tokens`, P + CW))
    let lastM = -1
    let lastLabelX = -99
    for (let w = 0; w < weeks; w++) {
      const m = toDate(addDays(gridStart, w * 7)).getUTCMonth()
      const mx = gx + w * (cell + gap)
      // Skip a label for a sliver of a month at the left edge (it would crowd the next one).
      const sliver = w === 0 && toDate(addDays(gridStart, 14)).getUTCMonth() !== m
      if (m !== lastM && mx - lastLabelX >= 30 && !sliver) {
        out.push(T(mx, gy - 9, MONTHS[m], 't2', 10, 500))
        lastLabelX = mx
      }
      lastM = m
      for (let rr = 0; rr < 7; rr++) {
        const iso = addDays(gridStart, w * 7 + rr)
        if (iso > s.today) continue
        const lv = level(iso)
        const d = s.days[iso]
        const tip = d ? `${short(iso)}: ${fmt(d.out)} output · ${fmt(total(d))} all · ${d.sessions} sessions` : `${short(iso)}: no activity`
        out.push(
          `<rect class="cell ${lv ? 'heat' : 'empty'}" x="${mx.toFixed(1)}" y="${(gy + rr * (cell + gap)).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" rx="${(cell * 0.28).toFixed(1)}"${lv ? ` fill-opacity="${[0, 0.28, 0.5, 0.75, 1][lv]}"` : ''}${iso === s.today ? ' stroke="#8a8a8e" stroke-width="1.5"' : ''}><title>${esc(tip)}</title></rect>`,
        )
      }
    }
    ;[['Mon', 1], ['Wed', 3], ['Fri', 5]].forEach(([label, rr]) =>
      out.push(T(P + 18, gy + (rr as number) * (cell + gap) + cell * 0.75, label as string, 't2', 10, 500)),
    )
    const ly = gy + gridH + 30
    out.push(T(P + 18, ly, `Busiest ${short(best)} · ${fmt(s.days[best].out)} output`, 't2', 11, 500))
    const lx = P + CW - 18
    out.push(T(lx, ly, 'More', 't2', 10, 500, 'end'))
    ;[4, 3, 2, 1, 0].forEach((lv, i) => {
      const bx = lx - 46 - i * 15
      out.push(`<rect class="${lv ? 'heat' : 'empty'}" x="${bx}" y="${ly - 10}" width="12" height="12" rx="3"${lv ? ` fill-opacity="${[0, 0.28, 0.5, 0.75, 1][lv]}"` : ''}/>`)
    })
    out.push(T(lx - 46 - 4 * 15 - 6, ly, 'Less', 't2', 10, 500, 'end'))
    y += AH + GAP

    // Last 14 days: rounded bars, today solid.
    const BH = 190
    out.push(card(P, y, CW, BH))
    out.push(title(P, y, 'Last 14 days', 'output tokens', P + CW))
    const bx0 = P + 18
    const bw0 = CW - 36
    const by0 = y + 58
    const by1 = y + BH - 36
    const days14 = Array.from({ length: 14 }, (_, i) => addDays(s.today, i - 13))
    const vals = days14.map(k => s.days[k]?.out ?? 0)
    const vmax = Math.max(1, ...vals)
    const bg = 6
    const bw = (bw0 - 13 * bg) / 14
    ;[0.5, 1].forEach(f => {
      const gyy = by1 - (by1 - by0) * f
      out.push(`<line x1="${bx0}" y1="${gyy.toFixed(1)}" x2="${bx0 + bw0}" y2="${gyy.toFixed(1)}" class="sepl" stroke-dasharray="3 4"/>`)
    })
    out.push(T(bx0 + bw0, by0 - 6, fmt(vmax), 't2', 10, 500, 'end'))
    days14.forEach((k, i) => {
      const v = vals[i]
      const h = Math.max(v > 0 ? 4 : 2, ((by1 - by0) * v) / vmax)
      const x = bx0 + i * (bw + bg)
      const isToday = k === s.today
      out.push(
        `<rect class="${v > 0 ? 'bar' : 'empty'}" x="${x.toFixed(1)}" y="${(by1 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(6, bw / 2).toFixed(1)}"${v > 0 && !isToday ? ' fill-opacity=".45"' : ''}><title>${esc(`${short(k)}: ${fmt(v)} output`)}</title></rect>`,
      )
      if (i % 2 === 1 || isToday) out.push(T(x + bw / 2, by1 + 18, String(toDate(k).getUTCDate()), isToday ? 'accent' : 't2', 10, isToday ? 700 : 500, 'middle'))
    })
    y += BH + GAP

    // Models, and the agents card when nothing runs (it moved to the top otherwise).
    const models = s.models.slice(0, 4)
    const half = wide && !busy ? (CW - GAP) / 2 : CW
    const moH = 56 + Math.max(1, models.length) * 38 + 6
    const drawModels = (x: number, my: number, mw: number, h: number) => {
      out.push(card(x, my, mw, h))
      out.push(title(x, my, 'Models', 'by output', x + mw))
      const mmax = Math.max(1, ...models.map(m => m[1]))
      if (models.length === 0) out.push(T(x + 18, my + 66, 'No model data yet', 't2', 13, 500))
      models.forEach(([name, v], i) => {
        const ry = my + 64 + i * 38
        out.push(T(x + 18, ry, cut(name.replace(/^claude-/, ''), Math.floor((mw - 90) / 7)), 't1', 13, 600))
        out.push(T(x + mw - 18, ry, fmt(v), 't2', 12, 500, 'end'))
        out.push(`<rect x="${x + 18}" y="${ry + 8}" width="${(mw - 36).toFixed(1)}" height="6" rx="3" class="mtrack"/>`)
        out.push(`<rect x="${x + 18}" y="${ry + 8}" width="${Math.max(6, ((mw - 36) * v) / mmax).toFixed(1)}" height="6" rx="3" class="mfill"${i ? ` fill-opacity="${1 - i * 0.2}"` : ''}/>`)
      })
    }
    if (busy) {
      drawModels(P, y, CW, moH)
      y += moH + GAP
    } else if (wide) {
      const h = Math.max(workHeight(half), moH)
      drawWork(P, y, half, h)
      drawModels(P + half + GAP, y, half, h)
      y += h + GAP
    } else {
      const h = workHeight(CW)
      drawWork(P, y, CW, h)
      y += h + GAP
      drawModels(P, y, CW, moH)
      y += moH + GAP
    }
  }

  // Recommendations: one row per tip, with an iOS-style badge.
  const tips = recommend(s, l ? { ...l, agents: rows.running.filter(r => r.kind === 'agent') } : l)
  const maxChars = Math.max(20, Math.floor((CW - 76) / (13 * 0.52)))
  const tipLines = tips.map(t => wrap(t, maxChars))
  const RCH = 52 + tipLines.reduce((a, ls) => a + ls.length * 18 + 24, 0)
  out.push(card(P, y, CW, RCH))
  out.push(T(P + 18, y + 32, 'Recommendations', 't1', 17, 700))
  let ty = y + 58
  tips.forEach((t, i) => {
    const isGood = /healthy/i.test(t)
    const color = /at (9\d|1\d\d)%/.test(t) ? RED : /at [78]\d%|full|2x|agents running/.test(t) ? ORANGE : isGood ? GREEN : null
    if (i > 0) out.push(`<line x1="${P + 56}" y1="${ty - 14}" x2="${P + CW - 18}" y2="${ty - 14}" class="sepl"/>`)
    out.push(`<circle cx="${P + 32}" cy="${ty + 2}" r="12" ${color ? `fill="${color}"` : 'class="accent"'}/>`)
    out.push(`<text x="${P + 32}" y="${ty + 7}" fill="#fff" font-size="13" font-weight="800" text-anchor="middle">${isGood ? '✓' : color ? '!' : 'i'}</text>`)
    tipLines[i].forEach((line, j) => out.push(T(P + 56, ty + 6 + j * 18, line, 't1', 13, 450)))
    ty += tipLines[i].length * 18 + 24
  })
  y += RCH + GAP

  if (mode === 'full') {
    out.push(T(W / 2, y + 6, `Updated ${timeText(nowMs)} · /dashboard reopens this`, 't2', 11, 500, 'middle'))
    y += 22
  }

  return assemble()
}

const LAPTOP =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><style>path{stroke:#3a3a3c}@media (prefers-color-scheme:dark){path{stroke:#e5e5ea}}</style>' +
  '<path d="M5.5 6h13a1 1 0 0 1 1 1v8.5h-15V7a1 1 0 0 1 1-1zM2.5 15.5h19v1a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z" fill="none" stroke-width="1.6" stroke-linejoin="round"/></svg>'

const envName = (path: string, home: string): string =>
  path === home ? 'Home' : (path.replace(/\/+$/, '').split('/').pop() ?? path)

// No switch to the folder the chat is already in; a double click within 4 s counts once.
// Says at once that the switch is on its way, and why if the prompt could not be sent.
let lastSwitch = { path: '', at: 0 }
async function sendSwitch($: any, path: string): Promise<void> {
  const [cwd, home] = await Promise.all([$.session.cwd(), $.env.get('HOME')])
  const name = envName(path, home ?? '')
  const now = Date.now()
  if (path === cwd) {
    $.ui.toast(`Already in ${name}.`)
    return
  }
  if (path === lastSwitch.path && now - lastSwitch.at < 4000) return
  lastSwitch = { path, at: now }
  await update($, pending, () => ({ path, at: now, nagged: false }))
  $.ui.toast(`Switching to ${name}…`)
  // Fast path: the mod calls the app's move tool itself, with the press as consent: no Claude reply.
  // Fallback: the prompt (Claude makes the call). A press must return within 10 s, so none of this is awaited.
  void (async () => {
    // Check the folder often for a few seconds, so the ✓ moves as soon as the chat lands.
    for (const ms of [400, 900, 1500, 2200, 3000, 4000, 5500]) $.clock.after(ms, () => void checkWhere($))
    let isCalled = false
    try {
      const r: any = await $.tool.call({
        tool: 'mcp__ccd_directory__change_directory',
        path,
        consent: `The user pressed "${name}" in the environment menu to move this chat to ${path}.`,
      } as any)
      isCalled = !(r && (r.deny || r.isError || r.error))
      if (!isCalled) void note($, `direct switch refused: ${JSON.stringify(r).slice(0, 200)}`)
    } catch (err) {
      void note($, `direct switch failed: ${String(err).slice(0, 200)}`)
    }
    if (isCalled) {
      // The app applies the move when a turn ends. If the chat has not moved at once, end a turn
      // right away; the mod answers that turn itself (see turn.step), so no model call runs.
      $.clock.after(250, () => {
        void (async () => {
          if ((await $.session.cwd()) === path) return
          void $.prompt.submit({ text: `${SWITCH_MARK} ${path} ${DONE_MARK}` })
        })()
      })
      return
    }
    try {
      const r: any = await $.prompt.submit({ text: switchPrompt(path) })
      if (r && typeof r.deny === 'string') {
        void update($, pending, () => null)
        $.ui.toast(`Couldn't switch to ${name}: ${r.deny}`)
      }
    } catch (err) {
      void update($, pending, () => null)
      $.ui.toast(`Couldn't switch to ${name}: ${String(err)}`)
    }
  })()
}

// The app's tool is often deferred (not loaded yet), so the prompt says how to load it.
const switchPrompt = (path: string) =>
  `${SWITCH_MARK} the folder ${path}: if the tool mcp__ccd_directory__change_directory is not loaded, load it with ToolSearch (query "select:mcp__ccd_directory__change_directory"), then call it with that exact path, nothing else, and confirm in one short line.`
const CHOOSE_PROMPT =
  'Let me choose a different environment folder for this chat. If they are not loaded, load the tools with ToolSearch (query "select:mcp__ccd_directory__request_directory,mcp__ccd_directory__change_directory"). Call request_directory with no path so I can pick a folder, then call change_directory with the exact folder it granted, so the chat moves there. Nothing else; confirm in one short line.'

/** The environment menu, themed like the dashboard: recent folders, ✓ on the current one, a suggestion for the task. */
async function envMenu($: any, els: any) {
  const { Box, Text, Button, Svg } = els
  const [s, tk, w0, home] = await Promise.all([read($, stats), read($, task), read($, where), $.env.get('HOME')])
  const cwd = w0 || (await $.session.cwd())
  const envs: Env[] = [...(s?.envs ?? [])]
  if (!envs.some(x => x.path === cwd)) envs.unshift({ path: cwd, last: '' })
  const suggested = tk && !tk.dismissed ? tk.suggested : null
  const pend = await read($, pending)
  const switching = pend && pend.path !== cwd ? pend.path : null
  // A press must return within 10 s: send the prompt and do not wait for its turn.
  const go = (path: string) => {
    void sendSwitch($, path)
  }
  const name = (p: string) => envName(p, home ?? '')
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="subtle" backgroundColor="#8080800d" paddingX={2} paddingY={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Environment</Text>
        <Text color="subtle">wrong folder? switch any time</Text>
      </Box>
      {switching ? (
        <Text color="suggestion">⟳ Switching to {name(switching)}… the chat moves when this reply ends.</Text>
      ) : suggested && suggested !== cwd ? (
        <Box flexDirection="column" gap={1}>
          <Text color="suggestion">This task fits {name(suggested)} better than {name(cwd)}.</Text>
          <Box flexDirection="row">
            <Button key="env:suggested" variant="primary" label={`Switch to ${cut(name(suggested), 18)}`} onPress={() => go(suggested)} />
          </Box>
        </Box>
      ) : (
        <Text color="subtle">Now in {name(cwd)}</Text>
      )}
      <Box flexDirection="column" marginTop={1}>
        {envs.slice(0, 6).map(env => (
          <Box key={env.path} flexDirection="row" alignItems="center" gap={1} hover={{ backgroundColor: '#80808024' }}>
            {/* The name side grows and shortens; the ✓ keeps its own fixed column at the right. */}
            <Box flexDirection="row" alignItems="center" gap={1} flexGrow={1} flexShrink={1} overflow="hidden">
              <Svg source={LAPTOP} alt="folder" width={18} height={18} />
              <Button key={`env:${env.path}`} plain onPress={() => (env.path === cwd ? undefined : go(env.path))}>
                {cut(name(env.path), 24)}
                {env.path === switching ? (
                  <Text color="suggestion"> · switching…</Text>
                ) : env.path === suggested && env.path !== cwd ? (
                  <Text color="suggestion"> · suggested</Text>
                ) : (
                  ''
                )}
              </Button>
            </Box>
            <Box flexShrink={0} width={3} justifyContent="flex-end">
              {env.path === cwd ? <Text color="suggestion" bold>✓</Text> : <Text> </Text>}
            </Box>
          </Box>
        ))}
      </Box>
      <Box flexDirection="row" marginTop={1}>
        <Button key="env:choose" plain onPress={() => void $.prompt.submit({ text: CHOOSE_PROMPT })}>
          <Text color="suggestion">Choose environment ⌄</Text>
        </Button>
      </Box>
    </Box>
  )
}

/** The full dashboard: environment menu over the SVG. */
async function richTree($: any, e: any, els: any, widthPx: number) {
  const { Box, Svg } = els
  const [s, l, wk] = await Promise.all([read($, stats), read($, live), read($, work)])
  // Two pictures: the live top (clock, work) redraws often as a plain image; the body
  // (charts, grid) only when its own numbers change, so it never flashes on live updates.
  const top = dashboardSvg(s, l, widthPx, wk, 'top')
  const body = dashboardSvg(s, l, widthPx, wk, 'body')
  return (
    <Box flexDirection="column" gap={1}>
      {await envMenu($, els)}
      <Svg source={top.svg} alt="Date, time and work running now" />
      <Svg
        source={body.svg}
        alt={`Claude Code dashboard: ${s ? fmt(summarize(s).sum.all) : 'loading'} total tokens, limits, daily activity and tips`}
      />
    </Box>
  )
}

/** Keeps a short log of where the dashboard was placed, for checking it shows in new chats. */
async function note($: any, line: string) {
  try {
    const home = (await $.env.get('HOME')) ?? ''
    const path = `${home}/.claude/usage-grid.log`
    const stamp = new Date(await $.clock.now()).toISOString()
    // One atomic append per line, so chats starting together never overwrite each other; trimmed to 400 lines.
    await $.process.run(
      ['/bin/sh', '-c', 'printf "%s\\n" "$1" >> "$2"; n=$(wc -l < "$2"); [ "$n" -gt 400 ] && tail -n 300 "$2" > "$2.tmp" && mv "$2.tmp" "$2"; true', 'sh', `${stamp} ${await $.session.id()} ${line}`, path],
      { timeoutMs: 5000 },
    )
  } catch {
    // Logging must never break the dashboard.
  }
}

/**
 * Puts the dashboard at the top of a NEW chat (no turns yet); if no surface can draw it as a row,
 * opens the pane. A chat already under way is left alone (a reload must not drop it mid-transcript).
 */
async function ensureRow($: any, why: string) {
  try {
    const turns = await $.session.turns()
    if (turns > 0) {
      await note($, `skip ${why}: chat already has ${turns} turns`)
      return
    }
    const placed = await $.ui.place({ id: ROW })
    await note($, `place(${why}) -> ${placed.isPlaced ? 'placed' : `waiting: ${placed.reason}`} surfaces=${(await $.session.surfaces()).join(',') || 'none'}`)
    if (!placed.isPlaced && !/^no-surface/.test(placed.reason ?? '')) {
      const opened = await $.ui.open({ id: PANE, title: TITLE })
      await note($, `fallback pane -> ${opened.isPlaced ? 'placed' : opened.reason}`)
    }
  } catch (err) {
    await note($, `place(${why}) failed: ${String(err)}`)
  }
}

export const register: Register = on => {
  const drawnOn = new Set<string>()
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'usage-grid', description: 'Open the usage dashboard: tokens, grid, agents, limits, tips' })
    await $.command.register({ name: 'dashboard', description: 'Open the usage dashboard (same as /usage-grid)' })
    const started = await next(e)
    // Open unasked at every start. The desktop app starts sessions through the SDK
    // (isInteractive false, no surface yet): an unasked pane waits for a surface to
    // attach and then shows, so it is not gated on isInteractive.
    // The dashboard goes at the top of the chat itself (the transcript's first row).
    void ensureRow($, 'start')
    void refreshLive($)
    void loadCachedStats($).then(() => refreshStats($))
    $.clock.every(15000, () => void refreshLive($))
    $.clock.every(600000, () => void refreshStats($))
    void checkWhere($)
    $.clock.every(2000, () => void checkWhere($))
    // Work across chats: heartbeat out every 10 s, read the others every 5 s.
    void publish($, true)
    void refreshOthers($)
    $.clock.every(10000, () => void publish($, true))
    $.clock.every(5000, () => void refreshOthers($))
    return started
  })

  // A chat that ends publishes itself idle, so others stop counting it at once.
  on('session.end', async ($, e, next) => {
    await update($, work, wk => ({ main: { ...wk.main, busy: false }, agents: wk.agents.map(r => (ACTIVE.has(r.status) ? { ...r, status: 'killed', endedAt: Date.now() } : r)) }))
    await publish($, true)
    return next(e)
  })

  // A client joining later (the desktop app, a phone) gets the dashboard too.
  on('session.attach', async ($, e, next) => {
    const joined = await next(e)
    void ensureRow($, `attach ${(e as any).surface ?? ''}`)
    void refreshLive($)
    return joined
  })

  // Each task: which folder fits it. Also places the row if a chat began before any surface drew.
  let isRowSure = false
  on('prompt.submit', async ($, e, next) => {
    const text = e.text ?? ''
    if (text.includes(DONE_MARK)) answerNextStep = true
    if (!e.isMeta && !e.command && !text.startsWith(SWITCH_MARK) && !text.startsWith(CHOOSE_PROMPT.slice(0, 30))) {
      const s = await read($, stats)
      const hit = suggestEnv(text, s?.envs ?? [])
      await update($, task, () => ({ text: text.slice(0, 200), suggested: hit?.path ?? null, score: hit?.score ?? 0, dismissed: false }))
    }
    if (!isRowSure) {
      isRowSure = true
      void ensureRow($, 'first prompt')
    }
    return next(e)
  })

  // The band over the prompt. A new chat (no turns yet): the front card, environment menu and a
  // button for the full dashboard. Later: only when it matters (task fits another folder, 2+ running).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if ((e as any).props?.hasSurvey) return next(e)
    const [tk, w0, turns, s, l, wk, home] = await Promise.all([read($, task), read($, where), $.session.turns(), read($, stats), read($, live), read($, work), $.env.get('HOME')])
    const cwd = w0 || (await $.session.cwd())
    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els
    const hasSvg = e.surface !== 'terminal' && 'Svg' in els
    const Svg = (els as any).Svg
    const isNew = turns === 0
    const running = workRows(wk, l?.now || Date.now(), l?.title ?? null, l?.others ?? []).running.length
    const mismatch = !!tk?.suggested && !tk.dismissed && tk.suggested !== cwd
    const isWorkHidden = await read($, workHidden)
    if (!isNew && !mismatch && (running < 2 || isWorkHidden)) {
      // Nothing urgent: one slim line with a button that shows or hides the full dashboard.
      const isOpen = (await $.ui.panes()).some((pane: { id: string }) => pane.id === PANE)
      const five = l?.limits.find(x => x.kind === 'five_hour')
      const sumNow = s ? summarize(s).sum : null
      const facts = [sumNow ? `${fmt(sumNow.all)} tokens` : '', sumNow && sumNow.fable > 0 ? `Fable ${fmt(sumNow.fable)}` : '', five ? `5-hour ${Math.round(five.percentUsed)}%` : '', running === 1 ? '1 running' : '']
        .filter(Boolean)
        .join(' · ')
      return (
        <Box flexDirection="row" gap={2} alignItems="center">
          <Button
            key="dash:toggle"
            plain
            onPress={() => void (isOpen ? $.ui.close({ id: PANE }) : $.ui.open({ id: PANE, title: TITLE }))}
          >
            <Text color="suggestion">{isOpen ? '▦ Hide dashboard' : '▦ Dashboard'}</Text>
          </Button>
          {facts ? <Text color="subtle">{facts}</Text> : null}
          {isWorkHidden && running >= 2 ? (
            <Button key="work:show" plain onPress={() => void update($, workHidden, () => false)}>
              <Text color="suggestion">▴ Show working now ({running})</Text>
            </Button>
          ) : null}
        </Box>
      )
    }
    if (!drawnOn.has(`band:${e.surface}`)) {
      drawnOn.add(`band:${e.surface}`)
      void note($, `band drawn on ${e.surface} (new=${isNew}, running=${running}, mismatch=${mismatch})`)
    }
    const cols: number = (e as any).props?.bodyColumns ?? e.viewport?.columns ?? 90
    const widthPx = Math.min(720, cols * 7.6)
    const isFullOpen = (await $.ui.panes()).some((pane: { id: string }) => pane.id === PANE)
    const openFull = (
      <Button key="dash:open" plain onPress={() => void (isFullOpen ? $.ui.close({ id: PANE }) : $.ui.open({ id: PANE, title: TITLE }))}>
        <Text color="suggestion">{isFullOpen ? 'Hide full dashboard' : 'Open full dashboard ›'}</Text>
      </Button>
    )
    if (isNew) {
      const card = hasSvg ? dashboardSvg(s, l, widthPx, wk, 'home') : null
      return (
        <Box flexDirection="column" gap={1}>
          {card ? <Svg source={card.svg} alt={`Total tokens ${s ? fmt(summarize(s).sum.all) : ''}`} /> : null}
          {await envMenu($, els)}
          {openFull}
        </Box>
      )
    }
    const target = tk?.suggested ?? ''
    const workCard = running >= 2 && !isWorkHidden && hasSvg ? dashboardSvg(s, l, widthPx, wk, 'work') : null
    return (
      <Box flexDirection="column" gap={1}>
        {workCard ? <Svg source={workCard.svg} alt={`${running} running`} /> : running >= 2 ? <Text>{running} running</Text> : null}
        {mismatch ? (
          <Box flexDirection="row" gap={1} alignItems="center">
            <Text color="suggestion">
              This looks like {envName(target, home ?? '')} work; you're in {envName(cwd, home ?? '')}.
            </Text>
            <Button key="env:band-switch" variant="primary" label={`Switch to ${cut(envName(target, home ?? ''), 18)}`} onPress={() => void sendSwitch($, target)} />
            <Button key="env:band-stay" label="Stay" onPress={() => void update($, task, x => (x ? { ...x, dismissed: true } : x))} />
          </Box>
        ) : null}
        <Box flexDirection="row" gap={2}>
          {openFull}
          {running >= 2 && !isWorkHidden ? (
            <Button key="work:hide" plain onPress={() => void update($, workHidden, () => true)}>
              <Text color="subtle">▾ Hide working now</Text>
            </Button>
          ) : null}
        </Box>
      </Box>
    )
  })

  // The mod's own finishing turn after a direct move: answered here, instantly, with no model call.
  on('turn.step', async function* ($, e, next) {
    if (answerNextStep && e.agentId === undefined && e.index === 0) {
      answerNextStep = false
      const text = 'Moved.'
      yield { kind: 'text', index: 0, text } as any
      yield { kind: 'stop', stopReason: 'end_turn', usage: null } as any
      return { turnId: e.turnId, index: e.index, answer: text, toolUses: [], stopReason: 'end_turn', usage: null }
    }
    return yield* next(e)
  })

  // Main chat working or idle.
  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    const now = await $.clock.now()
    if (e.agentId === undefined) {
      await update($, work, wk => ({ ...wk, main: { busy: true, since: now, tools: 0, lastTool: '' } }))
    } else {
      const id = e.agentId
      await update($, work, wk =>
        wk.agents.some(r => r.id === id)
          ? { ...wk, agents: wk.agents.map(r => (r.id === id ? { ...r, status: 'running', endedAt: null } : r)) }
          : { ...wk, agents: [...wk.agents, { id, name: 'Subagent', type: 'agent', model: '', status: 'running', startedAt: now, endedAt: null, tools: 0, lastTool: '' }].slice(-40) },
      )
    }
    void publish($, true)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      void checkWhere($)
      $.clock.after(1500, () => void checkWhere($))
    }
    const now = await $.clock.now()
    if (e.agentId === undefined) {
      await update($, work, wk => ({ ...wk, main: { ...wk.main, busy: false } }))
    } else {
      const id = e.agentId
      await update($, work, wk => ({ ...wk, agents: wk.agents.map(r => (r.id === id && ACTIVE.has(r.status) ? { ...r, status: 'completed', endedAt: now } : r)) }))
    }
    void publish($, true)
    return done
  })

  // A subagent starts: its task, type and model.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined && result.agentId) {
      const id = result.agentId
      const text = String(e.description || e.prompt || 'Subagent').replace(/\s+/g, ' ').trim()
      const row: WorkRow = { id, name: text, type: e.subagentType ?? 'agent', model: result.model ?? '', status: 'running', startedAt: await $.clock.now(), endedAt: null, tools: 0, lastTool: '' }
      await update($, work, wk => ({ ...wk, agents: [...wk.agents.filter(r => r.id !== id), row].slice(-40) }))
    }
    void publish($, true)
    return result
  })

  // Each tool call: who ran it and what.
  on('tool.call', async ($, e, next) => {
    const label = describeTool(e.tool, e as unknown as Record<string, unknown>)
    const id = e.agentId
    await update($, work, wk =>
      id
        ? { ...wk, agents: wk.agents.map(r => (r.id === id ? { ...r, tools: r.tools + 1, lastTool: label } : r)) }
        : { ...wk, main: { ...wk.main, busy: true, since: wk.main.busy ? wk.main.since : Date.now(), tools: wk.main.tools + 1, lastTool: label } },
    )
    void publish($)
    return next(e)
  })

  on('command.run', { command: 'dashboard' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    void refreshLive($)
    return { text: 'Dashboard opened.' }
  })

  on('command.run', { command: 'usage-grid' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    void refreshLive($)
    void refreshStats($)
    return { text: 'Dashboard opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const s = await read($, stats)
    const l = await read($, live)

    // Desktop, phone and editor draw the full iOS-style dashboard as one SVG.
    if (e.surface !== 'terminal' && 'Svg' in els) {
      const cols: number = (e as any).props?.bodyColumns ?? 60
      return richTree($, e, els, cols * 7.6)
    }
    const columns: number = (e as any).props?.bodyColumns ?? 60
    const now = l?.now ?? 0

    const header = (
      <Box flexDirection="column">
        {now > 0 && <Text bold>{clockText(now)}</Text>}
      </Box>
    )

    // Plan limits, context, cost, agents: from the engine, live.
    const live_ = (
      <Box flexDirection="column">
        <Text> </Text>
        <Text dimColor>Right now</Text>
        {(l?.limits ?? []).length === 0 && <Text dimColor>No plan limit reading yet (shows after a reply).</Text>}
        {(l?.limits ?? []).map((lim: Limit) => (
          <Text color={lim.percentUsed >= 90 ? '#ff6b5e' : lim.percentUsed >= 70 ? '#ffb347' : undefined}>
            {limitName(lim.kind).padEnd(7)} {String(Math.round(lim.percentUsed)).padStart(3)}% used
            {lim.resetsAt ? ` · resets in ${untilText(lim.resetsAt, now)}` : ''}
          </Text>
        ))}
        {l?.ctxPercent != null && (
          <Text>
            {'Chat'.padEnd(7)} {String(Math.round(l.ctxPercent)).padStart(3)}% full
            {l.ctxTokens != null ? ` · ${fmt(l.ctxTokens)} tokens` : ''}
          </Text>
        )}
        {l?.usd != null && <Text>{'Cost'.padEnd(7)} ${l.usd.toFixed(2)} this chat</Text>}
      </Box>
    )

    const agentsView = (() => {
      const list: AgentLine[] = l?.agents ?? []
      const running = list.filter(a => ACTIVE.has(a.status))
      return (
        <Box flexDirection="column">
          <Text> </Text>
          <Text dimColor>Agents ({running.length} running)</Text>
          {running.length === 0 && <Text dimColor>None running.</Text>}
          {running.slice(0, 5).map(a => (
            <Text>
              <Text color="#5fa3e8">● </Text>
              {a.name.length > columns - 6 ? `${a.name.slice(0, Math.max(1, columns - 7))}…` : a.name}
            </Text>
          ))}
          {running.length > 5 && <Text dimColor>+{running.length - 5} more</Text>}
        </Box>
      )
    })()

    const tips = recommend(s, l)
    const tipsView = (
      <Box flexDirection="column">
        <Text> </Text>
        <Text dimColor>Recommendations</Text>
        {tips.map(t => (
          <Text>
            <Text color="#5fa3e8">› </Text>
            {t}
          </Text>
        ))}
      </Box>
    )

    if (!s || Object.keys(s.days).length === 0) {
      return (
        <Box flexDirection="column">
          {header}
          <Text dimColor>Reading your Claude Code logs…</Text>
          {live_}
          {agentsView}
          {tipsView}
        </Box>
      )
    }

    const { keys, sum, best, longest, current, today, avgOut7 } = summarize(s)
    const level = levelFor(s)

    // Grid: one column per week (Sunday first), two characters wide; newest weeks on the right.
    const startIso = addDays(keys[0], -toDate(keys[0]).getUTCDay())
    const allWeeks = Math.floor((toDate(s.today).getTime() - toDate(startIso).getTime()) / (7 * 864e5)) + 1
    const weeks = Math.max(1, Math.min(allWeeks, Math.floor((columns - 5) / 2)))
    const gridStart = addDays(startIso, (allWeeks - weeks) * 7)

    let monthRow = ''.padEnd(5)
    let lastMonth = -1
    for (let w = 0; w < weeks; w++) {
      const m = toDate(addDays(gridStart, w * 7)).getUTCMonth()
      if (m !== lastMonth && monthRow.length <= 5 + w * 2) monthRow = monthRow.padEnd(5 + w * 2) + MONTHS[m]
      lastMonth = m
    }

    const rows = ['Sun', '', 'Tue', '', 'Thu', '', 'Sat']
    const recent = keys.slice(-7).reverse()
    const models = s.models.slice(0, 3)
    const modelMax = Math.max(1, ...models.map(m => m[1]))

    return (
      <Box flexDirection="column">
        {header}
        <Text bold color="#9fd0ff">{fmt(sum.all)} total tokens</Text>
        {sum.fable > 0 && <Text color="#c9b8ff">Fable {fmt(sum.fable)} tokens · {fmt(sum.fableOut)} output</Text>}
        <Text dimColor>
          {fmt(sum.out)} output · {sum.sessions} sessions · {keys.length} active days
        </Text>
        <Text>
          Today {today ? `${fmt(today.out)} out · ${fmt(total(today))} all · ${today.sessions} sessions` : 'no activity yet'}
          {avgOut7 > 0 ? ` (7-day avg ${fmt(avgOut7)} out)` : ''}
        </Text>
        {live_}
        {agentsView}
        {tipsView}
        <Text> </Text>
        <Text dimColor>{monthRow}</Text>
        {rows.map((label, r) => (
          <Box flexDirection="row">
            <Text dimColor>{label.padEnd(5)}</Text>
            {Array.from({ length: weeks }, (_, w) => {
              const iso = addDays(gridStart, w * 7 + r)
              const future = iso > s.today
              return <Text color={future ? undefined : RAMP[level(iso)]}>{future ? '  ' : '■ '}</Text>
            })}
          </Box>
        ))}
        <Box flexDirection="row">
          <Text dimColor>{'Less '}</Text>
          {RAMP.map(c => (
            <Text color={c}>■ </Text>
          ))}
          <Text dimColor>More</Text>
        </Box>
        <Text> </Text>
        <Text>
          Busiest {short(best)} ({fmt(s.days[best].out)} out) · streak {current}d (best {longest}d)
        </Text>
        <Text> </Text>
        <Text dimColor>Last 7 days: output · all tokens · sessions</Text>
        {recent.map(k => (
          <Box flexDirection="row">
            <Text color={RAMP[level(k)]}>■ </Text>
            <Text>
              {short(k).padEnd(7)}
              {fmt(s.days[k].out).padStart(6)} {fmt(total(s.days[k])).padStart(7)} {String(s.days[k].sessions).padStart(3)}
            </Text>
          </Box>
        ))}
        {models.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text dimColor>Models by output</Text>
            {models.map(([name, out]) => (
              <Text>
                <Text color="#5fa3e8">{'█'.repeat(Math.max(1, Math.round((out / modelMax) * 8)))}</Text>
                {` ${name.replace('claude-', '')} ${fmt(out)}`}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })

  // The dashboard as the chat's first row.
  on('ui.render', { component: 'Placed' }, async ($, e, next) => {
    const props = (e as any).props ?? {}
    if (props.id !== ROW || props.plugin !== 'usage-grid') return next(e)
    if (!drawnOn.has(e.surface)) {
      drawnOn.add(e.surface)
      void note($, `row drawn on ${e.surface}`)
    }
    const els = $.ui.resolve(e)
    if (e.surface !== 'terminal' && 'Svg' in els) {
      const cols: number = e.viewport?.columns ?? 100
      return richTree($, e, els, Math.min(760, cols * 7.6))
    }
    const { Text } = els
    const s = await read($, stats)
    return <Text dimColor>{s ? `${fmt(summarize(s).sum.all)} total tokens · ` : ''}/usage-grid opens the dashboard</Text>
  })
}
