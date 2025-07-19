# Hollywood Screenplay Formatting Specification

This markdown document defines the **Hollywood screenplay formatting rules** to be implemented in an auto-formatting system for screenwriting software. It is structured as a technical specification suitable for software developers.

## Page & Typography Setup

- **Font:** Courier or Courier New
- **Font Size:** 12pt
- **Line Spacing:** Single-spaced with blank lines between elements
- **Paper Size:** US Letter (8.5" x 11")
- **Top/Bottom/Right Margin:** 1 inch
- **Left Margin:** 1.5 inches
- **Lines/Page:** Target ~55 lines per page
- **Page Numbers:**
  - No page number on title page or page 1
  - Starting page 2: Top-right corner, e.g. `2.`

## Title Page Format

- **Centered Title** (ALL CAPS), slightly above vertical center
- **Byline**: `Written by` or `By` centered below title
- **Author Name** centered below byline
- **Contact Info**: Bottom-left corner (address, phone, email, optional WGA #)

## Scene Headings (Sluglines)

- **Format:** `INT.` or `EXT.` + LOCATION + `–` + TIME
- **Text Case:** ALL CAPS
- **Alignment:** Left-aligned (no indent)
- **Spacing:** Blank line before and after
- **Scene Numbers:**
  - Omitted in spec script
  - Optional in shooting script: e.g., `1.` before slugline or `(1)` at right

## Action Lines

- **Alignment:** Left-aligned at content margin (1.5")
- **Text Case:** Sentence case, with selective ALL CAPS for:
  - First appearance of characters
  - Key sounds (e.g. **GUNSHOT**)
  - Key props/visuals (e.g. **THE LETTER**)
- **Tense:** Present
- **Spacing:** Blank line before/after as needed

## Character Cues

- **Text Case:** ALL CAPS
- **Alignment:** Starts ~3.7 inches from page left (2.2" from content margin)
- **Extensions:** (V.O.), (O.S.), (CONT'D) in CAPS within parentheses
- **Spacing:** Blank line before cue, unless directly after a scene heading

## Dialogue

- **Alignment:** Starts ~2.5 inches from page left
- **Width:** ~3.5" to 4" wide
- **Justification:** Left-aligned
- **Line Wrapping:** Soft wrap within margins
- **Spacing:**
  - Single-spaced within block
  - Blank line after block
- **Page Breaks:**
  - Insert `(MORE)` centered at page bottom
  - Insert `(CONT’D)` on next page's character cue

## Parentheticals (Wrylies)

- **Alignment:** ~3.0 inches from page left (0.5" more than dialogue)
- **Text Case:** Lowercase unless proper noun
- **Formatting:** Enclosed in parentheses, no punctuation inside unless needed
- **Use:** Short and sparse, never full sentences

## Transitions

- **Common:** `CUT TO:`, `DISSOLVE TO:`, `FADE OUT.`
- **Text Case:** ALL CAPS
- **Alignment:** Flush right (~6.0" from page left)
- **Spacing:** Blank line before, blank line after if followed by slugline

## Specialized Elements

### Dual Dialogue (Split Dialogue)
- Two characters speaking simultaneously
- **Displayed:** Side-by-side columns
- **Indentation:** Same as dialogue blocks, adjusted for page width

### Shots
- **Examples:** `CLOSE ON`, `ANGLE ON`, `POV:`
- **Formatting:** ALL CAPS, left-aligned like action

### Montages
- **Heading:** `MONTAGE – DESCRIPTION` or `SERIES OF SHOTS:`
- **List Format:**
  - Dash-prefixed lines, or
  - Lettered shots (A., B., C.)
- **Alignment:** Left-aligned under montage heading

### Superimposed Text
- **Format:** `SUPER:` or `TITLE:` in action
- **Display:** Text in quotes, sometimes centered

### Dialogue Extensions
- Auto-add `(CONT'D)` for resumed character
- Auto-insert `(MORE)` when dialogue spans pages

### Act Breaks (TV)
- **Heading:** `ACT ONE`, `ACT TWO`, etc. (centered, all caps)
- **New Page:** Each act typically starts on a new page

## Optional Formats

### Shooting Script Mode
- **Adds:**
  - Scene numbers
  - Camera directions (optional)
  - Transitions for all scene changes

### Multi-Cam TV Format
- **Dialogue:** Character name followed by colon
- **Stage Directions:** ALL CAPS, possibly underlined
- **Act/Scene Headings:** `SCENE A`, `SCENE B`, etc.

### Stage Play Format
- **Character Names:** Centered, ALL CAPS
- **Dialogue:** Left-indented under name
- **Stage Directions:** Italicized and/or parenthetical, centered or indented
- **Acts/Scenes:** Clearly labeled and centered

## Parsing & Element Detection Logic

Implement logic to classify text input into these elements using patterns:

- **Scene Heading:** Starts with `INT.`, `EXT.`, or `INT./EXT.`
- **Transition:** Ends with `TO:` or equals `FADE OUT.`
- **Character Cue:** ALL CAPS line followed by dialogue or parenthetical
- **Parenthetical:** Line between character and dialogue, in `()`
- **Dialogue:** Follows character cue, within dialogue margins
- **Action Line:** Default fallback for any text not matching above, flush left

---

By following these rules, the software can generate properly formatted scripts that meet professional standards for film, TV, and animation.

