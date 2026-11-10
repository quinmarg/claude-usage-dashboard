import Foundation

// MARK: - Formatting (matches usage-grid's register.tsx so both read the same)

/// 2.20B, 6.5M, 405K, 12.
public func fmt(_ n: Double) -> String {
    if n >= 1e9 { return String(format: "%.2fB", n / 1e9) }
    if n >= 1e6 { return String(format: "%.1fM", n / 1e6) }
    if n >= 1e3 { return "\(Int((n / 1e3).rounded()))K" }
    return String(Int(n))
}
public func fmt(_ n: Int) -> String { fmt(Double(n)) }

private let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

private func utcCalendar() -> Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "UTC")!
    return c
}

/// Day keys are local calendar days "YYYY-MM-DD"; date math is done at noon UTC so DST never shifts a day.
func toDate(_ iso: String) -> Date? {
    let p = iso.split(separator: "-").compactMap { Int($0) }
    guard p.count == 3 else { return nil }
    var c = DateComponents()
    c.year = p[0]; c.month = p[1]; c.day = p[2]; c.hour = 12
    return utcCalendar().date(from: c)
}

public func addDays(_ iso: String, _ n: Int) -> String {
    let cal = utcCalendar()
    guard let d = toDate(iso), let e = cal.date(byAdding: .day, value: n, to: d) else { return iso }
    let c = cal.dateComponents([.year, .month, .day], from: e)
    return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
}

/// "2026-10-19" → "Oct 19".
public func shortDay(_ iso: String) -> String {
    guard let d = toDate(iso) else { return iso }
    let c = utcCalendar().dateComponents([.month, .day], from: d)
    return "\(months[c.month! - 1]) \(c.day!)"
}

/// Today's key in the Mac's local time zone.
public func localDayKey(_ date: Date = Date()) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
}

/// "3h", "1d 18h", "25m" until a time; "now" when it has passed. Coarse like the dashboard.
public func untilText(_ date: Date?, now: Date) -> String {
    guard let date else { return "" }
    let mins = Int((date.timeIntervalSince(now) / 60).rounded())
    if mins <= 0 { return "now" }
    let d = mins / 1440, h = (mins % 1440) / 60
    if d > 0 { return "\(d)d \(h)h" }
    if h > 0 { return "\(h)h" }
    return "\(max(5, Int((Double(mins) / 5).rounded(.up)) * 5))m"
}

/// "now", "12m", "1h 5m" for a running time.
public func agoText(ms: Double) -> String {
    let m = max(0, Int((ms / 60000).rounded()))
    if m < 1 { return "now" }
    if m < 60 { return "\(m)m" }
    return "\(m / 60)h \(m % 60)m"
}

// MARK: - Usage summary (the hero card)

public struct UsageSummary: Equatable, Sendable {
    public var totalTokens: Int
    public var output: Int
    public var sessions: Int
    public var activeDays: Int
    public var streak: Int
    public var firstDay: String?
    /// All tokens per day for the 30 days ending today, oldest first.
    public var series30: [Int]
}

/// The same numbers as the dashboard's summarize(): sums across every day in stats.json.
/// `today` is normally the Mac's local day, so the streak and sparkline stay right after midnight even if stats.json is old.
public func summarize(_ s: Stats, today: String? = nil) -> UsageSummary {
    let keys = s.days.keys.sorted()
    var total = 0, out = 0, sessions = 0
    for k in keys {
        let d = s.days[k]!
        total += d.total; out += d.out; sessions += d.sessions
    }
    let day = max(today ?? s.today, s.today)
    // Today may not have started yet: count back from today, or from yesterday.
    var cursor = s.days[day] != nil ? day : addDays(day, -1)
    var streak = 0
    while s.days[cursor] != nil {
        streak += 1
        cursor = addDays(cursor, -1)
    }
    let series = (0..<30).map { i in s.days[addDays(day, i - 29)]?.total ?? 0 }
    return UsageSummary(totalTokens: total, output: out, sessions: sessions, activeDays: keys.count, streak: streak, firstDay: keys.first, series30: series)
}

// MARK: - Rings

public enum Severity: Equatable, Sendable { case normal, warning, critical }

/// Red at 90% and over, orange at 70% and over, the accent blue below.
public func severity(_ pct: Double?) -> Severity {
    guard let pct else { return .normal }
    return pct >= 90 ? .critical : pct >= 70 ? .warning : .normal
}

public struct RingValue: Equatable, Sendable {
    public var label: String
    public var percent: Double?
    public var sub: String
}

/// A limit whose reset time has passed is back to 0%.
public func currentPercent(_ l: Limit, now: Date) -> Double {
    if let r = l.resetsAt, r <= now { return 0 }
    return max(0, min(100, l.percentUsed))
}

/// The three rings: 5-hour, weekly, and the latest chat's context.
public func rings(limits: LimitsFile?, chats: [ChatWork], now: Date) -> [RingValue] {
    func ring(_ kind: String, _ label: String) -> RingValue {
        guard let l = limits?.limits.first(where: { $0.kind == kind }) else {
            return RingValue(label: label, percent: nil, sub: "after a reply")
        }
        let pct = currentPercent(l, now: now)
        let sub: String
        if let r = l.resetsAt { sub = r <= now ? "reset" : "resets \(untilText(r, now: now))" } else { sub = "limit" }
        return RingValue(label: label, percent: pct, sub: sub)
    }
    let ctxRing: RingValue
    if let ctx = latestChat(chats)?.ctx, let pct = ctx.percent {
        let tokens = ctx.tokens.map { "\(fmt($0)) tokens" } ?? "context"
        ctxRing = RingValue(label: "Latest chat", percent: pct, sub: tokens)
    } else {
        ctxRing = RingValue(label: "Latest chat", percent: nil, sub: chats.isEmpty ? "no chat open" : "context")
    }
    return [ring("five_hour", "5-hour"), ring("seven_day", "Weekly"), ctxRing]
}

/// The chat to show context for: among chats that report context, a busy one that started work most recently,
/// else the one that worked most recently.
public func latestChat(_ chats: [ChatWork]) -> ChatWork? {
    let withCtx = chats.filter { $0.ctx?.percent != nil }
    let pool = withCtx.isEmpty ? chats : withCtx
    let busy = pool.filter { $0.main.busy }
    return (busy.isEmpty ? pool : busy).max { $0.main.since < $1.main.since }
}
