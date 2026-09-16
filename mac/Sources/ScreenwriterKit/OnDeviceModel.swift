import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Apple's on-device language model (Apple Intelligence), used for
/// scene-scoped writer tools. Nothing leaves the Mac. The framework only
/// exists on macOS 26, so every call is guarded and the app still runs
/// without it.
public enum OnDeviceModel {
    public struct Availability: Sendable {
        public let available: Bool
        /// Why the model cannot be used, in the writer's terms.
        public let reason: String?
    }

    public struct ModelError: LocalizedError {
        public let message: String
        public var errorDescription: String? { message }
    }

    public static func availability() -> Availability {
        #if canImport(FoundationModels)
        if #available(macOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                return Availability(available: true, reason: nil)
            case .unavailable(let reason):
                return Availability(available: false, reason: describe(reason))
            }
        }
        #endif
        return Availability(available: false, reason: "Needs macOS 26 with Apple Intelligence.")
    }

    /// One answer from a fresh session: requests are independent, so no
    /// context carries over between them.
    public static func respond(instructions: String, prompt: String) async throws -> String {
        #if canImport(FoundationModels)
        if #available(macOS 26.0, *) {
            let session = LanguageModelSession(instructions: instructions)
            do {
                let response = try await session.respond(to: prompt)
                return response.content
            } catch let error as LanguageModelSession.GenerationError {
                throw ModelError(message: describe(error))
            }
        }
        #endif
        throw ModelError(message: "Needs macOS 26 with Apple Intelligence.")
    }

    #if canImport(FoundationModels)
    @available(macOS 26.0, *)
    private static func describe(_ reason: SystemLanguageModel.Availability.UnavailableReason) -> String {
        switch reason {
        case .deviceNotEligible: "This Mac can't run Apple Intelligence."
        case .appleIntelligenceNotEnabled: "Turn on Apple Intelligence in System Settings to draft on this Mac."
        case .modelNotReady: "Apple Intelligence is still downloading its model. Try again in a while."
        @unknown default: "Apple Intelligence isn't available right now."
        }
    }

    @available(macOS 26.0, *)
    private static func describe(_ error: LanguageModelSession.GenerationError) -> String {
        switch error {
        case .guardrailViolation: "Apple's on-device model declined this text."
        case .exceededContextWindowSize: "This scene is too long for the on-device model."
        case .unsupportedLanguageOrLocale: "The on-device model doesn't support this language."
        case .rateLimited: "The on-device model is busy. Try again in a moment."
        case .assetsUnavailable: "Apple Intelligence is still downloading its model."
        default: error.localizedDescription
        }
    }
    #endif
}
