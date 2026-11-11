# Changelog (usage-grid)

## 0.12.1 (2026-11-11)
- Fix: chats were moved to folders nobody chose. Every chat drew its switch buttons with the same `key`, so one press could run the same-named button in other chats (each switching to its own suggested folder), and a second press sent a second switch. Now: keys carry the chat's id; a press is checked against the chat; one switch per chat per 30 s; the switch message carries the chat's id and `prompt.submit` drops it if it is for another chat, already used, or older than 30 s. Presses and drops are logged.
- Tests: wrong chat ignored, double press / repeated message ignored, stale request expired.

## 0.12.0 (2026-11-11)
- Daily update in the bar above the message box for the first message and first reply of every chat: usage today vs yesterday with a weekly-limit outlook, open chats (working / idle and ready), reminders, the painting on the wall and the line of the day. Buttons: Open full dashboard, Hide for this chat. Text version in the terminal.
- Fix: the old new-chat card never showed in the desktop app (a chat only starts once the first message is sent); the daily update shows while `turns <= 1`.
- Data loads at the start of `session.start` instead of after every other mod's start-up, so numbers appear within seconds.
- The bar passes on to later mods' bars (stacked), instead of hiding them.
- Ring warning text uses the widget's colours in dark mode (#F7B36A, #F29580).
- Measured: no change in tokens per chat (context identical with the mod on and off); answer time unchanged.

## 0.11.0 (2026-11-11)
- Museum + glass look: translucent cards with a gold hairline and a top highlight, Baskerville for the total, the date and card titles, small-caps labels, gold `#C9A45C` as the only accent (rings, sparkline, heat map, bars, models, badges), parchment `#EFE6D2` text in dark mode. No more iOS blue.
- New cards: **On your wall** (the desktop painting as a museum label) and **For you today** (reminders from the Obsidian note "Reminders from Claude" + a classical line of the day). `/remind` lists, adds and ticks reminders. Read by the new `hooks/museum.py`.
- Limit warnings match the desktop widget: amber `#E58A3A` with ▲ from 70%, deep red `#C8452E` with ‼ from 90%.
- Environment menu, dashboard button and terminal view use the gold accent.
- Data formats unchanged (`stats.json`, `limits.json`, `work/*.json`). Previous version tagged `usage-grid-v0.10.2`.

## 0.10.2 (2026-11-10)
- Hero mini stats and the Today strip are centered in their columns; the Fable highlight is sized to its text and centered on it at every width.
- Today strip columns are sized to their text (short labels, "vs avg"), so nothing overlaps or gets cut off; numbers are a little bigger in wide panes.

## 0.10.1 (2026-11-10)
- Hero mini stats: each column is sized to its text and values shrink to fit, so long totals like Fable's no longer run into Output.

## 0.10.0 (2026-11-10)
- Fable usage: stats.py counts Fable tokens per day (`fa` all, `fo` output). The hero gets a highlighted Fable slot, the rings a fourth Fable ring (its own limit if one is reported, else its share of all tokens), the Today strip a "Fable today" column, and the slim band and terminal view a Fable total.
- The other mini stats, rings and Today columns are smaller so everything fits.

## 0.9.2
- Environment menu: the ✓ has its own column, so it never sits on a long folder name; long names are shortened, and the current folder no longer also says "suggested".

## 0.9.1
- Near-instant environment switching: after the direct move, the mod ends a marked turn after 250 ms and a `turn.step` hook answers it ("Moved.") with no model call.

## 0.9.0
- The environment menu calls the app's move tool itself (the button press is the consent), so no Claude reply is needed. Falls back to the old prompt if the direct call is refused.

## 0.8.2
- Work files carry `ctx` (context percent and tokens); plan limits are shared in `~/.claude/usage-grid/limits.json` for the Claude Widgets desktop app.
