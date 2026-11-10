import Foundation

/// Characters left as-is in a query value. Everything else, including + & = and spaces, is percent-encoded,
/// because the Claude app reads the link with URLSearchParams, where a bare + means a space.
private let queryValueAllowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

private func enc(_ s: String) -> String {
    s.addingPercentEncoding(withAllowedCharacters: queryValueAllowed) ?? ""
}

/// claude://code/new opens a new Claude Code chat in the desktop app. It takes `q` (the prompt, filled into the
/// message box) and `folder` (the working folder). Found in the app's own link handler.
public func newChatURL(prompt: String, folder: String? = nil) -> URL {
    var parts: [String] = []
    let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
    if !text.isEmpty { parts.append("q=\(enc(text))") }
    if let folder, !folder.isEmpty { parts.append("folder=\(enc(folder))") }
    let query = parts.isEmpty ? "" : "?" + parts.joined(separator: "&")
    return URL(string: "claude://code/new\(query)")!
}

/// Opens the Claude Code tab with nothing typed.
public let openClaudeURL = URL(string: "claude://code/new")!
