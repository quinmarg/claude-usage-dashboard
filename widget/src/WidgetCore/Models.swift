import Foundation

/// One local day of token use, as written by usage-grid's stats.py.
public struct DayStat: Codable, Equatable, Sendable {
    public var `in`: Int
    public var out: Int
    public var cr: Int
    public var cw: Int
    public var sessions: Int
    /// Fable tokens that day: all (incl. cache) and output. Missing in stats.json from before usage-grid 0.10.
    public var fa: Int?
    public var fo: Int?

    public init(in i: Int, out: Int, cr: Int, cw: Int, sessions: Int, fa: Int? = nil, fo: Int? = nil) {
        self.in = i; self.out = out; self.cr = cr; self.cw = cw; self.sessions = sessions; self.fa = fa; self.fo = fo
    }

    /// Input + output + cache read + cache write.
    public var total: Int { self.in + out + cr + cw }
}

/// A recent project folder (newest first in stats.json).
public struct Env: Codable, Equatable, Sendable {
    public var path: String
    public var last: String?
}

/// ~/.claude/usage-grid/stats.json
public struct Stats: Codable, Equatable, Sendable {
    public var today: String
    public var days: [String: DayStat]
    public var envs: [Env]?

    public init(today: String, days: [String: DayStat], envs: [Env]? = nil) {
        self.today = today; self.days = days; self.envs = envs
    }
}

/// One plan limit. `resetsAt` arrives as an ISO string or as clock ms; both are accepted.
public struct Limit: Codable, Equatable, Sendable {
    public var kind: String
    public var percentUsed: Double
    public var resetsAt: Date?

    public init(kind: String, percentUsed: Double, resetsAt: Date?) {
        self.kind = kind; self.percentUsed = percentUsed; self.resetsAt = resetsAt
    }

    enum CodingKeys: String, CodingKey { case kind, percentUsed, resetsAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        kind = try c.decode(String.self, forKey: .kind)
        percentUsed = (try? c.decode(Double.self, forKey: .percentUsed)) ?? 0
        if let s = try? c.decode(String.self, forKey: .resetsAt) {
            resetsAt = parseISODate(s)
        } else if let ms = try? c.decode(Double.self, forKey: .resetsAt) {
            // Seconds or milliseconds since 1970.
            resetsAt = Date(timeIntervalSince1970: ms > 1e11 ? ms / 1000 : ms)
        } else {
            resetsAt = nil
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kind, forKey: .kind)
        try c.encode(percentUsed, forKey: .percentUsed)
        if let r = resetsAt { try c.encode(r.timeIntervalSince1970 * 1000, forKey: .resetsAt) }
    }
}

/// ~/.claude/usage-grid/limits.json (written by usage-grid 0.8.2+).
public struct LimitsFile: Codable, Equatable, Sendable {
    public var limits: [Limit]
    public var sessionId: String?
    public var updatedAt: Double

    public init(limits: [Limit], sessionId: String?, updatedAt: Double) {
        self.limits = limits; self.sessionId = sessionId; self.updatedAt = updatedAt
    }
}

/// A subagent's work, as usage-grid records it.
public struct WorkRow: Codable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var type: String
    public var model: String
    public var status: String
    public var startedAt: Double
    public var endedAt: Double?
    public var tools: Int
    public var lastTool: String

    enum CodingKeys: String, CodingKey { case id, name, type, model, status, startedAt, endedAt, tools, lastTool }

    public init(id: String, name: String, type: String, model: String, status: String, startedAt: Double, endedAt: Double?, tools: Int, lastTool: String) {
        self.id = id; self.name = name; self.type = type; self.model = model; self.status = status
        self.startedAt = startedAt; self.endedAt = endedAt; self.tools = tools; self.lastTool = lastTool
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decode(String.self, forKey: .id)) ?? UUID().uuidString
        name = (try? c.decode(String.self, forKey: .name)) ?? "Agent"
        type = (try? c.decode(String.self, forKey: .type)) ?? ""
        model = (try? c.decode(String.self, forKey: .model)) ?? ""
        status = (try? c.decode(String.self, forKey: .status)) ?? ""
        startedAt = (try? c.decode(Double.self, forKey: .startedAt)) ?? 0
        endedAt = try? c.decode(Double.self, forKey: .endedAt)
        tools = (try? c.decode(Int.self, forKey: .tools)) ?? 0
        lastTool = (try? c.decode(String.self, forKey: .lastTool)) ?? ""
    }
}

public struct MainWork: Codable, Equatable, Sendable {
    public var busy: Bool
    public var since: Double
    public var tools: Int
    public var lastTool: String

    public init(busy: Bool, since: Double, tools: Int, lastTool: String) {
        self.busy = busy; self.since = since; self.tools = tools; self.lastTool = lastTool
    }
}

/// A chat's context window use (usage-grid 0.8.2+).
public struct ChatContext: Codable, Equatable, Sendable {
    public var percent: Double?
    public var tokens: Double?
    public var window: Double?

    public init(percent: Double?, tokens: Double?, window: Double?) {
        self.percent = percent; self.tokens = tokens; self.window = window
    }
}

/// ~/.claude/usage-grid/work/<sessionId>.json, one per open chat.
public struct ChatWork: Codable, Equatable, Sendable {
    public var sessionId: String
    public var title: String?
    public var cwd: String
    public var main: MainWork
    public var agents: [WorkRow]
    public var ctx: ChatContext?
    public var updatedAt: Double

    public init(sessionId: String, title: String?, cwd: String, main: MainWork, agents: [WorkRow], ctx: ChatContext?, updatedAt: Double) {
        self.sessionId = sessionId; self.title = title; self.cwd = cwd; self.main = main
        self.agents = agents; self.ctx = ctx; self.updatedAt = updatedAt
    }
}

/// Parses "2026-11-10T19:27:28.500Z" or "2026-11-10T19:27:28Z".
public func parseISODate(_ s: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: s) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: s)
}
