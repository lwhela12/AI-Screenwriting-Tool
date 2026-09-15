# AI‑Integrated Screenwriting Tool

This repository contains the source code for an open‑source screenwriting application inspired by **Final Draft 13**.  It provides professional screenplay formatting, planning tools such as a beat board and outline editor, real‑time collaboration and AI‑assisted writing features.

## Structure

- **client** – the editor and every feature (React, ProseMirror, the pagination engine, importers and exporters). Runs in a browser for development and inside the Mac app.
- **mac** – the native macOS shell: a document-based SwiftUI app hosting the editor in a web view. Scripts are files on disk.

There is no server: the app owns files, and the browser build keeps scripts in the browser's own storage while developing.

## Features

- **Automatic screenplay formatting** – Scene headings, character names and dialogue are recognized and formatted automatically, using an intuitive plain‑text syntax.
- **Beat Board & Outline Editor** – A visual canvas for organizing beats and a hierarchical outline with customizable lanes.  Supports drag‑and‑drop, color‑coded structure lines and flow lines.
- **ScriptNotes and Revision Mode** – Add notes anywhere in your script or beat board, track changes and mark revisions with colors.
- **Real‑Time Collaboration** – Multiple writers can work on the same project simultaneously.  User presence and chat are included.
- **Writing Metrics** – Set goals, run sprint timers and view statistics about scene length, character dialogue and more.
- **Import/Export** – Open and save files in Fountain, Final Draft (FDX) and PDF formats.  Tag props and locations for production reports.
- **AI Assistance** – An optional AI service provides context‑aware suggestions, dialogue auto‑completion and story analysis.

For a full description of the planned architecture and feature roadmap, see **design_document.md**.

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

The **Scenes** panel beside the script lists every scene with its page and length. Click a scene to jump to it, drag to reorder scenes (the pages move with them), expand a scene to write its synopsis, which is stored with the scene and exports to Final Draft.

The **Outline** tab shows the same scenes as index cards: heading, synopsis, cast, page and length, a colour, and structure labels (Act One, Midpoint…) between cards. Drag a card to reorder the script, add or delete scenes, and open any scene in the editor. The **Beat Board** is a freeform canvas of ideas: double-click to add a beat, drag to arrange, and send a beat into the script as a new scene with the beat's text as its synopsis.

The title page is the first sheet above the script; click any field to edit it. When a character speaks again after only action, the cue gets an automatic `(CONT'D)`, computed from the script so it stays right as you edit. Typing `(` in a character cue offers the standard extensions (V.O., O.S., …).

The **Reports** tab gives a character report (scenes, speeches, words, share of dialogue, first and last scene), a scene report (page, length, INT/EXT, time, cast), a who-is-in-which-scene matrix, and dialogue statistics, with CSV download.

Scripts can be imported from the project screen (**Import script…**): Final Draft `.fdx`, Fountain `.fountain`, PDF, or plain text. PDF import reads the text layer and recovers elements from their indents, rejoining speeches split across pages; check cues and headings after importing a PDF from an unusual template. Final Draft files Scene numbers, synopses, dual dialogue, centered text, page breaks, bold/italic/underline and the title page are preserved, and the FDX export writes them back. Fountain import understands sections (structure labels), synopses, scene numbers, forced elements, dual dialogue and emphasis, and Fountain export writes them all.

Run the editor tests with `cd client && npm test`.

## macOS App

The native Mac app lives in `mac/`: a SwiftUI document-based shell around the same web editor, built with XcodeGen and Xcode. Scripts are files on disk (`.screenplay`, our JSON format), and Final Draft `.fdx`, Fountain and plain-text files open directly.

```bash
cd mac
./build-app.sh              # builds client/ and Screenwriter.app into mac/.build
./build-app.sh --install    # also copies it to /Applications
./build-app.sh --check path/to/script.fdx   # verifies WebKit wraps every line exactly as the pagination engine does
```

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
