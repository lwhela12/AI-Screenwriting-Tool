import AppKit
import Combine

/// A recent-file reference, never the script's contents.
struct RecentScript: Identifiable, Equatable {
    let url: URL
    let lastOpened: Date?
    var id: URL { url }
    var title: String { url.deletingPathExtension().lastPathComponent }
    var isWorkspace: Bool { url.pathExtension.lowercased() == "pica" }
    var kind: String {
        switch url.pathExtension.lowercased() {
        case "pica": "Pica workspace"
        case "screenplay": "Legacy workspace · opens a copy"
        case "fdx": "Final Draft · imports a copy"
        case "pdf": "PDF · imports a copy"
        case "fountain", "spmd": "Fountain · imports a copy"
        default: "Text · imports a copy"
        }
    }
    var location: String { url.deletingLastPathComponent().lastPathComponent }

    /// Keep the system's recency order within each group; put working files first.
    static func ordered(urls: [URL], openedDates: [String: Date]) -> [RecentScript] {
        var seen = Set<URL>()
        let entries = urls.filter { $0.isFileURL }.compactMap { url -> RecentScript? in
            let normalized = url.standardizedFileURL
            guard seen.insert(normalized).inserted else { return nil }
            return RecentScript(url: normalized, lastOpened: openedDates[normalized.path])
        }
        return entries.filter(\.isWorkspace) + entries.filter { !$0.isWorkspace }
    }
}

/// Uses macOS's recent-document list as the source of truth. Only open dates
/// are stored locally, so clearing the system list also clears the welcome list.
@MainActor
final class RecentScripts: ObservableObject {
    static let shared = RecentScripts()
    @Published private(set) var entries: [RecentScript] = []
    private let defaults: UserDefaults
    private let datesKey = "welcome.recentOpenDates"

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    func record(_ url: URL) {
        guard url.isFileURL else { return }
        let normalized = url.standardizedFileURL
        NSDocumentController.shared.noteNewRecentDocumentURL(normalized)
        var dates = defaults.dictionary(forKey: datesKey) as? [String: Date] ?? [:]
        dates[normalized.path] = Date()
        // Bound local metadata to the system's current recent-file references.
        let paths = Set(NSDocumentController.shared.recentDocumentURLs.map { $0.standardizedFileURL.path })
        defaults.set(dates.filter { paths.contains($0.key) }, forKey: datesKey)
        refresh()
    }

    func refresh() {
        entries = RecentScript.ordered(
            urls: NSDocumentController.shared.recentDocumentURLs,
            openedDates: defaults.dictionary(forKey: datesKey) as? [String: Date] ?? [:]
        )
    }

    func clear() {
        NSDocumentController.shared.clearRecentDocuments(nil)
        defaults.removeObject(forKey: datesKey)
        refresh()
    }
}
