import Foundation
import WidgetCore

/// Reads usage-grid's shared files every few seconds and publishes only what changed.
@MainActor
final class Store: ObservableObject {
    @Published private(set) var stats: Stats?
    @Published private(set) var limits: LimitsFile?
    @Published private(set) var chats: [ChatWork] = []
    @Published private(set) var now = Date()

    let paths: DataPaths
    private var statsMod: Date?
    private var timer: Timer?
    private var scanning = false
    private var lastScanTry = Date.distantPast

    /// Seconds between reads (work files beat every 10 s; 3 s keeps the widgets feeling live).
    static let interval: TimeInterval = 3
    /// Rescan the logs ourselves when stats.json is older than this (no chat open to do it).
    static let statsMaxAge: TimeInterval = 15 * 60

    init(paths: DataPaths = DataPaths()) {
        self.paths = paths
    }

    func start() {
        tick()
        let t = Timer(timeInterval: Self.interval, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func tick() {
        let n = Date()
        now = n
        let c = loadChats(paths.work, now: n)
        if c != chats { chats = c }
        let l = loadLimits(paths.limits)
        if l != limits { limits = l }
        let m = modDate(paths.stats)
        if m != statsMod {
            statsMod = m
            if let s = loadStats(paths.stats), s != stats { stats = s }
        }
        if let m, n.timeIntervalSince(m) > Self.statsMaxAge { rescan() }
        if m == nil { rescan() }
    }

    /// Runs usage-grid's stats.py (about 4 s) in the background; it rewrites stats.json, which the next tick picks up.
    func rescan(force: Bool = false) {
        let n = Date()
        guard !scanning, force || n.timeIntervalSince(lastScanTry) > Self.statsMaxAge else { return }
        guard let script = DataPaths.statsScript else { return }
        scanning = true
        lastScanTry = n
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        p.arguments = ["-I", script.path]
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice
        p.terminationHandler = { [weak self] _ in
            Task { @MainActor in
                self?.scanning = false
                self?.tick()
            }
        }
        do { try p.run() } catch { scanning = false }
    }

    // MARK: Derived values for the views

    var summary: UsageSummary? {
        guard let stats, !stats.days.isEmpty else { return nil }
        return summarize(stats, today: localDayKey(now))
    }

    var ringValues: [RingValue] { rings(limits: limits, chats: chats, now: now, summary: summary) }

    var agents: AgentsSnapshot { agentsSnapshot(chats) }

    /// Recent project folders for the prompt box's folder menu.
    var recentFolders: [String] {
        var seen = Set<String>()
        return (stats?.envs ?? []).map(\.path).filter { seen.insert($0).inserted }.prefix(8).map { $0 }
    }
}
