import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    /// Our own file format: JSON with title page fields, the editor document and beats.
    static let screenplayScript = UTType(exportedAs: "com.lucaswhelan.screenplay", conformingTo: .json)
    static let finalDraft = UTType(importedAs: "com.finaldraft.fdx", conformingTo: .xml)
    static let fountain = UTType(importedAs: "com.lucaswhelan.fountain", conformingTo: .plainText)
}

extension ScriptLoad {
    /// PDFs travel to the page as base64; everything else as text.
    init(document: ScriptDocument, title: String) {
        if document.format == "pdf" {
            self.init(text: document.data.base64EncodedString(), format: "pdf", title: title)
        } else {
            self.init(text: String(decoding: document.data, as: UTF8.self), format: document.format, title: title)
        }
    }
}

/// A script on disk. The web editor parses and serializes; this holds the
/// bytes and knows which reader the page should use.
struct ScriptDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.screenplayScript, .finalDraft, .fountain, .pdf, .plainText] }
    static var writableContentTypes: [UTType] { [.screenplayScript] }

    var data: Data
    /// `screenplay`, `fdx`, `fountain`, `pdf` or `txt`.
    var format: String

    var text: String {
        get { String(decoding: data, as: UTF8.self) }
        set { data = Data(newValue.utf8) }
    }

    init(text: String = "", format: String = "screenplay") {
        self.data = Data(text.utf8)
        self.format = format
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        self.data = data
        let type = configuration.contentType
        let head = String(decoding: data.prefix(64), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        if type.conforms(to: .pdf) || head.hasPrefix("%PDF") {
            format = "pdf"
        } else if type.conforms(to: .screenplayScript) || head.hasPrefix("{") {
            format = "screenplay"
        } else if type.conforms(to: .finalDraft) || head.hasPrefix("<") {
            format = "fdx"
        } else if type.conforms(to: .fountain) {
            format = "fountain"
        } else {
            format = "txt"
        }
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
