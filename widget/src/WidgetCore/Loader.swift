import Foundation

/// Where usage-grid keeps its shared files.
public struct DataPaths: Sendable {
    public var root: URL
    public init(root: URL = URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent(".claude/usage-grid")) {
        self.root = root
    }
    public var stats: URL { root.appendingPathComponent("stats.json") }
    public var limits: URL { root.appendingPathComponent("limits.json") }
    public var work: URL { root.appendingPathComponent("work") }
    /// usage-grid's scanner, which refreshes stats.json: the installed copy in Claude Code's plugin cache.
    public static var statsScript: URL? { findStatsScript(home: URL(fileURLWithPath: NSHomeDirectory())) }
}

/// Finds usage-grid's stats.py wherever Claude Code installed the mod:
/// `~/.claude/plugins/cache/<marketplace>/usage-grid/<version>/hooks/stats.py`, any marketplace name.
/// The most recently installed version wins. Nil when the mod isn't installed.
public func findStatsScript(home: URL) -> URL? {
    let fm = FileManager.default
    let cache = home.appendingPathComponent(".claude/plugins/cache")
    var best: (url: URL, date: Date)?
    for market in (try? fm.contentsOfDirectory(atPath: cache.path)) ?? [] {
        let mod = cache.appendingPathComponent(market).appendingPathComponent("usage-grid")
        for version in (try? fm.contentsOfDirectory(atPath: mod.path)) ?? [] {
            let script = mod.appendingPathComponent(version).appendingPathComponent("hooks/stats.py")
            guard fm.fileExists(atPath: script.path) else { continue }
            let date = modDate(mod.appendingPathComponent(version)) ?? .distantPast
            if best == nil || date > best!.date { best = (script, date) }
        }
    }
    return best?.url
}

/// A heartbeat older than this means the chat is closed (same rule as usage-grid).
public let freshWindowMs: Double = 90_000

public func loadStats(_ url: URL) -> Stats? {
    guard let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(Stats.self, from: data)
}

public func loadLimits(_ url: URL) -> LimitsFile? {
    guard let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(LimitsFile.self, from: data)
}

/// Every open chat: work files whose heartbeat is within 90 s. Files mid-write or malformed are skipped.
public func loadChats(_ dir: URL, now: Date = Date()) -> [ChatWork] {
    let fm = FileManager.default
    guard let names = try? fm.contentsOfDirectory(atPath: dir.path) else { return [] }
    let nowMs = now.timeIntervalSince1970 * 1000
    var out: [ChatWork] = []
    for name in names where name.hasSuffix(".json") {
        let url = dir.appendingPathComponent(name)
        if let attrs = try? fm.attributesOfItem(atPath: url.path), let m = attrs[.modificationDate] as? Date,
           now.timeIntervalSince(m) * 1000 > freshWindowMs { continue }
        guard let data = try? Data(contentsOf: url), let c = try? JSONDecoder().decode(ChatWork.self, from: data) else { continue }
        if nowMs - c.updatedAt > freshWindowMs { continue }
        out.append(c)
    }
    return out.sorted { $0.sessionId < $1.sessionId }
}

/// Modification time, to reload stats.json only when it changed.
public func modDate(_ url: URL) -> Date? {
    (try? FileManager.default.attributesOfItem(atPath: url.path))?[.modificationDate] as? Date
}
