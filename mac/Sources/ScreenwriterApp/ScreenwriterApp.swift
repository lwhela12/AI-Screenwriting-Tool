import SwiftUI

/// Themes shared with the web editor; one palette drives both sides.
enum AppTheme: String, CaseIterable, Identifiable {
    case paper, sepia, midnight

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .paper: "Paper"
        case .sepia: "Sepia"
        case .midnight: "Midnight"
        }
    }
}

@main
struct ScreenwriterApp: App {
    @AppStorage("theme") private var theme = AppTheme.paper.rawValue

    var body: some Scene {
        DocumentGroup(newDocument: ScriptDocument()) { configuration in
            ScriptWindow(document: configuration.$document, fileURL: configuration.fileURL, theme: theme)
                .frame(minWidth: 1000, minHeight: 640)
        }
        .defaultSize(width: 1440, height: 900)
        .commands {
            CommandMenu("View") {
                Picker("Theme", selection: $theme) {
                    ForEach(AppTheme.allCases) { t in
                        Text(t.displayName).tag(t.rawValue)
                    }
                }
            }
        }
    }
}

/// One document window: the web editor bound to the document on disk.
private struct ScriptWindow: View {
    @Binding var document: ScriptDocument
    let fileURL: URL?
    let theme: String

    private var title: String {
        fileURL?.deletingPathExtension().lastPathComponent ?? "Untitled"
    }

    var body: some View {
        ScriptWebView(
            load: ScriptLoad(text: document.text, format: document.format, title: title),
            theme: theme,
            onChanged: { text in
                // The page hands back the whole serialized document on every change.
                document.text = text
                document.format = "screenplay"
            },
            onSave: {
                NSApp.sendAction(#selector(NSDocument.save(_:)), to: nil, from: nil)
            }
        )
        .ignoresSafeArea()
    }
}
