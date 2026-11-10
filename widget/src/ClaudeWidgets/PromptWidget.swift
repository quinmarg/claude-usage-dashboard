import AppKit
import SwiftUI
import WidgetCore

/// The start-a-chat card: type a prompt, press Return, and a new Claude Code chat opens with it filled in.
struct PromptCard: View {
    @ObservedObject var store: Store
    let handle: PanelHandle
    @StateObject private var model = PromptModel()
    @AppStorage("promptFolder") private var folder = ""
    @FocusState private var focused: Bool

    static let height: CGFloat = 108

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "sparkle")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.accent)
                Text("New Claude chat")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.t1)
                Spacer()
                folderMenu
            }
            HStack(alignment: .center, spacing: 8) {
                TextField("Ask Claude anything…", text: $model.text, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 15))
                    .foregroundStyle(Theme.t1)
                    .lineLimit(1...2)
                    .focused($focused)
                    .onSubmit(send)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.field))
                    .contentShape(Rectangle())
                    .onTapGesture {
                        handle.focus()
                        focused = true
                    }
                Button(action: send) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(isEmpty ? Theme.t2.opacity(0.5) : Theme.accent)
                }
                .buttonStyle(.plain)
                .help("Open a new Claude Code chat with this prompt (Return)")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetCard()
    }

    private var isEmpty: Bool { model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    private var folderMenu: some View {
        Menu {
            Button("Claude's default folder") { folder = "" }
            if !store.recentFolders.isEmpty {
                Divider()
                ForEach(store.recentFolders, id: \.self) { path in
                    Button(folderName(path)) { folder = path }
                }
            }
        } label: {
            HStack(spacing: 3) {
                Image(systemName: "folder").font(.system(size: 10, weight: .semibold))
                Text(folder.isEmpty ? "Default folder" : folderName(folder)).font(.system(size: 11, weight: .semibold)).lineLimit(1)
            }
            .foregroundStyle(Theme.accent)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(Theme.accent.opacity(0.12)))
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .help("Folder the new chat starts in")
    }

    private func send() {
        // Empty: just open Claude Code. Otherwise open a new chat with the text filled in.
        let url = newChatURL(prompt: model.text, folder: folder.isEmpty ? nil : folder)
        NSWorkspace.shared.open(url)
        model.text = ""
        focused = false
        handle.resignFocus()
    }
}

/// The typed text. (@State is a macro that needs full Xcode, so plain ObservableObjects stand in.)
final class PromptModel: ObservableObject {
    @Published var text = ""
}
