# usage-grid

A Claude Code mod with an iOS-style dashboard.

**On a new chat** (before your first message) a card sits right above the message box: date, total tokens, anything running, and the environment menu, with *Open full dashboard*; the full dashboard also opens in the side pane. **After that** the bar above the message box only returns when it matters: your task fits another folder, or two or more things are running. (The desktop app does not draw rows inside the transcript yet, so the bar above the message box is the front.)

- **Environment menu**: your recent project folders, themed like the dashboard. The current one has a ✓; click another to move the chat there (you approve the move), even after the chat has started. "Choose environment" opens the folder picker.
- **Folder suggestions**: each message is matched against your projects' names and READMEs; when it fits another folder better, the menu says so and a bar over the prompt offers "Switch to …" or "Stay".
- **Working now**: every chat on this Mac that is working (each by its name) and every subagent, with the chat it belongs to. Each chat writes a small heartbeat file to `~/.claude/usage-grid/work/` (every 10 s, and on each change); files without a heartbeat for 90 s are ignored, and removed after 2 days.
  Per row:, with type, model, tool count, current tool and run time. It jumps to the top whenever something is running; finished work stays listed for 15 minutes.
- **Total tokens** with a 30-day trend, rings for the 5-hour and weekly limits and this chat's context, today versus your 7-day average, a year-long activity grid, the last 14 days, models, and plain recommendations.

**Dashboard button**: when nothing else needs the bar above the message box, it keeps one slim line, *▦ Dashboard* (or *Hide dashboard*) with total tokens and the 5-hour limit. `/dashboard` or `/usage-grid` opens the same dashboard in a side pane. The terminal gets a text version.

Data comes from your local logs (`~/.claude/projects/**/*.jsonl`) through `hooks/stats.py`; nothing leaves the Mac.

Install (in a terminal Claude Code session):

```
/plugin install usage-grid --marketplace quinmarg/claude-usage-dashboard
```

Test: `claude plugin test .` · Check: `claude plugin validate .`

Where the dashboard was placed in each chat is logged to `~/.claude/usage-grid.log` (last 200 lines).

## Speed and smoothness (0.7.0)
- A new chat shows the last scan at once (`~/.claude/usage-grid/stats.json`); a fresh scan of the logs (~3–4 s) runs behind it and every 10 minutes.
- The dashboard is two pictures: the live top (clock, work) and the slow body (charts, grid). Live updates redraw only the top, so the charts never flash.
- Other chats' heartbeats only redraw when something you can see changed; reset countdowns are coarse ("2h", "15m").
- The *Working now* popup over the message box has *▾ Hide working now*; *▴ Show working now* brings it back.

## Desktop widgets (0.8.2)
- Each chat's work file now also carries `ctx` (its context percent and tokens), and any chat writes the plan limits to `~/.claude/usage-grid/limits.json` (`{limits, sessionId, updatedAt}`) when they change, or once a minute. The Claude Widgets desktop app (the `widget/` folder of this repo) reads these.

## Faster environment switching (0.9.0, 0.9.1)
- Pressing a folder in the environment menu moves the chat right away: the mod calls the app's move tool itself (your press is the consent), so no Claude reply is needed. The ✓ moves within a few seconds.
- If the app only applies the move when a turn ends, the mod ends a marked turn after 250 ms and answers it itself ("Moved.") with no model call (0.9.1), so the switch is near-instant. If the direct call is refused, it falls back to asking Claude to make the move, as before.
