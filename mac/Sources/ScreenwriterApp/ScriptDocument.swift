import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    /// The complete Pica workspace; the old .screenplay type remains readable.
    static let picaDocument = UTType(exportedAs: "com.lucaswhelan.pica.document", conformingTo: .json)
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
    static var readableContentTypes: [UTType] { [.picaDocument] }
    static var writableContentTypes: [UTType] { [.picaDocument] }

    var data: Data
    /// `screenplay`, `fdx`, `fountain`, `pdf` or `txt`.
    var format: String
    /// Shown until an imported or legacy workspace is saved as a .pica document.
    var recoveredWorkspace = false
    var importedTitle: String?

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
        try self.init(data: data, contentType: configuration.contentType)
        if let name = configuration.file.preferredFilename ?? configuration.file.filename {
            importedTitle = URL(fileURLWithPath: name).deletingPathExtension().lastPathComponent
        }
    }

    /// Identify native workspaces by their contents, including old mislabeled FDX files.
    init(data: Data, contentType type: UTType) throws {
        self.data = data
        let head = String(decoding: data.prefix(64), as: UTF8.self)
            .trimmingCharacters(in: .whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{feff}")))
        if type == .picaDocument || type == .screenplayScript || head.hasPrefix("{") {
            try Self.validateWorkspace(data)
            format = "screenplay"
            recoveredWorkspace = type != .picaDocument
            return
        }
        if type.conforms(to: .pdf) || head.hasPrefix("%PDF") {
            format = "pdf"
        } else if type.conforms(to: .finalDraft) || head.hasPrefix("<") {
            format = "fdx"
        } else if type.conforms(to: .fountain) {
            format = "fountain"
        } else {
            format = "txt"
        }
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: try dataForWriting(contentType: configuration.contentType))
    }

    /// Defense in depth: an import must be converted and saved as a native workspace.
    func dataForWriting(contentType: UTType) throws -> Data {
        guard contentType == .picaDocument else { throw PicaFileError.nativeSaveRequired }
        guard format == "screenplay" else { throw PicaFileError.importNotReady }
        try Self.validateWorkspace(data)
        return data
    }

    private static func validateWorkspace(_ data: Data) throws {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              object["format"] as? String == "screenplay",
              object["version"] as? Int == 1,
              object["content"] is [String: Any] || object["content"] is String else {
            throw PicaFileError.invalidWorkspace
        }
    }
}

/// Read-only source documents have no save path. Editing always happens in a
/// separate ScriptDocument created through SwiftUI's newDocument action.
struct ScriptImportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.screenplayScript, .finalDraft, .fountain, .pdf, .plainText] }
    static var writableContentTypes: [UTType] { [] }

    let workspace: ScriptDocument

    init(configuration: ReadConfiguration) throws {
        workspace = try ScriptDocument(configuration: configuration)
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        throw PicaFileError.nativeSaveRequired
    }
}

enum PicaFileError: LocalizedError {
    case nativeSaveRequired, importNotReady, invalidWorkspace

    var errorDescription: String? {
        switch self {
        case .nativeSaveRequired: "Save your workspace as a .pica document. Use Export > Final Draft to create an FDX copy."
        case .importNotReady: "The script has not finished importing. Wait for it to appear before saving."
        case .invalidWorkspace: "This file is not a supported Pica workspace, or its contents are damaged. The original file has not been changed."
        }
    }
}
