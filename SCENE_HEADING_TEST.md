# Scene Heading Test Instructions

## To test the scene heading behavior:

1. Start the app and create a new project
2. The cursor should be left-aligned in an action element
3. Type "int. coffee shop - day" 
4. As soon as you type "INT. " it should:
   - Convert to a scene heading element
   - Auto-capitalize everything you type after
   - Stay left-aligned
5. Press Enter - should create a new action line
6. Type some action description
7. Press Tab - should convert to character element (centered)

## Current fixes made:
- Scene headings are explicitly left-aligned
- Action lines are explicitly left-aligned  
- Tab on empty action no longer auto-converts to character
- The app starts with an action element (left-aligned)

## Expected behavior:
- All typing starts left-aligned
- Scene headings stay left-aligned
- Only character names, parentheticals, and dialogue are indented/centered
- Transitions are right-aligned