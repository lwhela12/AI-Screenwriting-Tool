import { describe, it, expect, afterEach } from 'vitest';
import { EditorView } from 'prosemirror-view';
import { EditorState } from 'prosemirror-state';
import { b, stateFor, viewFor, outline } from './helpers';
import { continuedCues, cueDisplayText, speakerName } from '../src/components/editor-v2/continued';
import { layoutDoc, pageViewPlugin } from '../src/components/editor-v2/plugins/pageView';
import { docToElements } from '../src/components/editor-v2/docConverter';
import { docToFDX, parseFDX } from '../src/utils/fdx';
import { smartTypePlugin, completionPlugin, completionKey } from '../src/components/editor-v2/plugins/smartType';

let views: EditorView[] = [];
afterEach(() => {
  views.forEach(v => v.destroy());
  views = [];
});

describe('continuedCues', () => {
  it('marks a speaker who resumes after action', () => {
    const doc = b.doc(b.ch('JOE'), b.d('Hi.'), b.a('He waits.'), b.ch('JOE'), b.d('Well?'));
    expect([...continuedCues(doc)]).toEqual([3]);
  });

  it('does not mark a speaker after someone else has spoken', () => {
    const doc = b.doc(b.ch('JOE'), b.d('Hi.'), b.ch('MARY'), b.d('Hello.'), b.ch('JOE'), b.d('Well?'));
    expect([...continuedCues(doc)]).toEqual([]);
  });

  it('ignores extensions when comparing speakers', () => {
    const doc = b.doc(b.ch('JOE (V.O.)'), b.d('Hi.'), b.a('Beat.'), b.ch('JOE'), b.d('Well?'));
    expect([...continuedCues(doc)]).toEqual([3]);
    expect(speakerName('JOE (V.O.) (CONT\'D)')).toBe('JOE');
  });

  it('resets at a scene heading', () => {
    const doc = b.doc(b.ch('JOE'), b.d('Hi.'), b.sh('INT. B - DAY'), b.ch('JOE'), b.d('Well?'));
    expect([...continuedCues(doc)]).toEqual([]);
  });

  it("does not double a cue that already says (CONT'D)", () => {
    const doc = b.doc(b.ch('JOE'), b.d('Hi.'), b.a('Beat.'), b.ch("JOE (CONT'D)"), b.d('Well?'));
    expect([...continuedCues(doc)]).toEqual([]);
    expect(cueDisplayText("JOE (CONT'D)", true)).toBe("JOE (CONT'D)");
    expect(cueDisplayText('JOE', true)).toBe("JOE (CONT'D)");
    expect(cueDisplayText('JOE', false)).toBe('JOE');
  });
});

describe("(CONT'D) everywhere it is printed", () => {
  const doc = b.doc(b.ch('JOE'), b.d('Hi.'), b.a('He waits.'), b.ch('JOE'), b.d('Well?'));

  it('is part of the paginated cue text', () => {
    const { layout } = layoutDoc(doc);
    expect(layout.elements[3].text).toBe("JOE (CONT'D)");
    expect(layout.elements[0].text).toBe('JOE');
  });

  it('is rendered after the cue in the editor without entering the document', () => {
    const view = viewFor(stateFor(doc, [pageViewPlugin]));
    views.push(view);
    const cues = view.dom.querySelectorAll('.character');
    expect(cues[1].textContent).toBe("JOE (CONT'D)");
    expect(cues[0].textContent).toBe('JOE');
    expect(view.state.doc.child(3).textContent).toBe('JOE');
  });

  it('is in the export elements and the FDX, and is stripped again on import', () => {
    expect(docToElements(doc)[3].text).toBe("JOE (CONT'D)");
    const xml = docToFDX(doc, { title: 't' });
    expect(xml).toContain("<Text>JOE (CONT'D)</Text>");
    const again = parseFDX(xml).doc;
    expect(outline(again)).toEqual(outline(doc));
  });
});

describe('character extension SmartType', () => {
  function stateWith(cueText: string): EditorState {
    const doc = b.doc(b.ch(`${cueText}<a>`));
    return stateFor(doc, [smartTypePlugin(), completionPlugin()]);
  }

  it('offers the standard extensions after "("', () => {
    const state = stateWith('JOE ').apply(stateWith('JOE ').tr.insertText('('));
    const completion = completionKey.getState(state)!;
    expect(completion.active).toBe(true);
    expect(completion.options.map(o => o.label)).toContain('V.O.');
    expect(completion.options[0].suffix).toBe(')');
  });

  it('narrows as you type and stops once the parenthesis is closed', () => {
    let state = stateWith('JOE (').apply(stateWith('JOE (').tr.insertText('O'));
    expect(completionKey.getState(state)!.options.map(o => o.label)).toEqual(['O.S.', 'O.C.', 'ON PHONE']);
    state = stateWith('JOE (O.S.').apply(stateWith('JOE (O.S.').tr.insertText(')'));
    expect(completionKey.getState(state)!.active).toBe(false);
  });
});
