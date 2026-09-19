import SwiftUI
import UniformTypeIdentifiers

/// A quiet starting point; all editing still uses the native document scenes.
struct WelcomeView: View {
    @ObservedObject private var recents = RecentScripts.shared
    @Environment(\.newDocument) private var newDocument
    @Environment(\.openDocument) private var openDocument
    @Environment(\.dismissWindow) private var dismissWindow
    @State private var opening = false
    @State private var openError: String?

    private let ink = Color(red: 0.16, green: 0.15, blue: 0.13)
    private let muted = Color(red: 0.43, green: 0.41, blue: 0.37)
    private let wordmark = Bundle.main.url(forResource: "pica-wordmark", withExtension: "png")
        .flatMap { NSImage(contentsOf: $0) }

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Image(nsImage: wordmark ?? NSImage())
                    .resizable()
                    .scaledToFit()
                    .frame(width: 262, height: 262)
                    // Keep the original ink while letting the panel's paper show through.
                    .blendMode(.darken)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                    .accessibilityLabel("Pica")
                Button {
                    newDocument(ScriptDocument())
                } label: {
                    Label("New Script", systemImage: "plus")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(WelcomeActionStyle(primary: true))
                .accessibilityHint("Create a blank Pica workspace")
                .padding(.bottom, 10)
                Button(action: chooseScript) {
                    Label("Open Script…", systemImage: "folder")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(WelcomeActionStyle(primary: false))
                Text("Pica, Final Draft, Fountain, PDF or text")
                    .font(.system(size: 11))
                    .foregroundStyle(muted)
                    .padding(.top, 18)
            }
            .padding(.horizontal, 38)
            .padding(.top, 20)
            .padding(.bottom, 38)
            .frame(width: 338)
            .background(Color(red: 0.95, green: 0.93, blue: 0.88))
            .compositingGroup()

            Rectangle().fill(ink.opacity(0.1)).frame(width: 1)

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Recent scripts")
                        .font(.system(size: 20, weight: .semibold))
                        .accessibilityAddTraits(.isHeader)
                    Spacer()
                    if opening { ProgressView().controlSize(.small) }
                }
                .padding(.bottom, 8)
                Text("Pick up where you left off.")
                    .font(.system(size: 12))
                    .foregroundStyle(muted)
                if recents.entries.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "doc.text")
                            .font(.system(size: 32, weight: .ultraLight))
                            .accessibilityHidden(true)
                        Text("Your stories start here")
                            .font(.system(size: 15, weight: .medium))
                        Text("Create a script or open one you’ve been\nworking on. It will appear here next time.")
                            .font(.system(size: 12))
                            .multilineTextAlignment(.center)
                            .lineSpacing(4)
                    }
                    .foregroundStyle(muted)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 4) {
                            ForEach(recents.entries) { entry in
                                RecentScriptRow(entry: entry) { open(entry.url) }
                            }
                        }
                        .padding(.vertical, 18)
                    }
                    .padding(.horizontal, -10)
                    HStack {
                        Text("Stored on your Mac or wherever you save them.")
                            .font(.system(size: 10))
                            .foregroundStyle(muted)
                        Spacer()
                        Button("Clear List") { recents.clear() }
                            .buttonStyle(.plain)
                            .font(.system(size: 11))
                            .foregroundStyle(muted)
                            .help("Clear recent-file references without deleting any scripts")
                    }
                }
            }
            .padding(.horizontal, 32)
            .padding(.top, 59)
            .padding(.bottom, 30)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(red: 0.985, green: 0.979, blue: 0.96))
        }
        .foregroundStyle(ink)
        .frame(width: 860, height: 520)
        .preferredColorScheme(.light)
        .disabled(opening)
        .onAppear { recents.refresh() }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in recents.refresh() }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in recents.refresh() }
        .alert("Couldn’t open this script", isPresented: Binding(get: { openError != nil }, set: { if !$0 { openError = nil } })) {
            Button("Locate Script…") { openError = nil; chooseScript() }
            Button("Cancel", role: .cancel) { openError = nil }
        } message: {
            Text(openError ?? "The file may have moved. Locate it to continue.")
        }
    }

    private func chooseScript() {
        let panel = NSOpenPanel()
        panel.title = "Open Script"
        panel.allowedContentTypes = ScriptDocument.readableContentTypes + ScriptImportDocument.readableContentTypes
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            open(url)
        }
    }

    private func open(_ url: URL) {
        opening = true
        Task { @MainActor in
            defer { opening = false }
            do {
                try await openDocument(at: url)
                dismissWindow(id: "welcome")
            }
            catch { openError = error.localizedDescription }
        }
    }
}

private struct WelcomeActionStyle: ButtonStyle {
    let primary: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .padding(.horizontal, 17)
            .padding(.vertical, 13)
            .foregroundStyle(primary ? Color.white : Color.black.opacity(0.8))
            .background(primary ? Color(red: 0.18, green: 0.17, blue: 0.15) : Color.white.opacity(0.45))
            .clipShape(RoundedRectangle(cornerRadius: 7))
            .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Color.black.opacity(primary ? 0 : 0.13)))
            .opacity(configuration.isPressed ? 0.7 : 1)
            .contentShape(RoundedRectangle(cornerRadius: 7))
    }
}

private struct RecentScriptRow: View {
    let entry: RecentScript
    let open: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: open) {
            HStack(alignment: .top, spacing: 13) {
                Image(systemName: entry.isWorkspace ? "doc.text" : "doc.badge.arrow.up")
                    .font(.system(size: 23, weight: .light))
                    .foregroundStyle(Color.black.opacity(0.48))
                    .frame(width: 30)
                    .padding(.top, 3)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 5) {
                    Text(entry.title).font(.system(size: 14, weight: .medium)).lineLimit(1)
                    Text(entry.kind).font(.system(size: 11)).foregroundStyle(Color.black.opacity(0.58))
                    HStack(spacing: 5) {
                        if let date = entry.lastOpened {
                            Text("Opened \(date.formatted(.relative(presentation: .named)))")
                            Text("·")
                        }
                        Text(entry.location).lineLimit(1).truncationMode(.middle)
                    }
                    .font(.system(size: 10))
                    .foregroundStyle(Color.black.opacity(0.5))
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Color.black.opacity(0.35))
                    .padding(.top, 6)
                    .accessibilityHidden(true)
            }
            .padding(11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(hovered ? Color.black.opacity(0.045) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 7))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .help(entry.url.path)
        .accessibilityLabel("\(entry.title), \(entry.kind), \(entry.location)")
        .accessibilityHint("Open script")
    }
}

struct WelcomeCommands: Commands {
    @Environment(\.openWindow) private var openWindow
    var body: some Commands {
        CommandGroup(after: .newItem) {
            Button("Welcome to Pica") { openWindow(id: "welcome") }
                .keyboardShortcut("0", modifiers: [.command, .shift])
        }
    }
}
