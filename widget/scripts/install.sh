#!/bin/zsh
# Builds Claude Widgets, installs it to ~/Applications and starts it now and at every login.
# Safe to run again: it rebuilds and restarts. --app-only installs and starts it without the login item.
set -euo pipefail
cd "${0:A:h}/.."

APP="$HOME/Applications/Claude Widgets.app"
LABEL="com.claude-widgets"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
VERSION="$(cat VERSION)"

echo "▸ Building (release)…"
swift build -c release --product ClaudeWidgets
BIN="$(swift build -c release --show-bin-path)/ClaudeWidgets"

echo "▸ Stopping the running copy (if any)…"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
pkill -x ClaudeWidgets 2>/dev/null || true

echo "▸ Installing to $APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/ClaudeWidgets"
cat > "$APP/Contents/Info.plist" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.claude-widgets</string>
  <key>CFBundleName</key><string>Claude Widgets</string>
  <key>CFBundleDisplayName</key><string>Claude Widgets</string>
  <key>CFBundleExecutable</key><string>ClaudeWidgets</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLISTEOF
codesign --force --sign - "$APP" >/dev/null 2>&1

if [[ "${1:-}" == "--app-only" ]]; then
  # Install and start the app without the login item.
  open "$APP"
  sleep 2
  pgrep -x ClaudeWidgets >/dev/null && echo "✓ Claude Widgets $VERSION is running (no login item: run without --app-only to add it)." || { echo "✗ It didn't start"; exit 1; }
  exit 0
fi

echo "▸ Start at login: $PLIST"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$APP/Contents/MacOS/ClaudeWidgets</string></array>
  <key>RunAtLoad</key><true/>
  <!-- Restart after a crash, but stay off after "Quit Claude Widgets" until the next login. -->
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ProcessType</key><string>Interactive</string>
</dict></plist>
PLISTEOF
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 1
if pgrep -x ClaudeWidgets >/dev/null; then echo "✓ Claude Widgets $VERSION is running. Look at your desktop."; else echo "✗ It didn't start: see Console.app or run: \"$APP/Contents/MacOS/ClaudeWidgets\""; exit 1; fi
