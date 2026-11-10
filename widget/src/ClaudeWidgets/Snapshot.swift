import AppKit
import SwiftUI

/// Renders the widgets with the live data into PNGs, so the look can be checked without touching the screen.
/// (The wallpaper blur isn't drawn offscreen; the cards show their tint on a sample wallpaper color instead.)
@MainActor
enum Snapshot {
    static var active = false

    static func run(to dir: URL) {
        active = true
        _ = NSApplication.shared
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let store = Store()
        store.tick()
        let handle = PanelHandle()
        for (name, appearance) in [("light", NSAppearance(named: .aqua)!), ("dark", NSAppearance(named: .darkAqua)!)] {
            NSApp.appearance = appearance
            let scheme: ColorScheme = name == "dark" ? .dark : .light
            let wall = name == "dark" ? Color(hex: 0x1B2735) : Color(hex: 0xA9C4E8)
            render(HomeWidget(store: store, handle: handle), size: HomeWidget.size, wall: wall, scheme: scheme, to: dir.appendingPathComponent("home-\(name).png"))
        }
        print("Wrote snapshots to \(dir.path)")
    }

    private static func render<V: View>(_ view: V, size: CGSize, wall: Color, scheme: ColorScheme, to url: URL) {
        let content = view.background(wall).environment(\.colorScheme, scheme)
        let r = ImageRenderer(content: content.frame(width: size.width, height: size.height))
        r.scale = 2
        guard let cg = r.cgImage else { return }
        let rep = NSBitmapImageRep(cgImage: cg)
        try? rep.representation(using: .png, properties: [:])?.write(to: url)
    }
}
