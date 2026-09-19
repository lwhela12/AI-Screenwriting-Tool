import XCTest
@testable import Pica

final class RecentScriptsTests: XCTestCase {
    func testSavedWorkspacesComeBeforeImportsWithoutChangingEachGroupsRecency() {
        let urls = ["Newest.fdx", "Latest.pica", "Earlier.fountain", "Older.pica"].map { URL(fileURLWithPath: "/tmp/\($0)") }
        let recent = RecentScript.ordered(urls: urls, openedDates: [:])
        XCTAssertEqual(recent.map(\.title), ["Latest", "Older", "Newest", "Earlier"])
    }

    func testRepeatedPathsAreDeduplicatedAndNonFileURLsAreExcluded() {
        let urls = [URL(fileURLWithPath: "/tmp/Test.pica"), URL(fileURLWithPath: "/tmp/folder/../Test.pica"), URL(string: "https://example.com/Test.pica")!]
        XCTAssertEqual(RecentScript.ordered(urls: urls, openedDates: [:]).count, 1)
    }

    func testOpenDatesAreExplicitRatherThanGuessedFromFileModification() {
        let url = URL(fileURLWithPath: "/tmp/Script.pica")
        let date = Date(timeIntervalSince1970: 12345)
        XCTAssertEqual(RecentScript.ordered(urls: [url], openedDates: [url.path: date]).first?.lastOpened, date)
        XCTAssertNil(RecentScript.ordered(urls: [url], openedDates: [:]).first?.lastOpened)
    }

    func testLabelsDistinguishWorkingFilesAndImportedCopies() {
        let native = RecentScript(url: URL(fileURLWithPath: "/tmp/Stories/Story.PICA"), lastOpened: nil)
        let imported = RecentScript(url: URL(fileURLWithPath: "/tmp/Stories/Story.fdx"), lastOpened: nil)
        XCTAssertEqual(native.title, "Story")
        XCTAssertEqual(native.location, "Stories")
        XCTAssertTrue(native.isWorkspace)
        XCTAssertEqual(native.kind, "Pica workspace")
        XCTAssertFalse(imported.isWorkspace)
        XCTAssertEqual(imported.kind, "Final Draft · imports a copy")
    }

    func testMissingFilesRemainAvailableToLocateInsteadOfSilentlyDisappearing() {
        let url = URL(fileURLWithPath: "/nonexistent/Archived.pica")
        XCTAssertEqual(RecentScript.ordered(urls: [url], openedDates: [:]).first?.url, url)
    }
}
