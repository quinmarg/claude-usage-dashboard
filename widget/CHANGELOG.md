# Changelog

## 1.1.1 (2026-11-10)
- Finds usage-grid's `stats.py` in Claude Code's plugin cache (any marketplace, newest install) instead of one fixed folder, so it works on any Mac.
- Launch agent and bundle id are now `com.claude-widgets`. Uninstall falls back to `~/.Trash` where `/usr/bin/trash` is missing (macOS 14).
- 20 core tests.

## 1.1.0 (2026-11-10)
- The three widgets are now one: hero card, rings, a compact Working now card (one line per chat or subagent, up to 3, then "+N more") and the New Claude chat box at the bottom. Window 380×608, top-right by default.
- Run times stay on one line; long chat names truncate.

## 1.0.0 (2026-11-10)
- First version: Usage, Prompt box and Agents widgets on the desktop layer, light and dark, live every 3 s.
- Reads usage-grid's stats.json, work heartbeats and the new limits.json (usage-grid 0.8.2 adds limits.json and per-chat context to the work files).
- Prompt box opens `claude://code/new?q=…&folder=…`.
- Install, login item (LaunchAgent) and uninstall scripts; 19 core tests; `--snapshot` renders.
