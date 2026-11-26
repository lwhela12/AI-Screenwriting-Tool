import Sparkle
import SwiftUI

/// Sparkle checks the appcast on the latest GitHub release for a newer,
/// signed and notarized Pica, and installs it when the writer agrees.
///
/// Builds without a public EdDSA key (development builds, and any build made
/// before the key is added to project.yml) never start the updater, so they
/// cannot be offered an update they could not verify.
enum Updates {
    static var isConfigured: Bool {
        let info = Bundle.main.infoDictionary ?? [:]
        let key = (info["SUPublicEDKey"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let feed = info["SUFeedURL"] as? String ?? ""
        return !key.isEmpty && !key.hasPrefix("$(") && URL(string: feed)?.scheme == "https"
    }

    static func makeController() -> SPUStandardUpdaterController {
        SPUStandardUpdaterController(startingUpdater: isConfigured, updaterDelegate: nil, userDriverDelegate: nil)
    }
}

/// Mirrors the updater's own readiness so the menu item is disabled while a
/// check is already running, or when the updater was never started.
final class UpdateAvailability: ObservableObject {
    @Published var canCheckForUpdates = false

    init(updater: SPUUpdater) {
        updater.publisher(for: \.canCheckForUpdates)
            .assign(to: &$canCheckForUpdates)
    }
}

/// Pica > Check for Updates…
struct CheckForUpdatesButton: View {
    @ObservedObject private var availability: UpdateAvailability
    private let updater: SPUUpdater

    init(updater: SPUUpdater) {
        self.updater = updater
        availability = UpdateAvailability(updater: updater)
    }

    var body: some View {
        Button("Check for Updates…", action: updater.checkForUpdates)
            .disabled(!availability.canCheckForUpdates)
    }
}
