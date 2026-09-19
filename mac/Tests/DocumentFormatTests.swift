import XCTest
import UniformTypeIdentifiers
@testable import Pica

final class DocumentFormatTests: XCTestCase {
    private let workspace = Data(#"{"format":"screenplay","version":1,"title":"Test","content":{"type":"doc","content":[{"type":"action"}]},"beats":{"beats":[{"title":"Test beat"}]},"room":{"messages":[{"role":"user","text":"Test conversation"}]}}"#.utf8)
    private let fdx = Data(#"<?xml version="1.0"?><FinalDraft DocumentType="Script"><Content><Paragraph Type="Action"><Text>Test action.</Text></Paragraph></Content></FinalDraft>"#.utf8)

    func testNativeWorkspacePreservesAllBytes() throws {
        let document = try ScriptDocument(data: workspace, contentType: .picaDocument)
        XCTAssertEqual(document.format, "screenplay")
        XCTAssertFalse(document.recoveredWorkspace)
        XCTAssertEqual(try document.dataForWriting(contentType: .picaDocument), workspace)
    }

    func testMislabeledAndLegacyWorkspacesKeepBeatsAndConversation() throws {
        for type in [UTType.finalDraft, .screenplayScript, .plainText] {
            let document = try ScriptDocument(data: workspace, contentType: type)
            XCTAssertTrue(document.recoveredWorkspace)
            XCTAssertEqual(try document.dataForWriting(contentType: .picaDocument), workspace)
            XCTAssertThrowsError(try document.dataForWriting(contentType: type))
        }
    }

    func testForeignFormatsCannotBeWrittenBeforeConversion() throws {
        for (data, type) in [(fdx, UTType.finalDraft), (Data("INT. ROOM - DAY".utf8), .fountain), (Data("%PDF-test".utf8), .pdf)] {
            let document = try ScriptDocument(data: data, contentType: type)
            XCTAssertThrowsError(try document.dataForWriting(contentType: .picaDocument))
            XCTAssertThrowsError(try document.dataForWriting(contentType: type))
        }
    }

    func testNativeDataCannotBeWrittenAsFDXOrAnotherImportType() throws {
        let document = try ScriptDocument(data: workspace, contentType: .picaDocument)
        for type in [UTType.finalDraft, .fountain, .plainText, .pdf, .screenplayScript] {
            XCTAssertThrowsError(try document.dataForWriting(contentType: type))
        }
    }

    func testInvalidNativeDocumentsAreRejectedWithoutConversion() {
        for data in [Data("{broken".utf8), Data("{}".utf8), fdx,
                     Data(#"{"format":"screenplay","version":999,"content":{}}"#.utf8)] {
            XCTAssertThrowsError(try ScriptDocument(data: data, contentType: .picaDocument))
        }
    }

    func testFDXExportRejectsWorkspaceJSONAndOtherXML() throws {
        try ScriptExport.validateFDX(fdx)
        XCTAssertThrowsError(try ScriptExport.validateFDX(workspace))
        XCTAssertThrowsError(try ScriptExport.validateFDX(Data("<SomethingElse/>".utf8)))
    }

    func testNativeAndImportDocumentTypesAreSeparate() {
        XCTAssertEqual(ScriptDocument.readableContentTypes, [.picaDocument])
        XCTAssertEqual(ScriptDocument.writableContentTypes, [.picaDocument])
        XCTAssertTrue(ScriptImportDocument.writableContentTypes.isEmpty)
        XCTAssertTrue(ScriptImportDocument.readableContentTypes.contains(.finalDraft))
        XCTAssertTrue(ScriptImportDocument.readableContentTypes.contains(.screenplayScript))
        XCTAssertFalse(ScriptImportDocument.readableContentTypes.contains(.picaDocument))
    }
}
