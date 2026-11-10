import Foundation

/// Statuses that count as still running (same set as usage-grid).
public let activeStatuses: Set<String> = ["pending", "running", "waiting"]

public struct AgentLine: Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    /// "Explore · sonnet-5-5"
    public var detail: String
    public var tools: Int
    public var lastTool: String
    public var startedAt: Double
    /// Waiting on the user or queued (shown orange).
    public var waiting: Bool
}

public struct ChatRow: Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var folder: String
    public var busy: Bool
    public var since: Double
    public var tools: Int
    public var lastTool: String
    public var agents: [AgentLine]
}

public struct AgentsSnapshot: Equatable, Sendable {
    /// Chats doing something (busy, or with a running subagent), busiest first.
    public var working: [ChatRow]
    /// Open chats that are idle.
    public var idle: [ChatRow]
    /// Busy chats + running subagents.
    public var runningCount: Int
    public var agentCount: Int
}

/// "Documents/claude-widgets" → "claude-widgets"; the home folder → "Home".
public func folderName(_ cwd: String, home: String = NSHomeDirectory()) -> String {
    let trimmed = cwd.hasSuffix("/") ? String(cwd.dropLast()) : cwd
    if trimmed.isEmpty { return "Chat" }
    if trimmed == home { return "Home" }
    return (trimmed as NSString).lastPathComponent
}

/// A chat's display name: its title, else its folder.
public func chatName(_ c: ChatWork, home: String = NSHomeDirectory()) -> String {
    if let t = c.title?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { return t }
    return folderName(c.cwd, home: home)
}

private func shortModel(_ m: String) -> String {
    m.hasPrefix("claude-") ? String(m.dropFirst(7)) : m
}

public func agentsSnapshot(_ chats: [ChatWork], home: String = NSHomeDirectory()) -> AgentsSnapshot {
    var working: [ChatRow] = [], idle: [ChatRow] = []
    var agentCount = 0, busyCount = 0
    for c in chats {
        let active = c.agents
            .filter { activeStatuses.contains($0.status) }
            .sorted { $0.startedAt < $1.startedAt }
            .map { a in
                AgentLine(
                    id: a.id, name: a.name,
                    detail: [a.type, shortModel(a.model)].filter { !$0.isEmpty }.joined(separator: " · "),
                    tools: a.tools, lastTool: a.lastTool, startedAt: a.startedAt,
                    waiting: a.status == "waiting" || a.status == "pending")
            }
        agentCount += active.count
        if c.main.busy { busyCount += 1 }
        let row = ChatRow(
            id: c.sessionId, name: chatName(c, home: home), folder: folderName(c.cwd, home: home),
            busy: c.main.busy, since: c.main.since, tools: c.main.tools, lastTool: c.main.lastTool, agents: active)
        if c.main.busy || !active.isEmpty { working.append(row) } else { idle.append(row) }
    }
    // Busy chats first, then by the longest-running; idle chats by most recent work.
    working.sort { a, b in a.busy != b.busy ? a.busy : a.since < b.since }
    idle.sort { $0.since > $1.since }
    return AgentsSnapshot(working: working, idle: idle, runningCount: busyCount + agentCount, agentCount: agentCount)
}
