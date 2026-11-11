#!/usr/bin/env python3
"""Museum cards for the usage-grid dashboard, read from this Mac only.

  museum.py show         -> JSON {"wall": {...} | null, "reminders": [...], "note": path}
  museum.py add TEXT     -> adds "- [ ] YYYY-MM-DD · TEXT" to the reminders note, prints the new list
  museum.py done N       -> ticks the Nth open reminder (1-based), prints the new list

The wall card is the desktop picture of the first display. Paintings are named
"Title, Artist (Year).jpg" and sorted into ~/Pictures/Paintings/<Room>/.
Reminders live in the Obsidian note "Reminders from Claude": every unticked
"- [ ]" line is one reminder. Claude chats add to it when something needs you.
"""
from __future__ import annotations

import datetime
import json
import os
import re
import subprocess
import sys

HOME = os.path.expanduser("~")
NOTE = os.environ.get(
    "USAGE_GRID_REMINDERS",
    os.path.join(HOME, "Documents", "Obsidian Vault", "40 Personal", "Reminders from Claude.md"),
)
PAINTINGS = os.environ.get("USAGE_GRID_PAINTINGS", os.path.join(HOME, "Pictures", "Paintings"))
OPEN = re.compile(r"^(\s*[-*] )\[ \] (.*)$")
TEMPLATE = """# Reminders from Claude

Things a Claude (or Codex) chat needs you to do or remember. The Claude dashboard shows every open line.
Add one as `- [ ] YYYY-MM-DD · what to do ([[project note]])`; tick it with `[x]` (or `/remind done N` in Claude).

## Open
"""


def parse_painting(path: str) -> dict | None:
    """'…/Odyssey/Ulysses Deriding Polyphemus, J.M.W. Turner (1829).jpg' -> title, artist, year, room."""
    if not path:
        return None
    base = os.path.splitext(os.path.basename(path))[0]
    year, note = "", ""
    # "Title, Artist (1829)" or "Title, Artist (1669) - detail": the year is the last bracket with digits.
    m = re.match(r"^(.*)\s*\(([^()]*\d{2,4}[^()]*)\)\s*(?:[-–—]\s*(.+))?$", base)
    if m:
        base, year, note = m.group(1).strip(), m.group(2), (m.group(3) or "").strip()
    title, artist = base, ""
    if ", " in base:
        title, artist = base.rsplit(", ", 1)
    if note:
        title = f"{title.strip()} ({note})"
    room = os.path.basename(os.path.dirname(path))
    if os.path.isdir(PAINTINGS):
        # A rotation folder holds copies: name the room the painting came from.
        try:
            for r in sorted(os.listdir(PAINTINGS)):
                if os.path.exists(os.path.join(PAINTINGS, r, os.path.basename(path))):
                    room = r
                    break
        except OSError:
            pass
    return {"title": title.strip(), "artist": artist.strip(), "year": year.strip(), "room": room}


def wallpaper() -> str:
    try:
        out = subprocess.run(
            ["osascript", "-e", 'tell application "System Events" to get picture of desktop 1'],
            capture_output=True, text=True, timeout=8,
        )
        return out.stdout.strip() if out.returncode == 0 else ""
    except Exception:
        return ""


def clean(text: str) -> str:
    """'2026-11-11 · Run install.sh ([[project-claude-widgets]])' -> 'Run install.sh'."""
    text = re.sub(r"\s*\(\[\[[^\]]*\]\]\)\s*$", "", text)
    text = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", text)
    text = re.sub(r"^\d{4}-\d{2}-\d{2}\s*[·:-]\s*", "", text)
    text = re.sub(r"[`*_]", "", text)
    return text.strip()


def read_lines() -> list[str]:
    try:
        with open(NOTE, encoding="utf-8") as f:
            return f.read().splitlines()
    except OSError:
        return []


def reminders(lines: list[str]) -> list[str]:
    return [clean(m.group(2)) for m in (OPEN.match(x) for x in lines) if m and clean(m.group(2))]


def write_lines(lines: list[str]) -> None:
    os.makedirs(os.path.dirname(NOTE), exist_ok=True)
    tmp = NOTE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines).rstrip("\n") + "\n")
    os.replace(tmp, NOTE)


def add(text: str) -> None:
    text = " ".join(text.split())
    if not text:
        return
    lines = read_lines() or TEMPLATE.splitlines()
    item = f"- [ ] {datetime.date.today().isoformat()} · {text}"
    open_at = [i for i, x in enumerate(lines) if OPEN.match(x)]
    if open_at:
        lines.insert(open_at[-1] + 1, item)
    else:
        heads = [i for i, x in enumerate(lines) if x.strip().lower() == "## open"]
        lines.insert(heads[0] + 1 if heads else len(lines), item)
    write_lines(lines)


def done(n: int) -> bool:
    lines = read_lines()
    k = 0
    for i, x in enumerate(lines):
        m = OPEN.match(x)
        if m and clean(m.group(2)):
            k += 1
            if k == n:
                lines[i] = f"{m.group(1)}[x] {m.group(2)} ✓ {datetime.date.today().isoformat()}"
                write_lines(lines)
                return True
    return False


def main(argv: list[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else "show"
    ok = True
    if cmd == "add":
        add(" ".join(argv[2:]))
    elif cmd == "done":
        try:
            ok = done(int(argv[2]))
        except (IndexError, ValueError):
            ok = False
    wall = parse_painting(wallpaper()) if cmd == "show" else None
    print(json.dumps({"ok": ok, "wall": wall, "reminders": reminders(read_lines()), "note": NOTE}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
