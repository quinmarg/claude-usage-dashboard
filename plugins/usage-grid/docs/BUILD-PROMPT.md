Build me a Claude Code mod called `usage-grid`: an iOS-style usage dashboard for Claude Code. Load the `plugin-authoring` skill first and follow it (folder layout, `hooks/register.tsx`, the types file, `claude plugin validate` and `claude plugin test`). Work in small steps, write tests for the pure functions, and show me the real test output.

## What it does

1. **Dashboard** (a pane, `$.ui.open`, drawn by a `ui.render` hook on `Pane`). On the desktop app, phone and editor, draw the whole dashboard as ONE `Svg` element (pass `isInteractive` so hover `<title>` tooltips work). In the terminal, draw a plain Text version. Blue palette, iOS look: rounded translucent cards with a soft shadow, SF / system font, light and dark via `@media (prefers-color-scheme: dark)` inside the SVG's `<style>`. Lay it out for the pane's width (`props.bodyColumns × ~7.6 px`): one column when narrow, two-up rows from about 620 px. Sections, top to bottom:
   - Header: long date ("Tuesday, November 10") and the time.
   - **Working now** card (see 4). It sits at the very top whenever anything is running; when idle it moves down next to Models.
   - Hero card on a blue→indigo gradient: **total tokens** (big), "since <first day> · incl. cache", a 30-day sparkline, and four mini stats (output tokens, sessions, active days, current streak).
   - Three rings (Apple Activity style): 5-hour limit %, weekly limit % (with "resets in 2h 14m"), and this chat's context %. Orange at 70%, red at 90%. Data from `$.session.usage()` (`rateLimits` kinds `five_hour` and `seven_day`, `context.percent`).
   - Today strip: today's output tokens with ▲/▼ % against the 7-day average, sessions today, streak.
   - **Activity**: a wide rectangle of rounded day squares, one column per week (up to 53 weeks as width allows), colored by output tokens in quartiles (blue at 4 opacities), month labels, Mon/Wed/Fri labels, a Less→More legend, and a tooltip per day.
   - Last 14 days: rounded bars, today solid.
   - Models by output tokens (bars).
   - Recommendations: up to 4 rule-based tips with a colored badge (limit at 70% or 90%, chat over 60% full, 3+ agents running, today over 2× the 7-day average, more than 90% of tokens being re-read cache → "start fresh chats for new topics"), else "Usage looks healthy".

2. **Data**: ship `hooks/stats.py` and run it with `$.process.run(['python3', '-I', `${$.plugin.root}/hooks/stats.py`])`. It reads `~/.claude/projects/**/*.jsonl`, takes each line's `message.usage` (input, output, cache read, cache write), dedupes by `(message.id, requestId)`, groups by LOCAL date (convert the UTC `timestamp`), counts sessions per day (distinct files) and output tokens per model, and prints JSON. Refresh at session start and every 10 minutes. Live figures (limits, context, agents) every 15 s. Keep values in `atom(...)` with a `shape` tag, and bump the tag whenever a type changes.

3. **Front of every new chat.** IMPORTANT: the desktop app does NOT draw `$.ui.place` rows ("no attached surface draws placed rows yet"), and a mod cannot draw on the app's start screen. What it does draw is the `AbovePrompt` band (just above the message box) and panes. So:
   - In a new chat (`$.session.turns() === 0`): the band shows a compact card (header, Working now if busy, hero), the environment menu (5), and an "Open full dashboard ›" button. Also open the pane.
   - Later: the band shows only when it matters (the task fits another folder, or 2+ things are running anywhere). Otherwise it shows one slim line: a "▦ Dashboard / Hide dashboard" toggle button with total tokens and 5-hour %.
   - Register `/dashboard` and `/usage-grid` to open the pane.
   - Do NOT gate on `e.isInteractive`: the desktop app starts sessions through the SDK, so it is false there. Call `$.ui.open` anyway; an unasked pane waits for a surface to attach. Open again on `session.attach`.
   - Updating an installed mod reloads it in EVERY open chat and re-runs `session.start`, so only auto-show when `turns === 0`.

4. **Working now, across ALL chats on this Mac.** A mod only sees its own session, so:
   - Track the main chat with `turn.start` / `turn.complete` where `e.agentId === undefined` (busy since, tool count, last tool), and subagents with `agent.spawn` (task description, `subagentType`, model), `tool.call` (`e.agentId` → that agent's count and last tool), and `$.agent.list()` every 15 s for status changes (`pending`, `running` and `waiting` are active). Note that `$.agent.list()` alone never includes the main chat.
   - Each chat writes `~/.claude/usage-grid/work/<sessionId>.json` (title, cwd, main, agents, updatedAt) on every change (throttled to every 2 s during tool calls) plus a 10 s heartbeat. Every dashboard reads the folder every 5 s, ignores files older than 90 s, and removes files older than 2 days. On `session.end`, write itself idle.
   - Name rows by the chat's title: read the session's own jsonl for the newest `"type":"custom-title"` (`customTitle`), else `"ai-title"` (`aiTitle`); add a `title <sessionId>` mode to stats.py for this. Untitled chats show "Chat in <folder>". Subagent rows say "in <chat name> · type · model · N tools · current tool". The pill says "N running · M chats". Finished agents stay listed (dimmed) for 15 minutes.
   - Describe a tool call in a few words: a Bash call shows its `description`, not the raw command; Read shows the file name.

5. **Environment menu** (native Box/Button, because a Button can only hold strings and Text, never an Svg). Theme it with theme keys so it follows light and dark mode (`borderColor="subtle"`, `color="suggestion"` for accents, `color="subtle"` for secondary text, a faint `#8080800d` background and a `#80808024` hover). It lists recent project folders: take each jsonl line's `cwd` with its newest timestamp, keep folders that still exist, drop hidden folders (`/.`), temp folders and app scratch folders, fold a subfolder into its project, but never let home, Documents, Desktop or Downloads swallow the projects inside them. Show a small laptop-outline Svg icon per row, a ✓ on the current folder (`$.session.cwd()`), "Choose environment ⌄" at the bottom, and "wrong folder? switch any time" at the top.
   - Pressing a folder calls `$.prompt.submit` with text asking Claude to call the app's `change_directory` tool with that exact path and confirm in one line; "Choose environment" asks it to call `request_directory` with no path. This moves the chat to another folder even mid-chat (the person approves the move).
   - CRITICAL: a `ui.press` handler has a 10 s budget. Use `void $.prompt.submit(...)` and never await it (awaiting waits for the whole turn and fails).
   - **Suggest a folder for the task**: on `prompt.submit` (skip slash commands, meta prompts and the mod's own switch prompts), match the message's words against each project's name words (weight 3) and the top words of its README.md / CLAUDE.md / AGENTS.md / docs/PLAN.md / package.json (weight 1, counted only from 3 distinct hits). Use stop-word lists on both sides that include generic words like claude, chat, folder, file, button, make, its. Suggest only when the best score is 3+ and clearly ahead. Show "This task fits X better than Y" with a "Switch to X" primary button on its OWN line (shorten long names to about 18 characters so it fits), mark the row "· suggested", and add a band bar with "Switch to X" / "Stay".

6. **Debug log**: append one line per placement attempt and draw to `~/.claude/usage-grid.log`, using atomic appends (`/bin/sh -c 'printf "%s\n" "$1" >> "$2"'`), because several chats start at once and read-then-write loses lines. Keep it to the last ~300 lines.

## Install so every new chat has it

Put the mod in a local marketplace folder (`<folder>/.claude-plugin/marketplace.json` listing `./mods/usage-grid`), add it as a known marketplace, and enable `usage-grid@<marketplace>` in user settings. The installed copy is a cached snapshot, so after each edit bump `version` in plugin.json and marketplace.json, then run `claude plugin marketplace update <marketplace>` and `claude plugin update usage-grid@<marketplace>`.

## Done means

`claude plugin validate` passes, `claude plugin test` passes (test: number formatting, streaks, quartile levels, reset countdown text, recommendations, word wrap and XML escaping, every SVG section present and under 131072 characters, the work card moving to the top when busy, the cross-chat rows and their order, the folder suggestions including the generic-message case returning nothing, and the Bash description label). A new chat shows the front card above the message box, and the log says "band drawn on desktop (new=true)". Tell me anything you could not verify.
