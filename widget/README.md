# Claude Widgets

One iOS-style widget on the Mac desktop, built from the usage-grid dashboard. It holds four cards, top to bottom:

1. **Total tokens**: the blue hero card (total, "since … · incl. cache", 30-day sparkline, Output / Sessions / Active days / Streak).
2. **Rings**: the 5-hour limit, the weekly limit, and the context use of the latest chat. Rings turn orange at 70% and red at 90%.
3. **Working now**: one line per Claude chat that's working (name, tool count, current tool, run time) and an indented line per running subagent (type, tools). Up to 3 lines, then "+N more". When nothing runs it says so in one line.
4. **New Claude chat**: click the box, type, and press Return. A **new Claude Code chat** opens in the Claude app with your text filled in, ready to send. The folder pill picks which project folder the chat starts in. Sending it empty just opens Claude Code.

They sit on the desktop layer, above the wallpaper and below every window, on every Space except full-screen apps. They follow light/dark mode and update every 3 seconds. Drag it anywhere and its position is remembered. Right-click it for **Refresh now · Open Claude Code · Reset widget position · Quit**.

> `--snapshot` renders are offscreen: the text box and folder pill show as yellow placeholders there, and on the real desktop the cards are frosted glass over your wallpaper.

## How it works
- A native SwiftUI/AppKit app (`src/ClaudeWidgets`) with no Dock icon. It's built with the Command Line Tools (`swift build`), so no Xcode is needed.
- It reads files the **usage-grid** mod already writes and never re-scans your logs itself unless they're stale:
  - `~/.claude/usage-grid/stats.json`: token totals per day. If it's older than 15 minutes (no chat open), the app runs usage-grid's `stats.py` to refresh it, found in Claude Code's plugin cache (`~/.claude/plugins/cache/*/usage-grid/*/hooks/stats.py`, newest install).
  - `~/.claude/usage-grid/work/<session>.json`: one heartbeat per open chat. Anything older than 90 s counts as closed.
  - `~/.claude/usage-grid/limits.json`: the 5-hour and weekly limits (usage-grid **0.8.2+**). Each chat's work file also carries its context use.
- The prompt box opens `claude://code/new?q=<text>&folder=<path>`, the Claude desktop app's own "new Claude Code session" link.
- Why not real WidgetKit widgets? They need full Xcode and a signing identity (the Command Line Tools have neither), they're sandboxed away from `~/.claude`, they can't hold a text field, and they refresh on Apple's schedule. See `docs/PLAN.md`.

## Install / run
```bash
cd widget        # from the repo root
./scripts/install.sh
```
This builds a release, installs `~/Applications/Claude Widgets.app` (launchd can't read `~/Documents`), ad-hoc signs it, adds the login item `~/Library/LaunchAgents/com.claude-widgets.plist` and starts it. Run it again after any code change to rebuild and restart.

- `./scripts/install.sh --app-only` installs and starts the app without the login item.
- To try it from source without installing, run `swift run ClaudeWidgets` (Ctrl-C to stop).
- After **Quit** from the right-click menu it stays off until your next login. To start it again, run `open ~/Applications/Claude\ Widgets.app`.

## Test
```bash
swift run core-tests
```
20 tests cover number formatting (matches the dashboard), the streak and 30-day series (including DST and after midnight), the ring values and reset handling, choosing the latest chat, agent rows, the 90-second freshness rule, old work files without context, finding usage-grid's stats.py in the plugin cache, and the prompt link's encoding (`+ & =`, new lines and emoji survive). `swift test` needs full Xcode, so the tests are a small runner instead.

To check the look, render the widget in light and dark with the live data:
```bash
"$HOME/Applications/Claude Widgets.app/Contents/MacOS/ClaudeWidgets" --snapshot /tmp/widget-shots
```

## Remove
```bash
./scripts/uninstall.sh   # from widget/
```
This stops the app, moves the login item and the app to the Trash, and forgets saved positions. The usage-grid mod keeps writing `limits.json`, which is harmless.

## Layout
```
src/WidgetCore/     models, formatting, summaries, file loading, prompt link (pure, tested)
src/ClaudeWidgets/  app: DesktopPanel, Store (3 s timer), HomeWidget (UsageWidget.swift) with hero, rings, AgentsCard, PromptCard; Theme; Snapshot
tests/CoreTests/    test runner     tests/fixtures/  sample stats.json
scripts/            install.sh, uninstall.sh
docs/               PLAN.md
```

See [CHANGELOG.md](CHANGELOG.md).
