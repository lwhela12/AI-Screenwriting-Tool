import { Node as PMNode } from 'prosemirror-model';
import { Layout } from './pagination/layout';
import { scenesOf, SceneInfo } from './scenes';
import { speakerName } from './continued';

/**
 * Script reports: who is in which scene, how much everyone says, and the
 * shape of the script overall. Everything is computed from the document.
 */

export interface CharacterStats {
  name: string;
  /** Ordinals of the scenes the character speaks in. */
  scenes: number[];
  speeches: number;
  words: number;
  longestSpeechWords: number;
  /** Share of all dialogue words, 0..1. */
  share: number;
}

export interface SceneStats {
  scene: SceneInfo;
  intExt: string;
  time: string;
  dialogueWords: number;
  actionWords: number;
  speeches: number;
  /** Characters who speak, in order of first line. */
  cast: string[];
}

export interface ScriptReport {
  pages: number;
  sceneCount: number;
  words: number;
  dialogueWords: number;
  actionWords: number;
  speeches: number;
  characters: CharacterStats[];
  scenes: SceneStats[];
  /** Scene ordinals against character names: which characters speak in which scene. */
  matrix: { characters: string[]; rows: { scene: SceneInfo; present: boolean[] }[] };
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function headingParts(heading: string): { intExt: string; time: string } {
  const m = /^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s*(.*)$/i.exec(heading.trim());
  if (!m) return { intExt: '', time: '' };
  const intExt = m[1].replace(/\.$/, '').toUpperCase();
  const rest = m[2];
  const dash = rest.lastIndexOf(' - ');
  const time = dash >= 0 ? rest.slice(dash + 3).trim().toUpperCase() : '';
  return { intExt, time };
}

export function buildReport(doc: PMNode, layout?: Layout): ScriptReport {
  const scenes = scenesOf(doc, layout);
  const byName = new Map<string, CharacterStats>();
  const sceneStats: SceneStats[] = [];

  let words = 0;
  let dialogueWords = 0;
  let actionWords = 0;
  let speeches = 0;

  for (const scene of scenes) {
    const stats: SceneStats = { scene, ...headingParts(scene.heading), dialogueWords: 0, actionWords: 0, speeches: 0, cast: [] };
    let speaker: string | null = null;
    // Walk the scene's nodes by index range.
    const startIndex = scene.opening ? 0 : scene.index;
    let index = startIndex;
    let pos = scene.from;
    while (pos < scene.to && index < doc.childCount) {
      const node = doc.child(index);
      const type = node.type.name;
      const text = node.textContent;
      if (type === 'character') {
        speaker = speakerName(text) || null;
        if (speaker && !stats.cast.includes(speaker)) stats.cast.push(speaker);
        if (speaker) {
          const c = byName.get(speaker) || { name: speaker, scenes: [], speeches: 0, words: 0, longestSpeechWords: 0, share: 0 };
          if (!c.scenes.includes(scene.ordinal)) c.scenes.push(scene.ordinal);
          c.speeches++;
          byName.set(speaker, c);
          stats.speeches++;
          speeches++;
        }
      } else if (type === 'dialogue') {
        const n = countWords(text);
        stats.dialogueWords += n;
        dialogueWords += n;
        if (speaker) {
          const c = byName.get(speaker)!;
          c.words += n;
          c.longestSpeechWords = Math.max(c.longestSpeechWords, n);
        }
      } else if (type === 'action' || type === 'centered' || type === 'shot' || type === 'scene_heading') {
        const n = countWords(text);
        stats.actionWords += n;
        actionWords += n;
      }
      words += countWords(text);
      pos += node.nodeSize;
      index++;
    }
    sceneStats.push(stats);
  }

  const characters = Array.from(byName.values())
    .map(c => ({ ...c, share: dialogueWords ? c.words / dialogueWords : 0 }))
    .sort((a, b) => b.words - a.words || a.name.localeCompare(b.name));

  const names = characters.map(c => c.name);
  const matrix = {
    characters: names,
    rows: sceneStats.filter(s => !s.scene.opening).map(s => ({ scene: s.scene, present: names.map(n => s.cast.includes(n)) }))
  };

  return {
    pages: layout ? layout.pages.length : 1,
    sceneCount: scenes.filter(s => !s.opening).length,
    words,
    dialogueWords,
    actionWords,
    speeches,
    characters,
    scenes: sceneStats,
    matrix
  };
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function charactersCSV(report: ScriptReport): string {
  const rows = [['Character', 'Scenes', 'Speeches', 'Words', 'Share of dialogue', 'Longest speech (words)']];
  for (const c of report.characters) {
    rows.push([c.name, String(c.scenes.length), String(c.speeches), String(c.words), `${Math.round(c.share * 100)}%`, String(c.longestSpeechWords)]);
  }
  return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function scenesCSV(report: ScriptReport): string {
  const rows = [['#', 'Heading', 'Page', 'Length (eighths)', 'Int/Ext', 'Time', 'Cast', 'Dialogue words', 'Action words']];
  report.scenes
    .filter(s => !s.scene.opening)
    .forEach((s, i) => {
      rows.push([
        s.scene.number || String(i + 1),
        s.scene.heading,
        String(s.scene.page),
        String(s.scene.eighths),
        s.intExt,
        s.time,
        s.cast.join('; '),
        String(s.dialogueWords),
        String(s.actionWords)
      ]);
    });
  return rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}
