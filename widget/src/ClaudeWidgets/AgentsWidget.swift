import SwiftUI
import WidgetCore

/// The compact "Working now" card inside the home widget: one line per busy chat or running subagent.
struct AgentsCard: View {
    @ObservedObject var store: Store

    static let height: CGFloat = 122
    /// Lines that fit under the header.
    private let maxLines = 3

    var body: some View {
        let snap = store.agents
        let nowMs = store.now.timeIntervalSince1970 * 1000
        VStack(alignment: .leading, spacing: 8) {
            header(snap)
            if snap.working.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "moon.zzz.fill")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.accent.opacity(0.8))
                    Text(store.chats.isEmpty ? "Nothing running · no Claude chats open" : "Nothing running · every chat is idle")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.t2)
                        .lineLimit(1)
                }
                .padding(.top, 4)
            } else {
                let (shown, hidden) = fit(snap.working)
                ForEach(shown) { item in
                    switch item.kind {
                    case .chat(let c): ChatLine(chat: c, nowMs: nowMs)
                    case .agent(let a): SubagentLine(agent: a, nowMs: nowMs)
                    }
                }
                if hidden > 0 {
                    Text("+\(hidden) more running")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.t2)
                        .padding(.leading, 16)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetCard()
    }

    private func header(_ snap: AgentsSnapshot) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("Working now")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Theme.t1)
            if snap.runningCount > 0 {
                Text("\(snap.runningCount) running")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.accent)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Theme.accent.opacity(0.12)))
            }
            Spacer()
            Text(store.chats.count == 1 ? "1 chat open" : "\(store.chats.count) chats open")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(Theme.t2)
        }
    }

    private struct Item: Identifiable {
        enum Kind { case chat(ChatRow), agent(AgentLine) }
        let id: String
        let kind: Kind
    }

    /// Flattens chats and their subagents into lines, keeping as many as fit (the last slot becomes "+N more").
    private func fit(_ chats: [ChatRow]) -> ([Item], Int) {
        var all: [Item] = []
        for c in chats {
            all.append(Item(id: "c-\(c.id)", kind: .chat(c)))
            all += c.agents.map { Item(id: "a-\(c.id)-\($0.id)", kind: .agent($0)) }
        }
        if all.count <= maxLines { return (all, 0) }
        return (Array(all.prefix(maxLines - 1)), all.count - (maxLines - 1))
    }
}

/// A pulsing status dot.
struct StatusDot: View {
    let color: Color
    var pulse = true
    var size: CGFloat = 8

    var body: some View {
        if pulse {
            dot.phaseAnimator([1.0, 0.35]) { v, o in v.opacity(o) } animation: { _ in .easeInOut(duration: 0.8) }
        } else {
            dot
        }
    }

    private var dot: some View {
        Circle().fill(color).frame(width: size, height: size)
    }
}

/// One line: dot, chat name, tools · current tool, run time.
struct ChatLine: View {
    let chat: ChatRow
    let nowMs: Double

    var body: some View {
        HStack(spacing: 8) {
            StatusDot(color: chat.busy ? Theme.green : Theme.t2, pulse: chat.busy)
            Text(chat.name)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.t1)
                .lineLimit(1)
                .truncationMode(.tail)
                .layoutPriority(1)
            Text(detail)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Theme.t2)
                .lineLimit(1)
            Spacer(minLength: 4)
            if chat.busy {
                Text(agoText(ms: nowMs - chat.since))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Theme.t2)
                    .monospacedDigit()
                    .fixedSize()
            }
        }
    }

    private var detail: String {
        guard chat.busy else { return "· subagents" }
        let tools = "\(chat.tools) tool\(chat.tools == 1 ? "" : "s")"
        return chat.lastTool.isEmpty ? "· \(tools)" : "· \(tools) · \(chat.lastTool)"
    }
}

/// One indented line per running subagent: name, type · tools, run time.
struct SubagentLine: View {
    let agent: AgentLine
    let nowMs: Double

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "arrow.turn.down.right")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(Theme.t2.opacity(0.7))
            StatusDot(color: agent.waiting ? Theme.orange : Theme.accent, size: 6)
            Text(agent.name)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(Theme.t1)
                .lineLimit(1)
                .truncationMode(.tail)
                .layoutPriority(1)
            Text(detail)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(Theme.t2)
                .lineLimit(1)
            Spacer(minLength: 4)
            if agent.startedAt > 0 {
                Text(agoText(ms: nowMs - agent.startedAt))
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Theme.t2)
                    .monospacedDigit()
                    .fixedSize()
            }
        }
        .padding(.leading, 6)
    }

    private var detail: String {
        var parts: [String] = []
        if let type = agent.detail.split(separator: "·").first.map({ $0.trimmingCharacters(in: .whitespaces) }), !type.isEmpty { parts.append(type) }
        if agent.waiting { parts.append("waiting") }
        parts.append("\(agent.tools) tool\(agent.tools == 1 ? "" : "s")")
        return "· " + parts.joined(separator: " · ")
    }
}
