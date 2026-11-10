# Claude Widgets: plan

## Goal
Three widgets on the Mac desktop, styled like the usage-grid dashboard (iOS look, blue palette, light and dark):
1. **Usage**: the blue "Total tokens" hero card and the three rings (5-hour, weekly, latest chat's context).
2. **Prompt box**: type, press Return, and a new Claude Code chat opens with the text filled in.
3. **Agents**: what's running across every Claude chat: chat names, subagents, tool counts.

They start at login, show live numbers, and can be removed with one script.

## Options considered (2026-11-10)
| Option | Verdict |
|---|---|
| WidgetKit (real macOS widgets) | **No.** Needs full Xcode (only Command Line Tools here) and a signing identity (none). Widgets are sandboxed, so they'd need an app group plus a host app to copy `~/.claude` data in. They can't hold a text field (no prompt box) and refresh on Apple's budget, not live. |
| Übersicht-style widget engine | Possible, but needs third-party software downloaded and every refresh runs a shell command. |
| **Native SwiftUI desktop-level app** | **Chosen.** Built with `swift build` from the Command Line Tools and ad-hoc signed. Borderless panels at the desktop-icon level, on every Space, behind normal windows. No sandbox, so it reads `~/.claude/usage-grid/*` directly and updates every 3 s. A real text field. Starts at login through a LaunchAgent. |

## Data (all written by the usage-grid mod, nothing re-scanned)
- `~/.claude/usage-grid/stats.json`: days, sessions, envs. The app reloads it when it changes, and runs `stats.py` itself if it's older than 15 minutes (so it stays fresh with no chat open).
- `~/.claude/usage-grid/work/<sid>.json`: one per open chat, heartbeat every 10 s, ignored after 90 s. Since mod 0.8.2 it also carries `ctx` (context percent and tokens).
- `~/.claude/usage-grid/limits.json` (new in mod 0.8.2): `{limits:[{kind, percentUsed, resetsAt}], sessionId, updatedAt}`, written by any chat when the limits change or once a minute. A limit whose `resetsAt` has passed shows 0%.
- Prompt: `claude://code/new?q=<text>[&folder=<path>]`. The Claude desktop app reads `q` (or `prompt`) and `folder` (found in its app bundle).

## Parts
- `src/WidgetCore/`: pure Swift with no UI. Models, number formatting, summary (total, output, sessions, active days, streak, 30-day series), freshness filter, agent rows, prompt URL. All of it is tested.
- `src/ClaudeWidgets/`: AppKit + SwiftUI app. `DesktopPanel` (borderless, desktop level, draggable, remembers its position), `Store` (3 s timer), the three widget views, `Theme`.
- `tests/CoreTests/`: a test-runner executable (`swift test` doesn't work with only the Command Line Tools), with fixtures in `tests/fixtures/`.
- `scripts/install.sh`: builds a release, puts `Claude Widgets.app` in `~/Applications` (launchd can't read `~/Documents`), ad-hoc signs it, and loads the LaunchAgent `com.claude-widgets`. `scripts/uninstall.sh` reverses all of it with `trash`.

## Window behaviour
- Level: desktop-icon level + 1, so the widgets sit on the wallpaper under every app window, like real widgets.
- `canJoinAllSpaces`, `stationary`, and `ignoresCycle` (not in Cmd-Tab or Mission Control).
- Drag anywhere on a card to move it; positions are saved per widget.
- Right-click: Refresh, Open Claude, Reset positions, Quit.
