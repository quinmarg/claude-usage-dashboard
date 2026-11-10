# Changelog (usage-grid)

## 0.9.2
- Environment menu: the ✓ has its own column, so it never sits on a long folder name; long names are shortened, and the current folder no longer also says "suggested".

## 0.9.1
- Near-instant environment switching: after the direct move, the mod ends a marked turn after 250 ms and a `turn.step` hook answers it ("Moved.") with no model call.

## 0.9.0
- The environment menu calls the app's move tool itself (the button press is the consent), so no Claude reply is needed. Falls back to the old prompt if the direct call is refused.

## 0.8.2
- Work files carry `ctx` (context percent and tokens); plan limits are shared in `~/.claude/usage-grid/limits.json` for the Claude Widgets desktop app.
