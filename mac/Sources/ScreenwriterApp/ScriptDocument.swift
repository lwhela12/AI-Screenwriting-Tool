import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    /// Our own file format: JSON with title page fields, the editor document and beats.
    static let screenplayScript = UTType(exportedAs: "com.lucaswhelan.screenplay", conformingTo: .json)
    static let finalDraft = UTType(importedAs: "com.finaldraft.fdx", conformingTo: .xml)
    static let fountain = UTType(importedAs: "com.lucaswhelan.fountain", conformingTo: .plainText)
}

/// A script on disk. The web editor parses and serializes; this holds the
/// bytes and knows which reader the page should use.
struct ScriptDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.screenplayScript, .finalDraft, .fountain, .plainText] }
    static var writableContentTypes: [UTType] { [.screenplayScript] }

    var text: String
    /// `screenplay`, `fdx`, `fountain` or `txt`.
    var format: String

    init(text: String = "", format: String = "screenplay") {
        self.text = text
        self.format = format
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        text = String(decoding: data, as: UTF8.self)
        let type = configuration.contentType
        if type.conforms(to: .screenplayScript) {
            format = "screenplay"
        } else if type.conforms(to: .finalDraft) || text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("<") {
            format = "fdx"
        } else if type.conforms(to: .fountain) {
            format = "fountain"
        } else if text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("{") {
            format = "screenplay"
        } else {
            format = "txt"
        }
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: Data(text.utf8))
    }
}
