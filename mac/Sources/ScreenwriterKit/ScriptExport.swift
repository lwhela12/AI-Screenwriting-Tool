import Foundation

/// Check the format at the native write boundary, before presenting an FDX export.
enum ScriptExport {
    static func validateFDX(_ data: Data) throws {
        let document = try XMLDocument(data: data, options: .nodeLoadExternalEntitiesNever)
        guard document.rootElement()?.name == "FinalDraft" else {
            throw CocoaError(.fileWriteInapplicableStringEncoding,
                             userInfo: [NSLocalizedDescriptionKey: "This export is not a Final Draft document. No file was written."])
        }
    }
}
