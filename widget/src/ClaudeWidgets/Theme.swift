import AppKit
import SwiftUI
import WidgetCore

/// The usage-grid dashboard's palette (iOS system colors), light and dark.
enum Theme {
    static let heroGradient = LinearGradient(
        stops: [
            .init(color: Color(hex: 0x0A84FF), location: 0),
            .init(color: Color(hex: 0x3D6FF0), location: 0.55),
            .init(color: Color(hex: 0x5E5CE6), location: 1),
        ],
        startPoint: .topLeading, endPoint: .bottomTrailing)

    static let accent = Color(light: 0x007AFF, dark: 0x0A84FF)
    static let red = Color(hex: 0xFF3B30)
    static let orange = Color(hex: 0xFF9500)
    static let green = Color(hex: 0x34C759)
    static let t1 = Color(light: 0x1C1C1E, dark: 0xF2F2F7)
    static let t2 = Color(light: 0x8A8A8E, dark: 0x98989F)
    static let track = Color(light: 0xE5E5EA, dark: 0x2C2C2E)
    static let separator = Color(light: 0xE5E5EA, dark: 0x2C2C2E)
    static let field = Color(light: 0xF2F2F7, dark: 0x2C2C2E)
    /// Card tint over the blurred wallpaper (dashboard: white .78 / #1c1c1e .72).
    static let cardTint = Color(light: 0xFFFFFF, dark: 0x1C1C1E, lightAlpha: 0.72, darkAlpha: 0.66)

    static let snapshotCard = Color(light: 0xE9EEF5, dark: 0x262A30)

    static let cardRadius: CGFloat = 24
    /// Space around each card inside its window, so the shadow isn't clipped.
    static let inset: CGFloat = 10

    static func color(for s: Severity) -> Color {
        switch s {
        case .critical: return red
        case .warning: return orange
        case .normal: return accent
        }
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: alpha)
    }

    /// A color that follows the system's light or dark appearance.
    init(light: UInt32, dark: UInt32, lightAlpha: Double = 1, darkAlpha: Double = 1) {
        self.init(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            let hex = isDark ? dark : light
            return NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: isDark ? darkAlpha : lightAlpha)
        })
    }
}

/// Blurs whatever is behind the window (the wallpaper), like a real widget.
struct BehindWindowBlur: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let v = NSVisualEffectView()
        v.blendingMode = .behindWindow
        v.material = .popover
        v.state = .active
        v.wantsLayer = true
        v.layer?.cornerRadius = Theme.cardRadius
        v.layer?.cornerCurve = .continuous
        v.layer?.masksToBounds = true
        return v
    }
    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {}
}

/// The frosted card every widget sits on.
struct CardBackground: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                ZStack {
                    // Offscreen snapshots can't draw AppKit views, so they use a plain fill instead of the blur.
                    if Snapshot.active {
                        RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous).fill(Theme.snapshotCard)
                    } else {
                        BehindWindowBlur()
                    }
                    RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous).fill(Theme.cardTint)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous).strokeBorder(Color.primary.opacity(0.06), lineWidth: 0.5))
            .shadow(color: .black.opacity(0.18), radius: 6, y: 2)
    }
}

extension View {
    func widgetCard() -> some View { modifier(CardBackground()) }
}
