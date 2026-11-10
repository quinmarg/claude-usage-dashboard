# Claude Usage Dashboard

Two pieces that show your Claude Code usage at a glance. Everything stays on your Mac: both read your local Claude Code logs, and nothing is sent anywhere.

| Piece | What it is | Folder |
|---|---|---|
| **usage-grid** (v0.9.1) | A Claude Code mod: a dashboard card above the message box on new chats and in a side pane | [`plugins/usage-grid`](plugins/usage-grid) |
| **Claude Widgets** (v1.1.1) | A native Mac app: one widget on your desktop with the same numbers, plus a box that starts a new Claude chat | [`widget`](widget) |

The mod works alone. The widget needs the mod, because it reads the files the mod writes to `~/.claude/usage-grid/`.

## What each does

**usage-grid (the mod)**
- **Total tokens** with a 30-day trend, rings for your 5-hour and weekly limits and this chat's context, today versus your 7-day average, a year-long activity grid, models, and plain tips.
- **Working now**: every Claude chat on this Mac that is working, and every subagent, by name.
- **Environment menu**: your recent project folders. It suggests the folder your message fits, and one press moves the chat there right away (near-instant, no Claude reply needed).
- `/dashboard` (or `/usage-grid`) opens the full dashboard in a side pane.

**Claude Widgets (the desktop app)**
- One card stack on the desktop, under your windows: total tokens, the limit and context rings, Working now, and a **New Claude chat** box (type, press Return, and a Claude Code chat opens with your text).
- Light and dark mode, updates every 3 seconds, drag it anywhere. Right-click for Refresh, Open Claude Code, Reset position, Quit.

## Requirements
- macOS 14 or later
- [Claude Code](https://claude.com/claude-code) 2.1.275 or later (the mod draws in the Claude desktop app, the terminal and editors)
- `python3` (comes with the Xcode Command Line Tools)
- For the widget: the Xcode Command Line Tools (`xcode-select --install`). Full Xcode is not needed.
- `git` and the GitHub CLI `gh`, signed in (see below), because this repo is private.

## 1. Sign in to GitHub (private repo only)
Claude Code downloads the mod with git, and it never asks for a password. So give git your GitHub login once:

```bash
brew install gh
```

```bash
gh auth login
```

```bash
gh auth setup-git
```

You need an invite to this repo first, accepted at https://github.com/quinmarg/claude-usage-dashboard/invitations.

## 2. Install the mod
In a **terminal** Claude Code session (run `claude` in Terminal), type:

```
/plugin install usage-grid --marketplace quinmarg/claude-usage-dashboard
```

Answer `y` to add the marketplace, then press Enter for the user scope. It is active right away, and in every new chat after that, including the Claude desktop app.

Or from a shell:

```bash
claude plugin install usage-grid --marketplace quinmarg/claude-usage-dashboard
```

In the desktop app (where `/plugin` doesn't run): click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `quinmarg/claude-usage-dashboard`, then **Add plugin**.

Open a new chat: the dashboard card sits above the message box. The first scan of your logs takes a few seconds.

## 3. Install the desktop widget
```bash
git clone https://github.com/quinmarg/claude-usage-dashboard.git
```

```bash
cd claude-usage-dashboard/widget && ./scripts/install.sh
```

This builds the app (about a minute), puts `Claude Widgets.app` in `~/Applications`, and adds a login item so it starts with your Mac. `./scripts/install.sh --app-only` skips the login item. Details: [widget/README.md](widget/README.md).

The widget shows real numbers once the mod has run in at least one chat.

## Update
```bash
claude plugin marketplace update claude-usage-dashboard
```

```bash
claude plugin update usage-grid@claude-usage-dashboard
```

For the widget: `git pull` in the clone, then run `./scripts/install.sh` again.

## Uninstall
Widget (moves the app and login item to the Trash):

```bash
cd claude-usage-dashboard/widget && ./scripts/uninstall.sh
```

Mod:

```bash
claude plugin uninstall usage-grid@claude-usage-dashboard
```

```bash
claude plugin marketplace remove claude-usage-dashboard
```

The mod's cache folder `~/.claude/usage-grid/` (stats and heartbeats) and its log `~/.claude/usage-grid.log` can be moved to the Trash afterwards.

## Test
```bash
claude plugin validate .
```

```bash
claude plugin test plugins/usage-grid
```

```bash
cd widget && swift run core-tests
```

## Layout
```
.claude-plugin/marketplace.json   lists ./plugins/usage-grid, so this repo is a plugin marketplace
plugins/usage-grid/               the mod: hooks/register.tsx, hooks/stats.py, types/, tests/
widget/                           the Swift package: src/, tests/, scripts/install.sh, scripts/uninstall.sh
docs/PLAN.md                      how the pieces fit together
```

## License
MIT, see [LICENSE](LICENSE).
