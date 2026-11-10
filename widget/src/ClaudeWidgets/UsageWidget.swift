import SwiftUI
import WidgetCore

/// The one desktop widget: the dashboard's top (hero card and rings), what's running, and the start-a-chat box.
struct HomeWidget: View {
    @ObservedObject var store: Store
    let handle: PanelHandle

    static let gap: CGFloat = 10
    static let ringsHeight: CGFloat = 150
    static let size = CGSize(
        width: 360 + Theme.inset * 2,
        height: 178 + ringsHeight + AgentsCard.height + PromptCard.height + gap * 3 + Theme.inset * 2)

    var body: some View {
        VStack(spacing: Self.gap) {
            HeroCard(summary: store.summary)
                .frame(height: 178)
            RingsCard(rings: store.ringValues)
                .frame(height: Self.ringsHeight)
            AgentsCard(store: store)
                .frame(height: AgentsCard.height)
            PromptCard(store: store, handle: handle)
                .frame(height: PromptCard.height)
        }
        .padding(Theme.inset)
        .frame(width: Self.size.width, height: Self.size.height)
        .dragToMove(handle)
        .widgetMenu(store: store)
    }
}

struct HeroCard: View {
    let summary: UsageSummary?

    var body: some View {
        ZStack(alignment: .topLeading) {
            Theme.heroGradient
            // The dashboard's two soft circles.
            GeometryReader { g in
                Circle().fill(.white.opacity(0.10)).frame(width: 240, height: 240).position(x: g.size.width - 30, y: 10)
                Circle().fill(.white.opacity(0.07)).frame(width: 180, height: 180).position(x: 40, y: g.size.height + 30)
            }
            if let s = summary {
                content(s)
            } else {
                Text("Reading your Claude Code logs…")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(.white.opacity(0.85))
                    .padding(20)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
        .shadow(color: Color(hex: 0x0A84FF).opacity(0.28), radius: 8, y: 3)
    }

    @ViewBuilder
    private func content(_ s: UsageSummary) -> some View {
        GeometryReader { g in
            let w = g.size.width
            ZStack(alignment: .topLeading) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Total tokens")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                        .padding(.top, 18)
                    Text(fmt(s.totalTokens))
                        .font(.system(size: 44, weight: .heavy, design: .default))
                        .tracking(-1)
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .padding(.top, 6)
                    Text("since \(s.firstDay.map(shortDay) ?? "—") · incl. cache")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.white.opacity(0.75))
                        .padding(.top, 2)
                }
                .padding(.leading, 20)
                .frame(width: w * 0.56, alignment: .leading)

                Sparkline(values: s.series30)
                    .frame(width: w * 0.44 - 20, height: 70)
                    .offset(x: w * 0.56, y: 28)
                Text("30 days")
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: w - 20, alignment: .trailing)
                    .offset(y: 100)

                MiniStats(items: [
                    ("Fable", fmt(s.fable)),
                    ("Output", fmt(s.output)),
                    ("Sessions", "\(s.sessions)"),
                    ("Days", "\(s.activeDays)"),
                    ("Streak", "\(s.streak)d"),
                ])
                .frame(width: w - 32)
                .offset(x: 16, y: 124)
            }
        }
    }
}

/// All tokens per day over the last 30 days: a white line with a soft fill and a dot on today.
struct Sparkline: View {
    let values: [Int]

    var body: some View {
        GeometryReader { g in
            let pts = points(in: g.size)
            ZStack {
                Path { p in
                    guard let first = pts.first, let last = pts.last else { return }
                    p.move(to: first)
                    pts.dropFirst().forEach { p.addLine(to: $0) }
                    p.addLine(to: CGPoint(x: last.x, y: g.size.height))
                    p.addLine(to: CGPoint(x: first.x, y: g.size.height))
                    p.closeSubpath()
                }
                .fill(.white.opacity(0.16))
                Path { p in
                    guard let first = pts.first else { return }
                    p.move(to: first)
                    pts.dropFirst().forEach { p.addLine(to: $0) }
                }
                .stroke(.white.opacity(0.9), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                if let last = pts.last {
                    Circle().fill(.white).frame(width: 7, height: 7).position(last)
                }
            }
        }
    }

    private func points(in size: CGSize) -> [CGPoint] {
        guard values.count > 1 else { return [] }
        let top = Double(max(1, values.max() ?? 1))
        return values.enumerated().map { i, v in
            CGPoint(x: size.width * CGFloat(i) / CGFloat(values.count - 1), y: size.height - size.height * CGFloat(Double(v) / top))
        }
    }
}

struct MiniStats: View {
    let items: [(String, String)]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                // The first item (Fable) sits on a soft highlight; the rest are a little smaller.
                let lead = i == 0
                HStack(spacing: 0) {
                    if i > 1 {
                        Rectangle().fill(.white.opacity(0.25)).frame(width: 1, height: 30).padding(.trailing, 6)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.0).font(.system(size: 10, weight: lead ? .bold : .medium)).foregroundStyle(.white.opacity(lead ? 0.95 : 0.7)).lineLimit(1)
                        Text(item.1).font(.system(size: lead ? 16 : 14, weight: .bold)).foregroundStyle(.white).lineLimit(1).minimumScaleFactor(0.6)
                    }
                    .padding(.horizontal, lead ? 6 : 0)
                    .padding(.vertical, lead ? 4 : 0)
                    .background(lead ? RoundedRectangle(cornerRadius: 9, style: .continuous).fill(.white.opacity(0.16)) : nil)
                    Spacer(minLength: 0)
                }
                .padding(.trailing, lead ? 6 : 0)
                .frame(maxWidth: .infinity)
            }
        }
    }
}

struct RingsCard: View {
    let rings: [RingValue]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(rings.enumerated()), id: \.offset) { _, ring in
                RingView(ring: ring).frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .widgetCard()
    }
}

struct RingView: View {
    let ring: RingValue
    private let r: CGFloat = 28
    private let line: CGFloat = 7

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                Circle().stroke(Theme.track, lineWidth: line)
                if let pct = ring.percent, pct > 0 {
                    Circle()
                        .trim(from: 0, to: CGFloat(min(100, pct) / 100))
                        .stroke(Theme.color(for: ring.plain ? .normal : severity(pct)), style: StrokeStyle(lineWidth: line, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.easeOut(duration: 0.5), value: pct)
                }
                Text(ring.percent.map { "\(Int($0.rounded()))%" } ?? "—")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Theme.t1)
            }
            .frame(width: r * 2, height: r * 2)
            Text(ring.label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.t1)
                .lineLimit(1)
                .padding(.top, 8)
            Text(ring.sub)
                .font(.system(size: 10, weight: .medium))
                .minimumScaleFactor(0.8)
                .foregroundStyle(Theme.t2)
                .lineLimit(1)
                .padding(.top, 3)
        }
    }
}
