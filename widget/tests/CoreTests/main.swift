import Foundation
import WidgetCore

// A tiny test runner: `swift run core-tests`. (swift test / XCTest need full Xcode, which this Mac doesn't have.)
var passed = 0, failed = 0
func test(_ name: String, _ body: () throws -> Void) {
    do { try body(); passed += 1; print("  ✓ \(name)") } catch { failed += 1; print("  ✗ \(name): \(error)") }
}
struct Fail: Error, CustomStringConvertible { let description: String }
func eq<T: Equatable>(_ a: T, _ b: T, _ msg: String = "", line: Int = #line) throws {
    if a != b { throw Fail(description: "line \(line): \(a) != \(b) \(msg)") }
}
func ok(_ c: Bool, _ msg: String = "", line: Int = #line) throws {
    if !c { throw Fail(description: "line \(line): \(msg)") }
}

let fixtures = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("fixtures")
let ms = { (d: Date) in d.timeIntervalSince1970 * 1000 }

print("Formatting")
test("fmt matches the dashboard") {
    try eq(fmt(2_200_000_000), "2.20B")
    try eq(fmt(6_500_000), "6.5M")
    try eq(fmt(405_000), "405K")
    try eq(fmt(999), "999")
    try eq(fmt(0), "0")
}
test("shortDay and addDays across a month and DST") {
    try eq(shortDay("2026-10-19"), "Oct 19")
    try eq(addDays("2026-10-31", 1), "2026-11-01")
    try eq(addDays("2026-11-01", 1), "2026-11-02")  // US DST ends Nov 1, 2026
    try eq(addDays("2026-03-01", -1), "2026-02-28")
}
test("untilText is coarse like the dashboard") {
    let now = Date(timeIntervalSince1970: 1_000_000)
    try eq(untilText(now.addingTimeInterval(3 * 3600), now: now), "3h")
    try eq(untilText(now.addingTimeInterval(42 * 3600), now: now), "1d 18h")
    try eq(untilText(now.addingTimeInterval(12 * 60), now: now), "15m")
    try eq(untilText(now.addingTimeInterval(-60), now: now), "now")
    try eq(untilText(nil, now: now), "")
}
test("agoText") {
    try eq(agoText(ms: 10_000), "now")
    try eq(agoText(ms: 12 * 60_000), "12m")
    try eq(agoText(ms: 65 * 60_000), "1h 5m")
}

print("Usage summary")
test("decodes the stats.json fixture") {
    let s = loadStats(fixtures.appendingPathComponent("stats.json"))
    try ok(s != nil, "fixture should decode")
    try eq(s!.days.count, 4)
}
test("totals, active days, first day") {
    let s = loadStats(fixtures.appendingPathComponent("stats.json"))!
    let u = summarize(s)
    // 10+20+30+40 + 1+2+3+4 ... see fixture: totals are in+out+cr+cw.
    try eq(u.totalTokens, 1110 + 2220 + 3330 + 4440)
    try eq(u.output, 100 + 200 + 300 + 400)
    try eq(u.sessions, 1 + 2 + 3 + 4)
    try eq(u.activeDays, 4)
    try eq(u.firstDay, "2026-10-19")
}
test("streak counts back from today, or from yesterday when today has no use yet") {
    let s = loadStats(fixtures.appendingPathComponent("stats.json"))!
    try eq(summarize(s).streak, 3)  // Nov 8, 9, 10
    try eq(summarize(s, today: "2026-11-11").streak, 3)  // after midnight, nothing yet today
    try eq(summarize(s, today: "2026-11-13").streak, 0)
}
test("30-day series ends today and is oldest first") {
    let s = loadStats(fixtures.appendingPathComponent("stats.json"))!
    let u = summarize(s)
    try eq(u.series30.count, 30)
    try eq(u.series30[29], 4440)
    try eq(u.series30[28], 3330)
    try eq(u.series30[0], 0)
    // Oct 19 is 22 days before Nov 10 → index 7.
    try eq(u.series30[7], 1110)
}
test("an older stats.json never moves today backwards") {
    let s = loadStats(fixtures.appendingPathComponent("stats.json"))!
    try eq(summarize(s, today: "2026-11-01").series30[29], 4440)
}

print("Rings")
let now = Date(timeIntervalSince1970: 1_794_338_958)
func chat(_ id: String, busy: Bool, since: Double, ctx: Double?, tokens: Double? = nil, agents: [WorkRow] = [], title: String? = nil, cwd: String = "/Users/me/proj") -> ChatWork {
    ChatWork(sessionId: id, title: title, cwd: cwd, main: MainWork(busy: busy, since: since, tools: 3, lastTool: "Read"), agents: agents,
             ctx: ctx.map { ChatContext(percent: $0, tokens: tokens, window: 1_000_000) }, updatedAt: ms(now))
}
test("severity thresholds") {
    try eq(severity(nil), .normal)
    try eq(severity(69.9), .normal)
    try eq(severity(70), .warning)
    try eq(severity(90), .critical)
}
test("rings read limits.json and the latest chat's context") {
    let lim = LimitsFile(limits: [
        Limit(kind: "five_hour", percentUsed: 20, resetsAt: now.addingTimeInterval(3 * 3600)),
        Limit(kind: "seven_day", percentUsed: 43, resetsAt: now.addingTimeInterval(42 * 3600)),
    ], sessionId: "a", updatedAt: ms(now))
    let chats = [chat("a", busy: false, since: 100, ctx: 10), chat("b", busy: true, since: 50, ctx: 41, tokens: 405_000)]
    let r = rings(limits: lim, chats: chats, now: now)
    try eq(r.map(\.label), ["5-hour", "Weekly", "Latest chat"])
    try eq(r[0].percent, 20); try eq(r[0].sub, "resets 3h")
    try eq(r[1].percent, 43); try eq(r[1].sub, "resets 1d 18h")
    try eq(r[2].percent, 41); try eq(r[2].sub, "405K tokens")
}
test("a limit past its reset time shows 0%") {
    let lim = LimitsFile(limits: [Limit(kind: "five_hour", percentUsed: 95, resetsAt: now.addingTimeInterval(-60))], sessionId: nil, updatedAt: 0)
    let r = rings(limits: lim, chats: [], now: now)
    try eq(r[0].percent, 0); try eq(r[0].sub, "reset")
    try eq(r[1].percent, nil); try eq(r[1].sub, "after a reply")
    try eq(r[2].sub, "no chat open")
}
test("latestChat prefers a busy chat, then the most recent work") {
    try eq(latestChat([chat("a", busy: false, since: 900, ctx: 5), chat("b", busy: true, since: 100, ctx: 7)])?.sessionId, "b")
    try eq(latestChat([chat("a", busy: false, since: 900, ctx: 5), chat("b", busy: false, since: 100, ctx: 7)])?.sessionId, "a")
    try eq(latestChat([chat("a", busy: true, since: 900, ctx: nil), chat("b", busy: false, since: 100, ctx: 7)])?.sessionId, "b", "only chats with context count")
}
test("limits.json decodes ISO strings and ms") {
    let json = #"{"limits":[{"kind":"five_hour","percentUsed":20.5,"resetsAt":"2026-11-10T22:00:00.000Z"},{"kind":"seven_day","percentUsed":43,"resetsAt":1794500000000},{"kind":"x","percentUsed":1,"resetsAt":null}],"sessionId":"s","updatedAt":1}"#
    let f = try JSONDecoder().decode(LimitsFile.self, from: Data(json.utf8))
    try eq(f.limits[0].resetsAt, parseISODate("2026-11-10T22:00:00Z"))
    try eq(f.limits[1].resetsAt, Date(timeIntervalSince1970: 1_794_500_000))
    try eq(f.limits[2].resetsAt, nil)
}

print("Agents")
test("chat names: title, else folder, Home for the home folder") {
    try eq(chatName(chat("a", busy: true, since: 0, ctx: nil, title: "Fix login"), home: "/Users/me"), "Fix login")
    try eq(chatName(chat("a", busy: true, since: 0, ctx: nil, title: "  "), home: "/Users/me"), "proj")
    try eq(chatName(chat("a", busy: true, since: 0, ctx: nil, cwd: "/Users/me"), home: "/Users/me"), "Home")
}
test("snapshot: busy and agent-running chats are working; idle chats listed apart") {
    let ag = [
        WorkRow(id: "1", name: "Explore code", type: "Explore", model: "claude-sonnet-5-5", status: "running", startedAt: 10, endedAt: nil, tools: 4, lastTool: "Grep"),
        WorkRow(id: "2", name: "Old", type: "Plan", model: "", status: "completed", startedAt: 1, endedAt: 5, tools: 9, lastTool: ""),
        WorkRow(id: "3", name: "Ask", type: "general", model: "", status: "waiting", startedAt: 20, endedAt: nil, tools: 0, lastTool: ""),
    ]
    let snap = agentsSnapshot([
        chat("idle", busy: false, since: 5, ctx: nil),
        chat("bg", busy: false, since: 1, ctx: nil, agents: ag),
        chat("main", busy: true, since: 3, ctx: nil),
    ], home: "/Users/me")
    try eq(snap.working.map(\.id), ["main", "bg"])
    try eq(snap.idle.map(\.id), ["idle"])
    try eq(snap.agentCount, 2)
    try eq(snap.runningCount, 3)
    let bg = snap.working[1]
    try eq(bg.agents.map(\.name), ["Explore code", "Ask"])
    try eq(bg.agents[0].detail, "Explore · sonnet-5-5")
    try eq(bg.agents[1].waiting, true)
}

print("Files")
test("loadChats keeps fresh heartbeats only and skips broken files") {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("cw-tests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: dir) }
    let enc = JSONEncoder()
    let realNow = Date()
    var fresh = chat("fresh", busy: true, since: 0, ctx: 3); fresh.updatedAt = ms(realNow)
    var stale = chat("stale", busy: true, since: 0, ctx: 3); stale.updatedAt = ms(realNow) - 120_000
    try enc.encode(fresh).write(to: dir.appendingPathComponent("fresh.json"))
    try enc.encode(stale).write(to: dir.appendingPathComponent("stale.json"))
    try Data("{not json".utf8).write(to: dir.appendingPathComponent("broken.json"))
    // An old mod (before 0.8.2) writes no ctx: still readable.
    let old = #"{"sessionId":"old","title":null,"cwd":"/x","main":{"busy":false,"since":1,"tools":0,"lastTool":""},"agents":[],"updatedAt":\#(Int(ms(realNow)))}"#
    try Data(old.utf8).write(to: dir.appendingPathComponent("old.json"))
    let got = loadChats(dir, now: realNow)
    try eq(got.map(\.sessionId), ["fresh", "old"])
    try eq(got[1].ctx, nil)
}
test("missing files load as nil or empty, never crash") {
    let nowhere = URL(fileURLWithPath: "/nonexistent-\(UUID().uuidString)")
    try eq(loadStats(nowhere), nil)
    try eq(loadLimits(nowhere), nil)
    try eq(loadChats(nowhere).count, 0)
}
test("finds usage-grid's stats.py in the plugin cache, newest install first, any marketplace") {
    let fm = FileManager.default
    let home = fm.temporaryDirectory.appendingPathComponent("cw-home-\(UUID().uuidString)")
    defer { try? fm.removeItem(at: home) }
    try eq(findStatsScript(home: home), nil)
    func install(_ market: String, _ version: String, age: TimeInterval) throws -> URL {
        let dir = home.appendingPathComponent(".claude/plugins/cache/\(market)/usage-grid/\(version)")
        try fm.createDirectory(at: dir.appendingPathComponent("hooks"), withIntermediateDirectories: true)
        let script = dir.appendingPathComponent("hooks/stats.py")
        try Data("print(1)".utf8).write(to: script)
        try fm.setAttributes([.modificationDate: Date().addingTimeInterval(-age)], ofItemAtPath: dir.path)
        return script
    }
    let older = try install("some-market", "0.8.1", age: 3600)
    try eq(findStatsScript(home: home)?.path, older.path)
    let newer = try install("other-market", "0.8.2", age: 10)
    try eq(findStatsScript(home: home)?.path, newer.path)
    // A version folder without the script is skipped.
    try fm.createDirectory(at: home.appendingPathComponent(".claude/plugins/cache/x/usage-grid/9.9.9"), withIntermediateDirectories: true)
    try eq(findStatsScript(home: home)?.path, newer.path)
}

print("Prompt links")
test("new chat link encodes the prompt so + & = and spaces survive") {
    try eq(newChatURL(prompt: "  ").absoluteString, "claude://code/new")
    try eq(newChatURL(prompt: "fix a+b & c=d").absoluteString, "claude://code/new?q=fix%20a%2Bb%20%26%20c%3Dd")
    try eq(newChatURL(prompt: "hi", folder: "/Users/me/My Proj").absoluteString, "claude://code/new?q=hi&folder=%2FUsers%2Fme%2FMy%20Proj")
    let back = URLComponents(url: newChatURL(prompt: "line1\nline2 é 🙂"), resolvingAgainstBaseURL: false)!
    try eq(back.queryItems?.first?.value, "line1\nline2 é 🙂")
}

print("\n\(passed) passed, \(failed) failed")
exit(failed == 0 ? 0 : 1)
