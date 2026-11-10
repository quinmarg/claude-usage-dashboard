import AppKit
import SwiftUI
import WidgetCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    static weak var shared: AppDelegate?
    let store = Store()
    private var panels: [DesktopPanel] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        AppDelegate.shared = self
        store.start()
        let home = DesktopPanel(key: "home", size: HomeWidget.size, defaultOrigin: Self.defaultOrigin()) { [store] h in
            HomeWidget(store: store, handle: h)
        }
        panels = [home]
        panels.forEach { $0.orderFrontRegardless() }

        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.panels.forEach { $0.keepOnScreen() } }
        }
    }

    /// Top-right of the main screen.
    static func defaultOrigin() -> CGPoint {
        let f = NSScreen.main?.visibleFrame ?? CGRect(x: 0, y: 0, width: 1440, height: 900)
        let margin: CGFloat = 14
        return CGPoint(x: f.maxX - HomeWidget.size.width - margin, y: max(f.minY, f.maxY - HomeWidget.size.height - margin))
    }

    func resetPositions() {
        panels.forEach { $0.setFrameOrigin(Self.defaultOrigin()) }
    }
}

/// Right-click menu on every widget.
struct WidgetMenu: ViewModifier {
    let store: Store
    func body(content: Content) -> some View {
        content.contextMenu {
            Button("Refresh now") {
                store.tick()
                store.rescan(force: true)
            }
            Button("Open Claude Code") { NSWorkspace.shared.open(openClaudeURL) }
            Divider()
            if WidgetLock.isLocked {
                Button("Unlock to move") { WidgetLock.isLocked = false }
            } else {
                Button("Lock in place") { WidgetLock.isLocked = true }
                Button("Reset widget position") { AppDelegate.shared?.resetPositions() }
            }
            Button("Quit Claude Widgets") { NSApp.terminate(nil) }
        }
    }
}

extension View {
    func widgetMenu(store: Store) -> some View { modifier(WidgetMenu(store: store)) }
}
