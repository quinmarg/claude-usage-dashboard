// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ClaudeWidgets",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "ClaudeWidgets", targets: ["ClaudeWidgets"]),
        .executable(name: "core-tests", targets: ["CoreTests"]),
    ],
    targets: [
        // Pure logic: models, formatting, summaries. No UI, fully tested.
        .target(name: "WidgetCore", path: "src/WidgetCore"),
        // The desktop app: AppKit panels hosting SwiftUI widgets.
        .executableTarget(name: "ClaudeWidgets", dependencies: ["WidgetCore"], path: "src/ClaudeWidgets"),
        // Test runner (swift test needs full Xcode; this runs with the Command Line Tools).
        .executableTarget(name: "CoreTests", dependencies: ["WidgetCore"], path: "tests/CoreTests"),
    ]
)
