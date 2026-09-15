import AppKit
import Foundation
import WebKit

// wrapcheck <web directory> <script file> [format]
//
// Loads the bundled editor in a WKWebView, imports the script, and asks the
// page to compare WebKit's line wrapping with the pagination engine's for
// every element. Exit code 0 when they agree everywhere.

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write(Data("usage: wrapcheck <web dir> <script file> [screenplay|fdx|fountain|txt]\n".utf8))
    exit(2)
}
let webDir = URL(fileURLWithPath: args[1], isDirectory: true)
let scriptURL = URL(fileURLWithPath: args[2])
let format = args.count > 3 ? args[3] : (scriptURL.pathExtension.lowercased() == "fdx" ? "fdx" : scriptURL.pathExtension.lowercased() == "fountain" ? "fountain" : "screenplay")
let text = try String(contentsOf: scriptURL, encoding: .utf8)

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

final class Runner {
    let bridge = ScriptBridge()
    var webView: WKWebView!
    var window: NSWindow!

    func start() {
        webView = ScriptBridge.makeWebView(bridge: bridge, directory: webDir)
        webView.frame = NSRect(x: 0, y: 0, width: 1440, height: 900)
        window = NSWindow(contentRect: webView.frame, styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = webView
        window.orderFrontRegardless()
        bridge.onEvent = { [unowned self] event in self.handle(event) }
        bridge.loadEditor()
        // Nothing after 30s means the page never came up.
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
            FileHandle.standardError.write(Data("wrapcheck: timed out waiting for the page\n".utf8))
            exit(3)
        }
    }

    func handle(_ event: HostEvent) {
        switch event {
        case .ready:
            bridge.load(ScriptLoad(text: text, format: format, title: scriptURL.lastPathComponent))
            // Give React and the page layout a moment to settle before measuring.
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [unowned self] in
                bridge.requestWrapCheck()
            }
        case .wrapCheck(let result):
            let elements = result["elements"] as? Int ?? 0
            let mismatches = result["mismatches"] as? [[String: Any]] ?? []
            print("wrapcheck: \(elements) elements, \(mismatches.count) wrapped differently from the engine")
            for m in mismatches.prefix(25) {
                let type = m["type"] as? String ?? "?"
                let engine = m["engine"] as? Int ?? 0
                let rendered = m["rendered"] as? Int ?? 0
                let snippet = m["text"] as? String ?? ""
                print("  #\(m["index"] ?? 0) \(type): engine \(engine) lines, WebKit \(rendered) — \(snippet)")
            }
            exit(mismatches.isEmpty ? 0 : 1)
        case .log(let message):
            print("web: \(message)")
        default:
            break
        }
    }
}

let runner = Runner()
runner.start()
app.run()
