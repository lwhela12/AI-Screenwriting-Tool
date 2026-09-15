import AppKit
import SwiftUI
import WebKit

/// The bridge between the native app and the web editor.
///
/// The editor (the `client/` build, copied into the bundle as `web/`) runs in a
/// `WKWebView`. Messages from the page arrive on the `host` handler:
/// `ready` (the bridge is installed), `changed` (the serialized document to
/// write to disk), `save` (the page asked to save), `log`, and `wrapCheck`
/// (a line-wrapping comparison result). The app drives the page through
/// `window.__screenplay`: `load(text, format, meta)`, `document()`,
/// `wrapCheck()`, `setTheme(name)`.
public enum WebBundle {
    /// The `web/` folder inside the app bundle, or an explicit directory for tools.
    public static func directory(explicit: String? = nil) -> URL? {
        if let explicit { return URL(fileURLWithPath: explicit, isDirectory: true) }
        return Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true)
    }
}

/// Everything the page needs when it comes up.
public struct ScriptLoad: Equatable, Sendable {
    public var text: String
    /// `screenplay` (our JSON), `fdx`, `fountain` or `txt`.
    public var format: String
    public var title: String

    public init(text: String, format: String, title: String) {
        self.text = text
        self.format = format
        self.title = title
    }
}

public enum HostEvent {
    case ready
    case changed(text: String)
    case save
    case log(String)
    case wrapCheck([String: Any])
    /// The page produced a file to save (an export).
    case export(filename: String, mime: String, data: Data)
}

/// Serves the bundled editor over `screenwriter://web/...`. A real origin
/// (unlike file://) lets WebKit load ES modules, workers and localStorage.
public final class WebBundleSchemeHandler: NSObject, WKURLSchemeHandler {
    public static let scheme = "screenwriter"
    public static let root = URL(string: "screenwriter://web/")!
    let directory: URL

    public init(directory: URL) {
        self.directory = directory
    }

    public func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = directory.appendingPathComponent(String(path.dropFirst()))
        guard let data = try? Data(contentsOf: file) else {
            task.didFailWithError(NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }
        let mime: String
        switch file.pathExtension.lowercased() {
        case "html": mime = "text/html"
        case "js", "mjs": mime = "text/javascript"
        case "css": mime = "text/css"
        case "json": mime = "application/json"
        case "svg": mime = "image/svg+xml"
        case "png": mime = "image/png"
        case "woff2": mime = "font/woff2"
        case "woff": mime = "font/woff"
        case "wasm": mime = "application/wasm"
        default: mime = "application/octet-stream"
        }
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "\(mime); charset=utf-8", "Content-Length": String(data.count)])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    public func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

public final class ScriptBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    public var onEvent: ((HostEvent) -> Void)?
    public private(set) weak var webView: WKWebView?
    public private(set) var isReady = false
    private var schemeHandler: WebBundleSchemeHandler?

    public static func makeWebView(bridge: ScriptBridge, directory: URL) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let handler = WebBundleSchemeHandler(directory: directory)
        bridge.schemeHandler = handler
        configuration.setURLSchemeHandler(handler, forURLScheme: WebBundleSchemeHandler.scheme)
        configuration.userContentController.add(bridge, name: "host")
        // Forward page errors to the host so failures are visible from the app.
        let errorScript = """
        window.addEventListener('error', function (e) {
          window.webkit.messageHandlers.host.postMessage({ type: 'log', message: 'error: ' + e.message + ' @ ' + e.filename + ':' + e.lineno });
        });
        window.addEventListener('unhandledrejection', function (e) {
          window.webkit.messageHandlers.host.postMessage({ type: 'log', message: 'unhandled: ' + (e.reason && e.reason.message || e.reason) });
        });
        """
        configuration.userContentController.addUserScript(WKUserScript(source: errorScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.preferences.setValue(true, forKey: "developerExtrasEnabled")
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = bridge
        view.allowsMagnification = false
        bridge.webView = view
        return view
    }

    /// Load the bundled editor page.
    public func loadEditor() {
        webView?.load(URLRequest(url: WebBundleSchemeHandler.root))
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        onEvent?(.log("navigation failed: \(error.localizedDescription)"))
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        onEvent?(.log("load failed: \(error.localizedDescription)"))
    }

    public func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "ready":
            isReady = true
            onEvent?(.ready)
        case "changed":
            if let text = body["text"] as? String { onEvent?(.changed(text: text)) }
        case "save":
            onEvent?(.save)
        case "log":
            onEvent?(.log(body["message"] as? String ?? ""))
        case "wrapCheck":
            onEvent?(.wrapCheck(body["result"] as? [String: Any] ?? [:]))
        case "export":
            if let filename = body["filename"] as? String, let base64 = body["base64"] as? String, let data = Data(base64Encoded: base64) {
                onEvent?(.export(filename: filename, mime: body["mime"] as? String ?? "application/octet-stream", data: data))
            }
        default:
            break
        }
    }

    // MARK: Calls into the page

    public func load(_ load: ScriptLoad) {
        let meta = ["title": load.title]
        call("window.__screenplay.load(\(json(load.text)), \(json(load.format)), \(json(meta)))")
    }

    public func setTheme(_ name: String) {
        call("window.__screenplay && window.__screenplay.setTheme(\(json(name)))")
    }

    public func requestWrapCheck() {
        call("window.__screenplay && window.__screenplay.wrapCheck()")
    }

    /// Ask the page for an export; the file arrives as an `.export` event.
    public func exportAs(_ format: String) {
        call("window.__screenplay && window.__screenplay.exportAs(\(json(format)))")
    }

    private func call(_ script: String) {
        webView?.evaluateJavaScript(script) { _, error in
            if let error { NSLog("bridge: %@", error.localizedDescription) }
        }
    }

    private func json(_ value: Any) -> String {
        if let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]),
           let string = String(data: data, encoding: .utf8) {
            return string
        }
        return "null"
    }
}

/// Hands a window's bridge to SwiftUI menu commands.
@MainActor
public final class ScriptBridgeBox: ObservableObject {
    public weak var bridge: ScriptBridge?
    public init() {}
}

/// SwiftUI wrapper: one web view per document window.
public struct ScriptWebView: NSViewRepresentable {
    public var load: ScriptLoad
    public var theme: String
    public var bridgeBox: ScriptBridgeBox?
    public var onChanged: (String) -> Void
    public var onSave: () -> Void

    public init(load: ScriptLoad, theme: String, bridgeBox: ScriptBridgeBox? = nil, onChanged: @escaping (String) -> Void, onSave: @escaping () -> Void) {
        self.load = load
        self.theme = theme
        self.bridgeBox = bridgeBox
        self.onChanged = onChanged
        self.onSave = onSave
    }

    public func makeCoordinator() -> Coordinator { Coordinator() }

    public func makeNSView(context: Context) -> WKWebView {
        let coordinator = context.coordinator
        guard let directory = WebBundle.directory() else {
            NSLog("ScriptWebView: web bundle not found")
            return WKWebView()
        }
        let view = ScriptBridge.makeWebView(bridge: coordinator.bridge, directory: directory)
        bridgeBox?.bridge = coordinator.bridge
        coordinator.pendingLoad = load
        coordinator.theme = theme
        coordinator.onChanged = onChanged
        coordinator.onSave = onSave
        coordinator.bridge.onEvent = { [weak coordinator] event in
            coordinator?.handle(event)
        }
        coordinator.bridge.loadEditor()
        return view
    }

    public func updateNSView(_ webView: WKWebView, context: Context) {
        let coordinator = context.coordinator
        coordinator.onChanged = onChanged
        coordinator.onSave = onSave
        if coordinator.theme != theme {
            coordinator.theme = theme
            coordinator.bridge.setTheme(theme)
        }
        // A new document instance (e.g. Revert To) reloads the page content.
        let loaded = coordinator.loadedGeneration
        if coordinator.bridge.isReady, !coordinator.suppressReload, loaded?.text != load.text || loaded?.format != load.format {
            coordinator.loadedGeneration = load
            coordinator.bridge.load(load)
        }
    }

    @MainActor
    public final class Coordinator {
        let bridge = ScriptBridge()
        var pendingLoad: ScriptLoad?
        var loadedGeneration: ScriptLoad?
        var theme = "paper"
        var onChanged: ((String) -> Void)?
        var onSave: (() -> Void)?
        /// Set while a change we just received is flowing back through the document binding.
        var suppressReload = false

        func handle(_ event: HostEvent) {
            switch event {
            case .ready:
                bridge.setTheme(theme)
                if let pendingLoad {
                    loadedGeneration = pendingLoad
                    bridge.load(pendingLoad)
                    self.pendingLoad = nil
                }
            case .changed(let text):
                suppressReload = true
                loadedGeneration = ScriptLoad(text: text, format: "screenplay", title: loadedGeneration?.title ?? "")
                onChanged?(text)
                suppressReload = false
            case .save:
                onSave?()
            case .log(let message):
                NSLog("web: %@", message)
            case .wrapCheck:
                break
            case .export(let filename, _, let data):
                Self.saveExport(filename: filename, data: data)
            }
        }

        /// Standard save panel for an exported file.
        static func saveExport(filename: String, data: Data) {
            let panel = NSSavePanel()
            panel.nameFieldStringValue = filename
            panel.canCreateDirectories = true
            panel.begin { response in
                guard response == .OK, let url = panel.url else { return }
                do {
                    try data.write(to: url, options: .atomic)
                } catch {
                    NSAlert(error: error).runModal()
                }
            }
        }
    }
}
