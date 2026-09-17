import SwiftUI

/// Themes shared with the web editor; one palette drives both sides.
enum AppTheme: String, CaseIterable, Identifiable {
    case paper, sepia, midnight, aurora, nord, rosePine = "rose-pine", dracula, catppuccin, solarized, gruvbox

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .paper: "Paper"
        case .sepia: "Sepia"
        case .midnight: "Midnight"
        case .aurora: "Aurora"
        case .nord: "Nord"
        case .rosePine: "Rose Pine"
        case .dracula: "Dracula"
        case .catppuccin: "Catppuccin"
        case .solarized: "Solarized"
        case .gruvbox: "Gruvbox"
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

    init() {
        // One script per window; the system tab bar (View > Show Tab Bar) only confuses.
        NSWindow.allowsAutomaticWindowTabbing = false
    }

    var body: some Scene {
        DocumentGroup(newDocument: ScriptDocument()) { configuration in
            ScriptWindow(document: configuration.$document, fileURL: configuration.fileURL, theme: theme)
                .frame(minWidth: 1000, minHeight: 640)
        }
        .defaultSize(width: 1440, height: 900)
        .commands {
            // The web view would otherwise answer ⌘Z with WebKit's own undo, not the script's.
            CommandGroup(replacing: .undoRedo) {
                Button("Undo") { focusedBridge?.bridge?.undo() }
                    .keyboardShortcut("z", modifiers: .command)
                Button("Redo") { focusedBridge?.bridge?.redo() }
                    .keyboardShortcut("z", modifiers: [.command, .shift])
            }
            CommandGroup(after: .saveItem) {
                Menu("Export") {
                    Button("PDF…") { focusedBridge?.bridge?.exportAs("pdf") }
                    Button("Final Draft (.fdx)…") { focusedBridge?.bridge?.exportAs("fdx") }
                    Button("Fountain…") { focusedBridge?.bridge?.exportAs("fountain") }
                    Button("Plain Text…") { focusedBridge?.bridge?.exportAs("txt") }
                }
                .disabled(focusedBridge?.bridge == nil)
            }
            // Into the system View menu, above its toolbar and full-screen items.
            CommandGroup(before: .toolbar) {
                Button("Script") { focusedBridge?.bridge?.setView("editor") }
                    .keyboardShortcut("1", modifiers: [.command, .option])
                Button("Outline") { focusedBridge?.bridge?.setView("outline") }
                    .keyboardShortcut("2", modifiers: [.command, .option])
                Button("Beat Board") { focusedBridge?.bridge?.setView("board") }
                    .keyboardShortcut("3", modifiers: [.command, .option])
                Button("Writers' Room") { focusedBridge?.bridge?.setView("room") }
                    .keyboardShortcut("4", modifiers: [.command, .option])
                Button("Reports") { focusedBridge?.bridge?.setView("reports") }
                    .keyboardShortcut("5", modifiers: [.command, .option])
                Divider()
                Button("Focus Mode") { focusedBridge?.bridge?.toggleFocus() }
                    .keyboardShortcut("f", modifiers: [.command, .shift])
                    .disabled(focusedBridge?.bridge == nil)
                Divider()
                Picker("Theme", selection: $theme) {
                    ForEach(AppTheme.allCases) { t in
                        Text(t.displayName).tag(t.rawValue)
                    }
                }
                Divider()
            }
        }
        Settings {
            AISettingsView()
        }
    }
}

/// One document window: the web editor bound to the document on disk.
private struct ScriptWindow: View {
    @Binding var document: ScriptDocument
    let fileURL: URL?
    let theme: String
    @StateObject private var bridgeBox = ScriptBridgeBox()
    @Environment(\.openSettings) private var openSettings

    private var title: String {
        fileURL?.deletingPathExtension().lastPathComponent ?? "Untitled"
    }

    var body: some View {
        ScriptWebView(
            load: ScriptLoad(document: document, title: title),
            theme: theme,
            documentKey: fileURL?.path,
            bridgeBox: bridgeBox,
            onChanged: { text in
                // The page hands back the whole serialized document on every change.
                document.text = text
                document.format = "screenplay"
            },
            onSave: {
                NSApp.sendAction(#selector(NSDocument.save(_:)), to: nil, from: nil)
            },
            onOpenSettings: {
                NSApp.activate(ignoringOtherApps: true)
                openSettings()
            }
        )
        .ignoresSafeArea()
        .focusedSceneValue(\.scriptBridge, bridgeBox)
    }
}
