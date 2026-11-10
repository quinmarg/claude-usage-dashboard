import AppKit
import SwiftUI

/// A borderless, see-through window that lives on the desktop layer: above the wallpaper and desktop icons,
/// below every app window, on every Space, and out of Cmd-Tab and Mission Control. Like a real widget.
final class DesktopPanel: NSPanel {
    let key: String

    init<Content: View>(key: String, size: CGSize, defaultOrigin: CGPoint, @ViewBuilder content: (PanelHandle) -> Content) {
        self.key = key
        super.init(contentRect: CGRect(origin: defaultOrigin, size: size), styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow)) + 1)
        collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle, .fullScreenNone]
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false  // the card draws its own soft shadow
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        becomesKeyOnlyIfNeeded = true  // only the prompt's text field takes the keyboard
        animationBehavior = .none

        let handle = PanelHandle()
        let host = NSHostingView(rootView: content(handle))
        host.sizingOptions = []
        host.frame = CGRect(origin: .zero, size: size)
        contentView = host
        handle.panel = self

        let name = "ClaudeWidgets.\(key)"
        if !setFrameUsingName(name) { setFrameOrigin(defaultOrigin) }
        setContentSize(size)
        setFrameAutosaveName(name)
        keepOnScreen()
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    /// After a display change, pull the widget back if it ended up off every screen.
    func keepOnScreen() {
        let visible = NSScreen.screens.contains { $0.visibleFrame.intersects(frame.insetBy(dx: 40, dy: 40)) }
        if !visible, let main = NSScreen.main {
            setFrameOrigin(CGPoint(x: main.visibleFrame.maxX - frame.width - 20, y: main.visibleFrame.maxY - frame.height - 20))
        }
    }
}

/// Lets a SwiftUI view reach its panel: to start a drag, or give the keyboard back.
@MainActor
final class PanelHandle {
    weak var panel: DesktopPanel?

    /// Moves the widget with the mouse (call from a drag gesture). Runs until the mouse is released.
    func beginDrag() {
        guard let panel, let event = NSApp.currentEvent, event.type == .leftMouseDragged || event.type == .leftMouseDown else { return }
        panel.performDrag(with: event)
    }

    func focus() {
        NSApp.activate(ignoringOtherApps: true)
        panel?.makeKey()
    }

    func resignFocus() {
        panel?.makeFirstResponder(nil)
    }
}

/// Drag anywhere on a card (except controls) to move the widget.
struct DragToMove: ViewModifier {
    let handle: PanelHandle
    @StateObject private var flag = DragFlag()
    func body(content: Content) -> some View {
        content.gesture(
            DragGesture(minimumDistance: 2, coordinateSpace: .global)
                .onChanged { _ in
                    guard !flag.on else { return }
                    flag.on = true
                    handle.beginDrag()
                    flag.on = false
                }
        )
    }
}

extension View {
    func dragToMove(_ handle: PanelHandle) -> some View { modifier(DragToMove(handle: handle)) }
}

final class DragFlag: ObservableObject {
    var on = false
}
