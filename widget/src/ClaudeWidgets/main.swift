import AppKit

// `ClaudeWidgets --snapshot <dir>` renders each widget to PNG (light and dark) for checking the look, then exits.
let args = CommandLine.arguments
if let i = args.firstIndex(of: "--snapshot"), i + 1 < args.count {
    MainActor.assumeIsolated { Snapshot.run(to: URL(fileURLWithPath: args[i + 1])) }
    exit(0)
}

// One copy at a time: a second launch quits.
if let id = Bundle.main.bundleIdentifier,
   NSRunningApplication.runningApplications(withBundleIdentifier: id).count > 1 {
    exit(0)
}

MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.accessory)  // no Dock icon, no menu bar
    app.run()
}
