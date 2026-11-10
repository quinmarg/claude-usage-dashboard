# Changelog

## 1.2.0 (2026-11-10)
- Fable usage: a highlighted Fable slot first in the hero's mini stats, and a fourth Fable ring (its own plan limit if one is reported, else Fable's share of all tokens). Needs usage-grid 0.10's stats.json; older files show 0.
- The other mini stats and rings are smaller so four rings and five stats fit.
- Locked in place by default: dragging does nothing. Right-click → "Unlock to move", then "Lock in place" when done.

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
