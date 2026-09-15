import { describe, it, expect } from 'vitest';
import { b } from './helpers';
import { buildReport, charactersCSV, scenesCSV, countWords } from '../src/components/editor-v2/reports';
import { layoutFromDoc } from '../src/components/editor-v2/pagination/fromDoc';

const doc = b.doc(
  b.a('Darkness.'),
  b.sh('INT. KITCHEN - DAY'),
  b.a('Bob enters, soaked to the bone.'),
  b.ch('BOB'),
  b.d('Wet out there. Really wet.'),
  b.ch('MARY (V.O.)'),
  b.d('Told you.'),
  b.sh('EXT. STREET - NIGHT'),
  b.a('Rain.'),
  b.ch('BOB (CONT\'D)'),
  b.p('(shouting)'),
  b.d('I heard that the first time.'),
  b.sh('INT. CAR - CONTINUOUS'),
  b.a('They drive in silence.')
);

describe('buildReport', () => {
  it('counts words', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  one  two\nthree ')).toBe(3);
  });

  it('reports characters with scenes, speeches, words and share', () => {
    const report = buildReport(doc, layoutFromDoc(doc).layout);
    expect(report.pages).toBe(1);
    expect(report.sceneCount).toBe(3);
    expect(report.characters.map(c => c.name)).toEqual(['BOB', 'MARY']);
    const bob = report.characters[0];
    expect(bob).toMatchObject({ scenes: [1, 2], speeches: 2, words: 11, longestSpeechWords: 6 });
    expect(Math.round(bob.share * 100)).toBe(85);
    expect(report.characters[1]).toMatchObject({ scenes: [1], speeches: 1, words: 2 });
    expect(report.dialogueWords).toBe(13);
    expect(report.speeches).toBe(3);
  });

  it('reports scenes with int/ext, time, cast and word counts', () => {
    const report = buildReport(doc);
    const scenes = report.scenes.filter(s => !s.scene.opening);
    expect(scenes.map(s => [s.intExt, s.time])).toEqual([
      ['INT', 'DAY'],
      ['EXT', 'NIGHT'],
      ['INT', 'CONTINUOUS']
    ]);
    expect(scenes[0].cast).toEqual(['BOB', 'MARY']);
    expect(scenes[1].cast).toEqual(['BOB']);
    expect(scenes[2].cast).toEqual([]);
    expect(scenes[0].dialogueWords).toBe(7);
    expect(scenes[0].actionWords).toBe(6 + 4); // action + heading words
    expect(report.scenes[0].scene.opening).toBe(true);
    expect(report.scenes[0].actionWords).toBe(1);
  });

  it('builds the scene/character matrix', () => {
    const { matrix } = buildReport(doc);
    expect(matrix.characters).toEqual(['BOB', 'MARY']);
    expect(matrix.rows.map(r => r.present)).toEqual([
      [true, true],
      [true, false],
      [false, false]
    ]);
  });

  it('exports CSV', () => {
    const report = buildReport(doc, layoutFromDoc(doc).layout);
    const chars = charactersCSV(report).split('\n');
    expect(chars[0]).toBe('Character,Scenes,Speeches,Words,Share of dialogue,Longest speech (words)');
    expect(chars[1]).toBe('BOB,2,2,11,85%,6');
    const scenes = scenesCSV(report).split('\n');
    expect(scenes[1].startsWith('1,INT. KITCHEN - DAY,1,')).toBe(true);
    expect(scenes[1]).toContain('BOB; MARY');
  });
});
