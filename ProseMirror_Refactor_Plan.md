# ProseMirror Refactor Plan

## Executive Summary

This document outlines the migration plan from CodeMirror to ProseMirror for the AI Screenwriting Tool. The primary goals are:
- Implement proper document-style scrolling (scrollbar at window edge)
- Enable true page-based editing with page breaks
- Maintain performance and zoom functionality
- Clean up vestigial CodeMirror code

**Estimated Timeline**: 2-3 weeks
**Risk Level**: Medium
**Impact**: High - Fundamental editor architecture change

## Phase 1: Setup and Prototype (Days 1-3) ✅ COMPLETE

### 1.1 Dependencies and Setup
- [x] Install ProseMirror packages:
  ```bash
  npm install prosemirror-state prosemirror-view prosemirror-model
  npm install prosemirror-schema-basic prosemirror-schema-list
  npm install prosemirror-commands prosemirror-keymap
  npm install prosemirror-history prosemirror-transform
  ```
- [x] Create new directory structure:
  ```
  client/src/components/editor-v2/
    ├── ProseMirrorEditor.tsx
    ├── schema/
    │   └── screenplaySchema.ts
    ├── plugins/
    │   ├── smartType.ts
    │   ├── screenplayCommands.ts
    │   └── pageView.ts
    └── nodes/
        └── customNodeViews.ts
  ```

### 1.2 Basic Schema Definition
- [x] Define screenplay schema with all element types:
  - Document → Pages → Elements
  - Scene headings, characters, dialogue, action, etc.
  - Page nodes with numbering
- [x] Implement basic node views for visual rendering
- [x] Create minimal working editor

### 1.3 Proof of Concept
- [x] Verify scrolling works as expected (external scrollbar) ✅ SUCCESS!
- [x] Confirm page rendering approach
- [x] Test basic typing and editing
- [ ] Validate performance with large documents (to be tested)

## Phase 2: Feature Migration (Days 4-10)

### 2.1 Smart Type System
**Files to migrate from**:
- `client/src/components/screenplay/SmartType.ts`

**New implementation**:
- [ ] Port character/location/transition collections
- [ ] Implement ProseMirror autocomplete plugin
- [ ] Maintain same keyboard shortcuts
- [ ] Test autocomplete behavior

### 2.2 Screenplay Formatting
**Files to migrate from**:
- `client/src/components/screenplay/ScreenplayFormatter.ts`
- `client/src/components/screenplay/ScreenplayTypes.ts`

**New implementation**:
- [ ] Port element detection logic
- [ ] Implement Tab key cycling
- [ ] Port Enter key behavior
- [ ] Auto-capitalization for characters
- [ ] Element flow rules (character → dialogue, etc.)

### 2.3 Page Management
**Files to migrate from**:
- `client/src/components/screenplay/PageBreakHandler.ts`

**New implementation**:
- [ ] Page break calculations
- [ ] (MORE) and (CONT'D) handling
- [ ] Page number display
- [ ] Proper pagination logic

### 2.4 Special Elements
**Files to migrate from**:
- `client/src/components/screenplay/SpecializedElements.ts`

**New implementation**:
- [ ] Dual dialogue
- [ ] Montages
- [ ] Flashbacks
- [ ] Intercut scenes
- [ ] Superimposed text

### 2.5 Action Formatting
**Files to migrate from**:
- `client/src/components/screenplay/ActionFormatter.ts`

**New implementation**:
- [ ] Character name highlighting
- [ ] Sound effect detection
- [ ] Camera direction formatting

## Phase 3: UI Integration (Days 11-14)

### 3.1 React Component Updates
- [ ] Update `Editor.tsx` to use ProseMirror
- [ ] Maintain same props interface
- [ ] Port toolbar functionality
- [ ] Integrate with existing state management

### 3.2 Styling Migration
**Files to update**:
- `client/src/components/Editor.css`
- `client/src/components/ScreenplayFormat.css`
- `client/src/components/EditorPage.css`

**Changes needed**:
- [ ] Update class names from `.cm-` to `.pm-`
- [ ] Adjust for ProseMirror's DOM structure
- [ ] Ensure page styling works correctly
- [ ] Test dark mode

### 3.3 Export System Updates
- [ ] Update export functions to work with ProseMirror document model
- [ ] Test all export formats (PDF, Final Draft, Fountain)
- [ ] Ensure formatting is preserved

## Phase 4: Testing and Optimization (Days 15-18)

### 4.1 Functional Testing
- [ ] All screenplay elements format correctly
- [ ] Tab key behavior matches original
- [ ] Smart type autocomplete works
- [ ] Page breaks calculate properly
- [ ] Export formats are accurate

### 4.2 Performance Testing
- [ ] Test with 120-page screenplay
- [ ] Measure typing latency
- [ ] Check memory usage
- [ ] Validate smooth scrolling at 60fps

### 4.3 Browser Compatibility
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari
- [ ] Test zoom functionality (50%-200%)

### 4.4 Edge Cases
- [ ] Copy/paste behavior
- [ ] Undo/redo functionality
- [ ] Large content blocks
- [ ] Rapid typing
- [ ] Multi-cursor scenarios

## Phase 5: Cleanup and Migration (Days 19-21)

### 5.1 Code Removal
**Files to delete**:
- [ ] `client/src/components/screenplay/` (entire directory)
- [ ] `client/src/components/Editor.tsx` (old version)

**Dependencies to remove**:
- [ ] All CodeMirror packages from package.json
- [ ] CodeMirror type definitions

### 5.2 Code Updates
**Files to update**:
- [ ] `App.tsx` - Import new editor
- [ ] Remove CodeMirror-specific CSS
- [ ] Update any documentation
- [ ] Clean up unused imports

### 5.3 Final Integration
- [ ] Move editor-v2 to main editor location
- [ ] Update all imports
- [ ] Run full test suite
- [ ] Final performance validation

## Migration Checklist

### Pre-Migration
- [ ] Full backup of current code
- [ ] Document current behavior
- [ ] Create test cases
- [ ] Notify team of timeline

### During Migration
- [ ] Daily progress updates
- [ ] Keep both editors functional
- [ ] Regular commits to feature branch
- [ ] Continuous testing

### Post-Migration
- [ ] Code review
- [ ] Performance benchmarks
- [ ] User acceptance testing
- [ ] Deploy to staging first

## Risk Mitigation

### Identified Risks
1. **Unknown ProseMirror limitations**
   - Mitigation: Early prototype to validate approach

2. **Performance regression**
   - Mitigation: Continuous benchmarking during development

3. **Missing features**
   - Mitigation: Comprehensive testing against current functionality

4. **Browser compatibility issues**
   - Mitigation: Test early and often across browsers

### Rollback Plan
- Keep CodeMirror implementation in separate branch
- Feature flag to switch between editors
- Ability to revert within 1 hour if issues found

## Success Criteria

1. **Scrollbar Position**: External to document, at window edge
2. **Performance**: No regression from current implementation
3. **Features**: 100% parity with current functionality
4. **Zoom**: Works correctly from 50% to 200%
5. **Code Quality**: No vestigial CodeMirror code remains

## Technical Architecture

### Component Structure
```
ProseMirrorEditor
├── Schema (screenplay elements)
├── Plugins
│   ├── SmartType (autocomplete)
│   ├── KeyBindings (tab, enter)
│   ├── PageView (visual pages)
│   └── ElementDetection
├── Commands (user actions)
└── NodeViews (custom rendering)
```

### Data Flow
```
User Input → ProseMirror Transaction → Plugin Processing → State Update → View Render
                                            ↓
                                     Smart Type Collection
                                     Page Calculations
                                     Format Rules
```

## File Mapping

| CodeMirror File | ProseMirror Equivalent | Notes |
|-----------------|------------------------|-------|
| SmartType.ts | plugins/smartType.ts | Port logic, new API |
| ScreenplayFormatter.ts | plugins/screenplayCommands.ts | Merge with commands |
| PageBreakHandler.ts | plugins/pageView.ts | Integrate with pages |
| SpecializedElements.ts | Part of schema + commands | Built into structure |
| ActionFormatter.ts | plugins/actionFormat.ts | Simplified version |

## Conclusion

This refactor will fundamentally improve the editor architecture while maintaining all current functionality. The key is methodical migration with continuous testing to ensure no regression in user experience.

**Next Steps**:
1. Review and approve this plan
2. Set up ProseMirror development environment
3. Begin Phase 1 prototype