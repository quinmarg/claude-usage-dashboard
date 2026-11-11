export type DayStat = {
  in: number; out: number; cr: number; cw: number; sessions: number
  /** Fable tokens that day: all (incl. cache) and output. Missing in caches from before 0.10. */
  fa?: number; fo?: number
}
export type Env = { path: string; last: string; name?: string[]; words?: string[] }
export type Stats = {
  today: string
  days: Record<string, DayStat>
  models: [string, number][]
  /** Recent project folders, newest first. */
  envs?: Env[]
  /** When the logs were last read, clock ms. */
  at: number
}
export type Limit = { kind: string; percentUsed: number; resetsAt: string | null }
export type AgentLine = { id: string; name: string; type: string; status: string }
export type Live = {
  /** Clock ms, rounded down to the minute so the pane only redraws when something shows differently. */
  now: number
  agents: AgentLine[]
  limits: Limit[]
  ctxPercent: number | null
  ctxTokens: number | null
  ctxWindow: number | null
  usd: number | null
  /** This chat's name (its custom title, else its AI title). */
  title: string | null
  /** Work published by the other chats on this Mac (fresh within 90 s). */
  others: ChatWork[]
}

/** One piece of work on the dashboard: the main chat or a subagent. */
export type WorkRow = {
  id: string
  name: string
  type: string
  model: string
  status: string
  startedAt: number
  endedAt: number | null
  tools: number
  lastTool: string
}
export type Work = {
  main: { busy: boolean; since: number; tools: number; lastTool: string }
  agents: WorkRow[]
}

/** What one chat publishes for the others: ~/.claude/usage-grid/work/<sessionId>.json. */
export type ChatWork = {
  sessionId: string
  title: string | null
  cwd: string
  main: Work['main']
  agents: WorkRow[]
  /** This chat's context window use, for the desktop widgets. */
  ctx?: { percent: number | null; tokens: number | null; window: number | null } | null
  updatedAt: number
}

/** The latest task and the folder it fits best. */
export type Task = { text: string; suggested: string | null; score: number; dismissed: boolean }

declare module 'claude-code' {
  interface PluginState {
    'usage-grid': { stats: Shaped<Stats | null>; live: Shaped<Live | null>; work: Shaped<Work>; task: Shaped<Task | null>; workHidden: boolean; where: string; pending: Shaped<{ path: string; at: number; nagged: boolean } | null>; dailyHidden: boolean; switchReq: Shaped<{ sid: string; path: string; nonce: string; used: boolean } | null>; museum: Shaped<{ wall: { title: string; artist: string; year: string; room: string } | null; reminders: string[] } | null> }
  }
}
