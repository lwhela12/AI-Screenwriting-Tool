# Hollywood-Standard Auto-Formatting Guide

## Overview

The AI Screenwriting Tool now includes comprehensive auto-formatting features that match professional tools like Final Draft 13. These features automatically format your screenplay as you type, following Hollywood industry standards.

## Key Features

### 1. Smart Element Detection

The editor automatically detects and formats screenplay elements as you type:

- **Scene Headings**: Start with INT., EXT., or EST.
- **Character Names**: ALL CAPS text (up to 35 characters)
- **Dialogue**: Automatically formatted after character names
- **Parentheticals**: Text in parentheses after character names
- **Transitions**: Recognized patterns like "FADE IN:", "CUT TO:", etc.
- **Action Lines**: Default formatting for descriptive text

### 2. Keyboard Navigation

#### Tab/Shift-Tab Cycling
- **Tab**: Cycle forward through element types
- **Shift-Tab**: Cycle backward through element types

The cycle order is:
1. Action → Scene Heading → Character → Transition → Action

#### Smart Enter Key
- Pressing Enter automatically flows to the next logical element:
  - After Scene Heading → Action
  - After Character → Dialogue
  - After Dialogue → Action
  - After Parenthetical → Dialogue
  - After Action → Action

### 3. Auto-Capitalization in Action Lines

The editor automatically capitalizes:

#### Character First Appearances
- Names appearing for the first time (2-4 consecutive capitalized words)
- Example: "John Smith enters" → "JOHN SMITH enters"

#### Key Sounds
- Important sound effects are auto-capitalized
- Examples: "bang" → "BANG", "scream" → "SCREAM"
- Comprehensive list includes: BANG, BOOM, CRASH, GUNSHOT, SCREAM, RING, etc.

#### Time References
- DAWN, DAY, NIGHT, DUSK, etc. in scene headings

### 4. Page Break Handling

#### Automatic (MORE) and (CONT'D)
- When dialogue spans across pages, "(MORE)" appears at the bottom
- Character name on the next page gets "(CONT'D)" appended
- Maintains dialogue flow across page breaks

### 5. Specialized Elements

#### Keyboard Shortcuts
- **Alt+S**: Insert "SUPER: " for superimposed text
- **Alt+I**: Insert "INTERCUT - " for intercut sequences
- **Alt+F**: Format current line as flashback

#### Auto-Recognized Elements
- **Superimposed Text**: SUPER:, TITLE:, SUBTITLE:
- **Flashbacks**: FLASHBACK, FLASH BACK
- **Time Cuts**: LATER, MOMENTS LATER, CONTINUOUS
- **Camera Angles**: CLOSE UP, ANGLE ON, POV
- **Special Shots**: INSERT, FREEZE FRAME, SPLIT SCREEN

### 6. Formatting Standards

All formatting follows Hollywood standards:

#### Margins
- Left: 1.5 inches
- Right: 1.0 inch
- Top: 1.0 inch
- Bottom: 1.0 inch

#### Element Positioning
- **Scene Headings**: Left margin
- **Action**: Left margin, 61 characters wide
- **Character**: 3.7 inches from left
- **Parenthetical**: 3.0 inches from left
- **Dialogue**: 2.5 inches from left, 35 characters wide
- **Transitions**: Right aligned

#### Typography
- Font: Courier New 12pt
- Line Height: Exactly 12pt (single-spaced)
- Pages: 55 lines per page

## Usage Tips

### Writing Flow
1. Start typing your scene heading (INT. or EXT.)
2. Press Enter to move to action
3. Type character name in CAPS
4. Press Enter to write dialogue
5. Use Tab to quickly change element types

### Quick Formatting
- Type naturally - the editor detects and formats elements
- Use keyboard shortcuts for special elements
- Let auto-capitalization handle character names and sounds

### Best Practices
1. **Scene Headings**: Always include location and time
   - Example: "INT. COFFEE SHOP - DAY"

2. **Character Introduction**: Type the name normally
   - "John enters" → "JOHN enters" (auto-formatted)

3. **Sounds**: Type naturally
   - "We hear a gunshot" → "We hear a GUNSHOT"

4. **Parentheticals**: Keep brief
   - (quietly), (to himself), (beat)

## Examples

### Scene Example
```
INT. DETECTIVE'S OFFICE - NIGHT

Rain pounds against the window. DETECTIVE SARAH JONES (40s, 
weathered) sits at her desk, studying crime scene photos.

The phone RINGS.

                    SARAH
          (answering)
     Jones.

                    VOICE (V.O.)
          (filtered)
     I know who killed her.

Sarah sits up straight.

                    SARAH
     Who is this?

The line goes dead. CLICK.
```

### Auto-Formatting in Action
1. **Type**: "int. coffee shop - day"
   **Result**: "INT. COFFEE SHOP - DAY"

2. **Type**: "mary enters" (first appearance)
   **Result**: "MARY enters"

3. **Type**: "the door slams"
   **Result**: "the door SLAMS"

## Troubleshooting

### Element Not Formatting Correctly?
- Use Tab to manually cycle to the correct type
- Check that the text matches expected patterns
- Ensure proper spacing and line breaks

### Page Breaks Not Working?
- (MORE) and (CONT'D) appear automatically
- Requires continuous dialogue across page boundary
- Check that character name is properly formatted

### Keyboard Shortcuts Not Working?
- Alt+S: Superimposed text
- Alt+I: Intercut
- Alt+F: Flashback
- Ensure no conflicting shortcuts in your system

## Advanced Features

### Title Page
- Automatically formatted when detected
- Centered title, author, and contact info

### Revision Marks
- Track changes with revision colors
- Standard industry revision marking

### Dual Dialogue
- Side-by-side character dialogue
- Properly formatted for simultaneous speech

## Future Enhancements

Planned features include:
- Production draft elements
- Scene numbering
- Character reports
- Smart script locking
- Export to industry formats (.fdx, .pdf)

---

The auto-formatting system is designed to let you focus on writing while it handles the technical formatting requirements. Write naturally, and let the tool ensure your script meets industry standards.