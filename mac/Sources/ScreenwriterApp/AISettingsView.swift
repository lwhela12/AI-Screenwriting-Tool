import SwiftUI

/// Settings > AI: the Gemini key (kept in the Keychain) and the model to use.
struct AISettingsView: View {
    @AppStorage(CloudModel.Keys.model) private var model = ""
    @State private var key = ""
    @State private var models: [GeminiClient.Model] = []
    @State private var status = ""
    @State private var checking = false

    var body: some View {
        Form {
            Section {
                SecureField("API key", text: $key)
                    .textContentType(.password)
                HStack {
                    Button("Save key") { saveKey() }
                    Button(checking ? "Checking…" : "Check connection") { Task { await check() } }
                        .disabled(checking || key.trimmingCharacters(in: .whitespaces).isEmpty)
                    Spacer()
                    Link("Get a key…", destination: GeminiClient.keyPage)
                }
                if models.isEmpty {
                    TextField("Model", text: $model, prompt: Text("gemini-2.5-flash"))
                } else {
                    Picker("Model", selection: $model) {
                        ForEach(models) { m in
                            Text("\(m.displayName)  ·  \(m.id)").tag(m.id)
                        }
                    }
                }
                if !status.isEmpty {
                    Text(status)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            } header: {
                Text("Google Gemini")
            } footer: {
                Text("Reads whole scripts for the continuity report. A free key from Google AI Studio is enough for normal use. The key stays in your Keychain, and a script is only sent after you confirm it.")
            }
            Section("On this Mac") {
                let device = OnDeviceModel.availability()
                Text(device.available ? "Apple Intelligence is on. Scene synopses are drafted on this Mac and never leave it." : (device.reason ?? "Apple Intelligence is not available."))
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 520)
        .task {
            // Loaded here, on demand, never at launch.
            let stored = await Task.detached { Keychain.load(GeminiClient.keychainAccount) }.value
            if let stored { key = stored }
        }
        .onChange(of: model) { _, _ in NotificationCenter.default.post(name: CloudModel.settingsChanged, object: nil) }
    }

    private func saveKey() {
        if CloudModel.saveKey(key) {
            status = key.trimmingCharacters(in: .whitespaces).isEmpty ? "Key removed." : "Key saved to your Keychain."
        } else {
            status = "The key could not be saved to the Keychain."
        }
    }

    private func check() async {
        checking = true
        defer { checking = false }
        saveKey()
        do {
            let found = try await GeminiClient(apiKey: key.trimmingCharacters(in: .whitespacesAndNewlines)).listModels()
            models = found
            if model.isEmpty || !found.contains(where: { $0.id == model }), let preferred = GeminiClient.preferredModel(found) {
                model = preferred.id
            }
            status = "Connected. \(found.count) models available; using \(model)."
        } catch {
            status = error.localizedDescription
        }
        NotificationCenter.default.post(name: CloudModel.settingsChanged, object: nil)
    }
}
