# Pica

Pica is a screenwriting app for the Mac: Courier 12 on a US Letter page, and nothing leaves the machine. A pica is twelve points, and Courier 12 on a typewriter is pica type, ten characters to the inch; the app is named for the page it reproduces. It provides screenplay formatting that matches **Final Draft** line for line, planning tools such as a beat board and outline editor, and AI help that breaks the story with you but never writes a line of the script.

## Structure

- **client** – the editor and every feature (React, ProseMirror, the pagination engine, importers and exporters). Runs in a browser for development and inside the Mac app.
- **mac** – the native macOS shell: a document-based SwiftUI app hosting the editor in a web view. Scripts are files on disk.

There is no server: the app owns files, and the browser build keeps scripts in the browser's own storage while developing.

## Features

- **The page is the page** – Real Courier on a US Letter sheet with Final Draft's margins; page breaks, (MORE) and (CONT'D) come from a pagination engine that matches Final Draft line for line.
- **Final Draft keystrokes** – Enter, Tab and ⌘1–8 move between elements the way Final Draft does; SmartType completes names, locations and times.
- **Scenes, outline and beat board** – A scene sidebar and inspector (synopsis, cast, structure label, colour), index cards in act lanes, and a freeform beat board whose cards can become scenes.
- **Reports** – Character, scene and dialogue statistics, and a who-is-in-which-scene matrix, all live, with CSV export.
- **Import and export** – Opens Final Draft `.fdx`, Fountain, PDF and plain text; exports PDF, `.fdx`, Fountain and text.
- **Find and replace, focus mode, three themes** – Paper, Sepia and Midnight (dark page under the dark theme).
- **On this Mac, drafting help** – With Apple Intelligence on, the app drafts scene synopses on the Mac's own model, one scene at a time or for every scene that has none. Nothing leaves the machine.
- **Writers' Room** – Break the story with a model that has read the script, the outline and the beat board. It talks first: where the story is going, the arc, what is thin. When you are ready, Lay out the beats puts the story on the beat board as cards (each with the scenes that carry it, and gaps the script does not have yet marked), and the board opens beside the chat so you can move cards while you talk; the room reads your arrangement and edits its own cards by label, never deleting one. Break into scenes then turns the beats into scene proposals for the outline. It knows the page count, where each scene starts and how long it runs, and where every page falls in the text, and a Format menu (feature, hour drama, half-hour comedy, limited series, short) tells it what shape and length to think in. It talks in your terms and proposes beats (or scenes, when asked) as cards; keep the ones you want, send them to the beat board or straight into the outline as scene headings with synopses, and write the scenes yourself. It never writes a line of the script. Modes: break the story, ask me questions, alternatives, pressure test. Bring a treatment (paste it, or import a Word document, PDF, plain text, Markdown or Fountain) and a fifth mode, plot the treatment, breaks it into scenes in order with headings and synopses at the density of a finished feature (fifteen or so a turn, picking up wherever the outline already reaches); send the ones you keep to the outline. Conversations are listed down the left, each named and summarised by a model (on this Mac when Apple Intelligence is on, otherwise Gemini) so you can pick one up again; they, the treatment and the format are saved in the script file.
- **Continuity report** – Reports > Continuity has a cloud model (Google Gemini, bring your own key) read the whole script and list what it establishes about each character and where the script contradicts itself, with the lines in question linked to their scenes. The key lives in the macOS Keychain; a script is sent only when you ask and only after you confirm, once per script.

## Editor Keystrokes

The script editor follows Final Draft's typing model. The document is a flat list of elements; every command acts on the element under the cursor.

| Key | Behaviour |
|---|---|
| **Enter** at end of element | Scene Heading → Action, Action → Action, Character → Dialogue, Parenthetical → Dialogue, Dialogue → Action, Transition → Scene Heading |
| **Enter** mid-element | Splits the element; both halves keep their type |
| **Enter** on an empty element | Opens the element menu (arrows, digits 1–7, or click) |
| **Tab** | Scene Heading: adds ` - ` for the time, then moves to Action. Action → Character, Character → Parenthetical, Parenthetical → Dialogue, Dialogue → Parenthetical, Transition → Scene Heading. An empty element is converted in place instead of creating a new one |
| **Shift-Tab** | Cycles the current element to the previous type |
| **Backspace** at start of element | Removes an empty element, or joins the text onto the previous element |
| **⌘1 – ⌘8** (Ctrl on Windows) | Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, Centered |
| **⌘⇧D** | Dual dialogue: prints the speech under the cursor beside the one before it (press again to separate) |
| **⌘F** | Find and replace (Enter/⌘G next, Shift-Enter/⇧⌘G previous, Esc closes; match case and whole word options; replacing inside a heading or cue keeps it capitalised) |
| **⌘S** | Save (autosave also runs three seconds after you stop typing) |

Auto-formatting only touches what you just typed: scene headings, character names and transitions are upper-cased as you type; `int.`/`ext.` at the start of an action line becomes a scene heading; a line ending in `TO:` becomes a transition; `> text <` becomes centered text; `(` in an empty dialogue element starts a parenthetical. SmartType suggests known characters, locations, times and transitions (Tab or Enter accepts, Escape dismisses).

Pagination reproduces Final Draft's screenplay template: 54 lines of 12pt Courier per page inside 1 inch margins (7pt character advance, 61 characters of action), two blank lines before scene headings, splits only after a complete sentence with the remainder re-wrapped, `(MORE)` and the `(CONT'D)` cue printed in the page margins as Final Draft does, at least two rows of a speech kept with its cue, dialogue that crosses a page gets `(MORE)` and a `NAME (CONT'D)` cue, scene headings and character cues are never stranded at the bottom of a page, action never leaves a single line behind, and transitions stay with what precedes them. The same engine drives the on-screen page gaps, the page counter, and the PDF export, so they always agree.

The **Scenes** panel beside the script lists every scene with its page and length. The highlight follows the cursor and the list scrolls to keep it in view. Click a scene to jump to it, drag to reorder scenes (the pages move with them). The synopsis is written in the inspector on the right (or drafted on-device), is stored with the scene, exports to Final Draft, and shows under the heading here.

The **Outline** tab shows the same scenes as index cards: heading, synopsis, cast, page and length, a colour, and structure labels (Act One, Midpoint…) between cards. Drag a card to reorder the script, add or delete scenes, and open any scene in the editor. The **Beat Board** is a freeform canvas of ideas: double-click to add a beat, drag to arrange, and send a beat into the script as a new scene with the beat's text as its synopsis.

The title page is the first sheet above the script; click any field to edit it. When a character speaks again after only action, the cue gets an automatic `(CONT'D)`, computed from the script so it stays right as you edit. Typing `(` in a character cue offers the standard extensions (V.O., O.S., …).

The **Reports** tab gives a character report (scenes, speeches, words, share of dialogue, first and last scene), a scene report (page, length, INT/EXT, time, cast), a who-is-in-which-scene matrix, and dialogue statistics, with CSV download.

Scripts can be imported from the project screen (**Import script…**): Final Draft `.fdx`, Fountain `.fountain`, PDF, or plain text. PDF import reads the text layer and recovers elements from their indents, rejoining speeches split across pages; check cues and headings after importing a PDF from an unusual template. Final Draft files Scene numbers, synopses, dual dialogue, centered text, page breaks, bold/italic/underline and the title page are preserved, and the FDX export writes them back. Fountain import understands sections (structure labels), synopses, scene numbers, forced elements, dual dialogue and emphasis, and Fountain export writes them all.

Run the editor tests with `cd client && npm test`.

## macOS App

The native Mac app lives in `mac/`: a SwiftUI document-based shell around the same web editor, built with XcodeGen and Xcode. Scripts are files on disk (`.screenplay`, our JSON format), and Final Draft `.fdx`, Fountain and plain-text files open directly.

```bash
cd mac
./build-app.sh              # builds client/ and Pica.app into mac/.build
./build-app.sh --install    # also copies it to /Applications
./build-app.sh --check path/to/script.fdx   # verifies WebKit wraps every line exactly as the pagination engine does
```

Settings (⌘,) holds the Gemini key and model: paste a key from Google AI Studio and pick a model from the menu of recent ones (Gemini 3.8 Flash by default). Check connection replaces the menu with the models your key can actually use. Views switch from the View menu or with ⌥⌘1–5. The on-device drafting features need macOS 26 with Apple Intelligence turned on; the app runs on macOS 15 and later without them. For development, `SCREENWRITER_DEBUG_JS='…'` in the environment runs a script in the page once the document has loaded.

## Quick Start

```bash
npm run install:all      # root + client dependencies
npm run dev              # the editor in a browser at http://localhost:3000 (scripts kept in browser storage)
npm test                 # the editor's test suite
npm run app:install      # build the Mac app and put it in /Applications (needs Xcode and XcodeGen)
```

## Contributing

We welcome contributions!  Please read **Agents.md** for guidelines on environment setup, coding standards and the development workflow.  Before starting work, review the open issues and the design document.  For major changes, open a discussion or issue first to ensure it aligns with the project roadmap.

## License

This project is released under the MIT License (or the license specified in `LICENSE`).  See the `LICENSE` file for details.
