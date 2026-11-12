# usage-grid

A Claude Code mod with a Museum + glass dashboard: see-through cards with a thin gold edge, Baskerville for the big total and the card titles, gold `#C9A45C` as the only accent and parchment `#EFE6D2` text in dark mode. It follows the app's light and dark themes.

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

Test: `claude plugin test .` and `python3 -m unittest discover -s tests -p 'test_*.py'` · Check: `claude plugin validate .`

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

## Museum + glass look (0.11.0)
- New look everywhere the dashboard draws (new-chat card, `/dashboard` pane, environment menu, terminal colours). Same layout order as before ("Gallery wall"); numbers and every file in `~/.claude/usage-grid/` are unchanged, so the desktop widget and the notch app read them as before.
- **On your wall**: the painting that is your desktop picture right now, as a museum label (title, artist, year, and the `~/Pictures/Paintings/<Room>` it comes from). Paintings are named `Title, Artist (Year).jpg`.
- **For you today**: things Claude needs to remind you of, from the Obsidian note `40 Personal/Reminders from Claude.md` (every unticked `- [ ]` line; up to four shown), and a **line of the day** from the classics (Homer, Virgil, Seneca, Marcus Aurelius, Dante and others; built in, one per day).
- `/remind` lists reminders, `/remind <text>` adds one, `/remind done <n>` ticks one. Any Claude chat can also add a line to the note directly.
- Both are read by `hooks/museum.py` every 3 minutes (no internet; the painting comes from System Events).
- Limits warn with a sign as well as a colour: ▲ from 70% (amber), ‼ from 90% (deep red), the same as the desktop widget.
- Roll back: git tag `usage-grid-v0.10.2` has the previous (iOS-style) version.

## Daily update at the start of each chat (0.12.0)
- The bar above the message box shows a short **daily update** for your first message and Claude's first reply in every chat: **Usage** (today's output vs yesterday, the weekly limit and whether it lasts at this pace), **Chats** (other open chats on this Mac: which are working, which are idle and ready for you), **For you** (open reminders), **Wall** (the painting on your desktop) and the line of the day. *Open full dashboard* expands it; *Hide for this chat* folds it to the slim line.
- Why "first message", not "empty chat": the desktop app only starts a chat's process when the first message is sent, so a chat with no messages is never seen there.
- It is drawn for you only: Claude never reads it, so it adds **no tokens**. The bar draws in under 10 ms; the numbers load straight away at chat start (no longer waiting for other mods' start-up work).
- The terminal gets the same facts as plain lines.
- Other mods' bars now stack under it instead of being hidden.

## Folder switch fix (0.12.1, 0.12.2)
- A folder switch happens only in the chat where you pressed the button, and only once. Every button's address carries its chat's id; each press makes a one-time code, kept in the chat's own state (it survives `/reload-plugins`); the switch message carries the chat's id and the code, and the mod drops any switch message for another chat, with an old code, or sent twice (logged in `~/.claude/usage-grid.log`). There is no timer, because a plugin's message only goes in once the chat is idle: a press during a long reply still counts. Pressing the same folder again says "already on its way"; another folder replaces the pending one; a refused or failed send clears it so you can press again. (0.12.2)

## Layout polish (0.12.3, 0.12.4)
- One spacing scale (4/8/12/16/24): 16 px inside cards, 12 px between them; no text smaller than 12 px anywhere (pictures and daily update).
- Titles never collide with their small labels; footers and legends never overlap; every heatmap cell is the same size, with equal padding on both sides.
- In the narrow side pane (under ~420 px) some rows use short forms instead of cut text: the hero drops "Days", the Today row drops "Fable today" (both stay in the wide view), ring captions say "in 4h", the Activity label says "16 weeks · output".
- Checked at 340, 380, 560 and 760 px in light and dark; a test checks the 12 px minimum and equal cells at every width.
