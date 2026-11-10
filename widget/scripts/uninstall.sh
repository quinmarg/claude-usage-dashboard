#!/bin/zsh
# Removes Claude Widgets: stops it, removes the login item and moves the app to the Trash.
set -uo pipefail
LABEL="com.claude-widgets"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
APP="$HOME/Applications/Claude Widgets.app"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
pkill -x ClaudeWidgets 2>/dev/null || true
# Move to the Trash (reversible). macOS 15+ has /usr/bin/trash; older systems use the Trash folder directly.
to_trash() { if command -v trash >/dev/null; then trash "$1"; else mv "$1" "$HOME/.Trash/"; fi; }
[[ -e "$PLIST" ]] && to_trash "$PLIST"
[[ -e "$APP" ]] && to_trash "$APP"
# Saved widget positions and the prompt folder choice.
defaults delete "$LABEL" 2>/dev/null || true
echo "✓ Claude Widgets removed (app and login item are in the Trash)."
echo "  The usage-grid mod keeps writing ~/.claude/usage-grid/limits.json; that's harmless."
