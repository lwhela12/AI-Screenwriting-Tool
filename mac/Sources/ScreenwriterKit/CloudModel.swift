import AppKit
import Foundation
import Security

/// Cloud models for whole-script features. The page asks through the same
/// bridge as the on-device model, with `tier: "cloud"`; the key lives in the
/// Keychain, the request is made from here, and a script is only ever sent
/// after the writer confirms it for that document.
public enum CloudModel {
    public static let settingsChanged = Notification.Name("ScreenwriterCloudSettingsChanged")

    /// UserDefaults keys.
    public enum Keys {
        public static let provider = "cloud.provider"
        public static let model = "cloud.model"
        /// Whether a key has been saved, so launch never has to touch the Keychain (which can prompt and block).
        public static let hasKey = "cloud.hasKey"
        public static func consent(for documentKey: String) -> String { "cloud.consent." + documentKey }
    }

    public struct Availability: Sendable {
        public let available: Bool
        public let provider: String
        public let model: String?
        public let reason: String?
    }

    public struct CloudError: LocalizedError {
        public let message: String
        public var errorDescription: String? { message }
    }

    public static var provider: String { UserDefaults.standard.string(forKey: Keys.provider) ?? "gemini" }

    public static var model: String? {
        let value = UserDefaults.standard.string(forKey: Keys.model) ?? ""
        return value.isEmpty ? nil : value
    }

    public static func availability() -> Availability {
        guard UserDefaults.standard.bool(forKey: Keys.hasKey) else {
            return Availability(available: false, provider: provider, model: nil, reason: "Add a Gemini API key in Settings to read whole scripts.")
        }
        guard let model else {
            return Availability(available: false, provider: provider, model: nil, reason: "Choose a model in Settings.")
        }
        return Availability(available: true, provider: provider, model: model, reason: nil)
    }

    /// One answer from the configured cloud model.
    public static func respond(instructions: String, prompt: String, json: Bool) async throws -> String {
        guard let model else { throw CloudError(message: "Choose a model in Settings.") }
        // The Keychain read stays off the main thread: it can prompt, and must never freeze the window.
        let key = await Task.detached { Keychain.load(GeminiClient.keychainAccount) }.value
        guard let key, !key.isEmpty else {
            UserDefaults.standard.set(false, forKey: Keys.hasKey)
            NotificationCenter.default.post(name: settingsChanged, object: nil)
            throw CloudError(message: "Add a Gemini API key in Settings.")
        }
        return try await GeminiClient(apiKey: key).generate(model: model, instructions: instructions, prompt: prompt, json: json)
    }

    /// Store or clear the key; an empty string removes it.
    public static func saveKey(_ key: String) -> Bool {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        let ok: Bool
        if trimmed.isEmpty {
            ok = Keychain.delete(GeminiClient.keychainAccount)
        } else {
            ok = Keychain.save(trimmed, account: GeminiClient.keychainAccount)
        }
        UserDefaults.standard.set(ok && !trimmed.isEmpty, forKey: Keys.hasKey)
        NotificationCenter.default.post(name: settingsChanged, object: nil)
        return ok
    }

    /// Ask once per document before its text leaves the Mac.
    @MainActor
    public static func confirmSending(documentKey: String?, title: String) -> Bool {
        if let documentKey, UserDefaults.standard.bool(forKey: Keys.consent(for: documentKey)) { return true }
        let alert = NSAlert()
        alert.messageText = "Send “\(title)” to Google Gemini?"
        alert.informativeText = "The whole script is sent to Google with your API key so the model can read it. Google's API terms apply. Nothing is sent for the on-device features."
        alert.addButton(withTitle: "Send")
        alert.addButton(withTitle: "Cancel")
        if documentKey != nil {
            alert.showsSuppressionButton = true
            alert.suppressionButton?.title = "Don't ask again for this script"
        }
        let response = alert.runModal()
        guard response == .alertFirstButtonReturn else { return false }
        if let documentKey, alert.suppressionButton?.state == .on {
            UserDefaults.standard.set(true, forKey: Keys.consent(for: documentKey))
        }
        return true
    }
}

/// Generic-password storage in the login keychain.
public enum Keychain {
    static let service = "com.lucaswhelan.screenwriter"

    public static func save(_ value: String, account: String) -> Bool {
        delete(account)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: Data(value.utf8)
        ]
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    public static func load(_ account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    public static func delete(_ account: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        return SecItemDelete(query as CFDictionary) == errSecSuccess
    }
}

/// Google's Gemini API (generativelanguage.googleapis.com, v1beta).
public struct GeminiClient {
    public static let keychainAccount = "gemini-api-key"
    public static let keyPage = URL(string: "https://aistudio.google.com/apikey")!
    static let base = URL(string: "https://generativelanguage.googleapis.com/v1beta/")!

    public struct Model: Identifiable, Hashable, Sendable {
        /// The API name without the `models/` prefix, e.g. `gemini-2.5-flash`.
        public let id: String
        public let displayName: String
    }

    let apiKey: String

    public init(apiKey: String) {
        self.apiKey = apiKey
    }

    /// Models that can generate text, newest first.
    public func listModels() async throws -> [Model] {
        var request = URLRequest(url: GeminiClient.base.appendingPathComponent("models").appending(queryItems: [URLQueryItem(name: "pageSize", value: "200")]))
        request.setValue(apiKey, forHTTPHeaderField: "x-goog-api-key")
        let (data, response) = try await URLSession.shared.data(for: request)
        try GeminiClient.check(response, data)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any], let models = root["models"] as? [[String: Any]] else {
            throw CloudModel.CloudError(message: "Unexpected answer from Google.")
        }
        let usable = models.compactMap { entry -> Model? in
            guard let name = entry["name"] as? String, (entry["supportedGenerationMethods"] as? [String] ?? []).contains("generateContent") else { return nil }
            let id = name.hasPrefix("models/") ? String(name.dropFirst(7)) : name
            return Model(id: id, displayName: entry["displayName"] as? String ?? id)
        }
        return usable.sorted { GeminiClient.rank($0.id) > GeminiClient.rank($1.id) }
    }

    /// The model to suggest: the newest general-purpose Flash.
    public static func preferredModel(_ models: [Model]) -> Model? {
        let general = models.filter { isGeneralPurpose($0.id) }
        let flash = general.filter { $0.id.contains("flash") }
        return flash.first ?? general.first ?? models.first
    }

    static func isGeneralPurpose(_ id: String) -> Bool {
        let unwanted = ["lite", "tts", "image", "embed", "exp", "8b", "live", "audio", "native", "robotics", "computer", "thinking", "vision", "learnlm", "gemma", "aqa", "imagen", "veo"]
        return id.hasPrefix("gemini") && !unwanted.contains { id.contains($0) }
    }

    /// Sort key: version number first, stable releases before previews.
    static func rank(_ id: String) -> Double {
        var version = 0.0
        if let match = id.range(of: #"gemini-(\d+(\.\d+)?)"#, options: .regularExpression) {
            let digits = id[match].dropFirst(7)
            version = Double(digits) ?? 0
        }
        let preview = id.contains("preview") || id.contains("exp") ? 0.0 : 0.01
        return version + preview
    }

    /// One completion. `json` asks for a JSON object as the whole answer.
    public func generate(model: String, instructions: String, prompt: String, json: Bool) async throws -> String {
        var request = URLRequest(url: GeminiClient.base.appendingPathComponent("models/\(model):generateContent"))
        request.httpMethod = "POST"
        request.timeoutInterval = 180
        request.setValue(apiKey, forHTTPHeaderField: "x-goog-api-key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var generation: [String: Any] = ["temperature": 0.3]
        if json { generation["responseMimeType"] = "application/json" }
        // Scripts contain fights, threats and worse; let the model read them.
        let safety = ["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"].map {
            ["category": $0, "threshold": "BLOCK_NONE"]
        }
        let body: [String: Any] = [
            "system_instruction": ["parts": [["text": instructions]]],
            "contents": [["role": "user", "parts": [["text": prompt]]]],
            "generationConfig": generation,
            "safetySettings": safety
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        try GeminiClient.check(response, data)
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw CloudModel.CloudError(message: "Unexpected answer from Google.")
        }
        if let feedback = root["promptFeedback"] as? [String: Any], let reason = feedback["blockReason"] as? String {
            throw CloudModel.CloudError(message: "Google declined to read this script (\(reason)).")
        }
        guard let candidates = root["candidates"] as? [[String: Any]], let first = candidates.first else {
            throw CloudModel.CloudError(message: "Google returned no answer.")
        }
        let parts = ((first["content"] as? [String: Any])?["parts"] as? [[String: Any]]) ?? []
        let text = parts.compactMap { part -> String? in
            if part["thought"] as? Bool == true { return nil }
            return part["text"] as? String
        }.joined()
        if text.isEmpty {
            let reason = first["finishReason"] as? String ?? "no text"
            throw CloudModel.CloudError(message: "Google returned no text (\(reason)).")
        }
        return text
    }

    static func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard !(200...299).contains(http.statusCode) else { return }
        var message = "Google answered with HTTP \(http.statusCode)."
        if let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let error = root["error"] as? [String: Any], let detail = error["message"] as? String {
            message = detail
        }
        switch http.statusCode {
        case 400 where message.lowercased().contains("api key"): message = "Google rejected the API key. Check it in Settings."
        case 401, 403: message = "Google rejected the API key. Check it in Settings."
        case 429: message = "Google is rate-limiting this key. Try again in a moment."
        default: break
        }
        throw CloudModel.CloudError(message: message)
    }
}
