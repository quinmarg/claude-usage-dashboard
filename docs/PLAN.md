# Plan: Claude Usage Dashboard repo

## Goal
One private GitHub repo holding two pieces that work together, installable on any Mac by someone else's Claude Code:

1. **usage-grid** (Claude Code mod, v0.9.1): a usage dashboard bar above the prompt and a side pane, an environment menu, and "Working now" across all open chats.
2. **Claude Widgets** (native SwiftUI Mac app, v1.1.1): desktop widgets (Usage, Prompt box, Agents) that read the files usage-grid writes.

## Layout
```
.claude-plugin/marketplace.json   makes the repo a plugin marketplace, lists ./plugins/usage-grid
plugins/usage-grid/               the mod (manifest, hooks/, types/, tests/, docs/BUILD-PROMPT.md)
widget/                           the Swift package (src/, tests/, scripts/install.sh, scripts/uninstall.sh)
docs/PLAN.md                      this file
README.md                         what each piece does, requirements, install, test, uninstall
LICENSE                           MIT
```

## Data flow
```
~/.claude/projects/**/*.jsonl ──stats.py──▶ ~/.claude/usage-grid/stats.json ─┐
usage-grid (each open chat) ───────────────▶ ~/.claude/usage-grid/limits.json ├─▶ Claude Widgets
                                           ▶ ~/.claude/usage-grid/work/*.json ┘
```
The widget runs `stats.py` itself when stats.json is older than 15 minutes. It finds the script in Claude Code's plugin cache (`~/.claude/plugins/cache/<marketplace>/usage-grid/<version>/hooks/stats.py`, newest first), so it works whatever the marketplace is called.

## Making it portable
- No author names, home-folder paths, or private project names in code, tests or docs (generic `/Users/me/...`, `alpha-app`, etc.).
- Launch agent and bundle id: `com.claude-widgets` (was a personal label). The installer removes nothing else.
- Code behaviour unchanged except the stats.py lookup above (same script, found in the standard install location).

## Checks
- `claude plugin validate plugins/usage-grid` and `claude plugin test plugins/usage-grid`
- `cd widget && swift run CoreTests`
- secret scan of the whole folder, then a read of every file, before the first push
