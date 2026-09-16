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

/// The focused window's bridge, so menu commands can reach its page.
struct FocusedBridgeKey: FocusedValueKey {
    typealias Value = ScriptBridgeBox
}

extension FocusedValues {
    var scriptBridge: ScriptBridgeBox? {
        get { self[FocusedBridgeKey.self] }
        set { self[FocusedBridgeKey.self] = newValue }
    }
}

@main
struct ScreenwriterApp: App {
    @AppStorage("theme") private var theme = AppTheme.paper.rawValue
    @FocusedValue(\.scriptBridge) private var focusedBridge

    var body: some Scene {
        DocumentGroup(newDocument: ScriptDocument()) { configuration in
            ScriptWindow(document: configuration.$document, fileURL: configuration.fileURL, theme: theme)
                .frame(minWidth: 1000, minHeight: 640)
        }
        .defaultSize(width: 1440, height: 900)
        .commands {
            CommandGroup(after: .saveItem) {
                Menu("Export") {
                    Button("PDF…") { focusedBridge?.bridge?.exportAs("pdf") }
                    Button("Final Draft (.fdx)…") { focusedBridge?.bridge?.exportAs("fdx") }
                    Button("Fountain…") { focusedBridge?.bridge?.exportAs("fountain") }
                    Button("Plain Text…") { focusedBridge?.bridge?.exportAs("txt") }
                }
                .disabled(focusedBridge?.bridge == nil)
            }
            CommandMenu("View") {
                Button("Script") { focusedBridge?.bridge?.setView("editor") }
                    .keyboardShortcut("1", modifiers: [.command, .option])
                Button("Outline") { focusedBridge?.bridge?.setView("outline") }
                    .keyboardShortcut("2", modifiers: [.command, .option])
                Button("Beat Board") { focusedBridge?.bridge?.setView("board") }
                    .keyboardShortcut("3", modifiers: [.command, .option])
                Button("Reports") { focusedBridge?.bridge?.setView("reports") }
                    .keyboardShortcut("4", modifiers: [.command, .option])
                Divider()
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
    @StateObject private var bridgeBox = ScriptBridgeBox()

    private var title: String {
        fileURL?.deletingPathExtension().lastPathComponent ?? "Untitled"
    }

    var body: some View {
        ScriptWebView(
            load: ScriptLoad(document: document, title: title),
            theme: theme,
            bridgeBox: bridgeBox,
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
        .focusedSceneValue(\.scriptBridge, bridgeBox)
    }
}
