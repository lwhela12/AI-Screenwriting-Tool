import { describe, it, expect, afterEach } from 'vitest';
import { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { b, stateFor, viewFor, outline } from './helpers';
import { scenesOf, moveSceneTransaction, setSceneAttrs, insertScene, jumpToScene, sceneAt } from '../src/components/editor-v2/scenes';
import { layoutFromDoc } from '../src/components/editor-v2/pagination/fromDoc';
import { docToFDX, parseFDX } from '../src/utils/fdx';
import { contentToDoc, docToContent } from '../src/components/editor-v2/docConverter';

const script = () =>
  b.doc(
    b.a('FADE IN on darkness.'),
    b.scene_heading({ number: '1', synopsis: 'Bob arrives.', color: '#ffd966' }, 'INT. KITCHEN - DAY'),
    b.a('Bob enters, soaked.'),
    b.ch('BOB'),
    b.d('Wet out there.'),
    b.scene_heading({ structure: 'Act Two' }, 'EXT. STREET - NIGHT'),
    b.a('Rain hammers the pavement.'),
    b.ch('MARY (V.O.)'),
    b.d('He never learns.'),
    b.ch('BOB'),
    b.d('I heard that.'),
    b.sh('INT. CAR - NIGHT'),
    b.a('They drive.')
  );

let views: EditorView[] = [];
afterEach(() => {
  views.forEach(v => v.destroy());
  views = [];
});

describe('scenesOf', () => {
  it('derives scenes with attributes, cast and preview from the document', () => {
    const doc = script();
    const scenes = scenesOf(doc, layoutFromDoc(doc).layout);
    expect(scenes.map(s => s.heading)).toEqual(['', 'INT. KITCHEN - DAY', 'EXT. STREET - NIGHT', 'INT. CAR - NIGHT']);
    expect(scenes[0].opening).toBe(true);
    expect(scenes[1]).toMatchObject({ number: '1', synopsis: 'Bob arrives.', color: '#ffd966', characters: ['BOB'], preview: 'Bob enters, soaked.', page: 1 });
    expect(scenes[2]).toMatchObject({ structure: 'Act Two', characters: ['MARY', 'BOB'] });
    expect(scenes[2].eighths).toBeGreaterThan(0);
    // Ranges tile the document.
    expect(scenes[0].from).toBe(0);
    for (let i = 1; i < scenes.length; i++) expect(scenes[i].from).toBe(scenes[i - 1].to);
    expect(scenes[scenes.length - 1].to).toBe(doc.content.size);
  });

  it('finds the scene under a position', () => {
    const doc = script();
    const scenes = scenesOf(doc);
    expect(sceneAt(scenes, 2)!.opening).toBe(true);
    expect(sceneAt(scenes, scenes[2].from + 5)!.heading).toBe('EXT. STREET - NIGHT');
  });
});

describe('moving scenes', () => {
  it('moves a scene down, carrying all of its elements', () => {
    const state = stateFor(script());
    const tr = moveSceneTransaction(state, 1, 2)!;
    const moved = state.apply(tr);
    expect(outline(moved.doc)).toEqual([
      'action: FADE IN on darkness.',
      'scene_heading: EXT. STREET - NIGHT',
      'action: Rain hammers the pavement.',
      'character: MARY (V.O.)',
      'dialogue: He never learns.',
      'character: BOB',
      'dialogue: I heard that.',
      'scene_heading: INT. KITCHEN - DAY',
      'action: Bob enters, soaked.',
      'character: BOB',
      'dialogue: Wet out there.',
      'scene_heading: INT. CAR - NIGHT',
      'action: They drive.'
    ]);
    expect(moved.doc.child(7).attrs.synopsis).toBe('Bob arrives.');
    expect(scenesOf(moved.doc)[2].heading).toBe('INT. KITCHEN - DAY');
  });

  it('moves a scene up', () => {
    const state = stateFor(script());
    const moved = state.apply(moveSceneTransaction(state, 3, 1)!);
    expect(scenesOf(moved.doc).map(s => s.heading)).toEqual(['', 'INT. CAR - NIGHT', 'INT. KITCHEN - DAY', 'EXT. STREET - NIGHT']);
  });

  it('never moves the opening material and ignores no-op moves', () => {
    const state = stateFor(script());
    expect(moveSceneTransaction(state, 0, 2)).toBeNull();
    expect(moveSceneTransaction(state, 2, 0)).toBeNull();
    expect(moveSceneTransaction(state, 2, 2)).toBeNull();
  });
});

describe('scene commands on a view', () => {
  it('sets a synopsis and inserts a new scene after the current one', () => {
    const view = viewFor(stateFor(script()));
    views.push(view);
    setSceneAttrs(view, 1, { synopsis: 'Rewritten.' });
    expect(view.state.doc.child(1).attrs.synopsis).toBe('Rewritten.');
    expect(view.state.doc.child(1).attrs.number).toBe('1');

    insertScene(view, 1, 'int. hallway - day', 'Bob hides.');
    const scenes = scenesOf(view.state.doc);
    expect(scenes.map(s => s.heading)).toEqual(['', 'INT. KITCHEN - DAY', 'INT. HALLWAY - DAY', 'EXT. STREET - NIGHT', 'INT. CAR - NIGHT']);
    expect(scenes[2].synopsis).toBe('Bob hides.');
    expect(view.state.selection.$from.parent.type.name).toBe('scene_heading');
  });

  it('jumps to a scene', () => {
    const view = viewFor(stateFor(script()));
    views.push(view);
    const scenes = scenesOf(view.state.doc);
    jumpToScene(view, scenes[3]);
    expect(view.state.selection.$from.parent.textContent).toBe('INT. CAR - NIGHT');
    expect(view.state.selection instanceof TextSelection).toBe(true);
  });
});

describe('scene attributes round-trip', () => {
  it('survive storage and Final Draft export/import', () => {
    const doc = script();
    const stored = contentToDoc(docToContent(doc));
    expect(stored.child(1).attrs).toMatchObject({ synopsis: 'Bob arrives.', color: '#ffd966', number: '1' });
    expect(stored.child(5).attrs.structure).toBe('Act Two');

    const xml = docToFDX(doc, { title: 't' });
    expect(xml).toContain('<SceneProperties Color="#FFFFD9D96666" Title="">');
    expect(xml).toContain('<Text>Bob arrives.</Text>');
    const again = parseFDX(xml).doc;
    expect(again.child(1).attrs).toMatchObject({ synopsis: 'Bob arrives.', color: '#ffd966', number: '1' });
    expect(outline(again)).toEqual(outline(doc));
  });
});
