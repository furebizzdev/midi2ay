/**
 * convertMusicXmlToMaestroAy.ts  (refatorado)
 *
 * Orquestrador fino — cada responsabilidade em seu módulo:
 *   • Parsing XML    → DOMParser nativo (sem regex artesanal)
 *   • Timbres        → src/config/instrumentMap.ts
 *   • Pitch/staffIdx → funções locais puras (preserva enarmonias)
 *   • Serialização   → serializeMaestroAy.ts
 */

import type { MaestroAyHeader, MaestroAyStaff } from "../types/maestroAy.js";
import {
  getClosestDurationCode,
  DEFAULT_TIME_STEPS_PER_QUARTER,
  DEFAULT_MAX_SIMULTANEOUS_NOTES,
} from "./convertMidiToMaestroAy.js";
import { resolveKeyboard } from "../config/instrumentMap.js";

// ─── Constantes ───────────────────────────────────────────────────────────────
const DEFAULT_DIVISIONS = 480;
const REST_LINE         = "-1&-1&";
const silenceLine       = (dur: number) => `1&${dur}&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&`;
const attackLine        = (dur: number, glyphs: string) =>
  `0&${dur}&9&&&&&&&&&&&&&&&&&&&&&&&&&&&&&,${glyphs}`;

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface ParsedNote {
  midi: number; startTicks: number; durationTicks: number;
  staff: number; partIndex: number;
  step: string; alter: string; octave: string;
  isPercussion: boolean;
}

interface NoteOnStep {
  staffIndex: number; accidental: string; durationSteps: number;
}

interface PartMeta {
  name: string; program?: number; channel?: number;
}

// ─── Pitch utilities ──────────────────────────────────────────────────────────
const SEMITONES:  Record<string, number>  = { C:0,D:2,E:4,F:5,G:7,A:9,B:11 };
const DIATONIC:   Record<string, number>  = { C:0,D:1,E:2,F:3,G:4,A:5,B:6  };
const CHR_NAT:    number[]  = [0,0,1,1,2,3,3,4,4,5,5,6];
const CHR_SHARP:  boolean[] = [false,true,false,true,false,false,true,false,true,false,true,false];

function pitchToMidi(step: string, alter: string, octave: string): number {
  return 12 + (parseInt(octave,10)||4)*12 + (SEMITONES[step]??0) + (alter ? parseFloat(alter) : 0);
}

/** XML pitch → (staffIndex, accidental) preservando enarmonias. */
function xmlPitchToStaff(step: string, alter: string, octave: string) {
  const alt = alter ? parseFloat(alter) : 0;
  return {
    staffIndex: (parseInt(octave,10)||4 - 4) * 7 + (DIATONIC[step]??0),
    accidental: alt > 0 ? "2" : alt < 0 ? "1" : "",
  };
}

/** Fallback para percussão sem pitch XML. */
function midiToStaff(midi: number) {
  const sem = midi % 12;
  const oct = Math.floor(midi/12) - 1;
  return { staffIndex: (oct-4)*7 + CHR_NAT[sem], accidental: CHR_SHARP[sem] ? "2" : "" };
}

// ─── XML helpers ──────────────────────────────────────────────────────────────
function childText(el: Element, tag: string): string {
  return el.querySelector(tag)?.textContent?.trim() ?? "";
}

function parseMusicXml(xml: string): Document {
  if (typeof DOMParser === "undefined")
    throw new Error("DOMParser indisponível. Em Node.js use @xmldom/xmldom como polyfill.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error(`XML inválido: ${err.textContent?.slice(0, 200)}`);
  return doc;
}

// ─── Extração de metadados dos parts ─────────────────────────────────────────
function extractPartMeta(doc: Document): PartMeta[] {
  return Array.from(doc.querySelectorAll("score-partwise > part-list > score-part"))
    .map(sp => {
      const mi = sp.querySelector("midi-instrument");
      return {
        name:    sp.querySelector("part-name")?.textContent?.trim() ?? "",
        program: mi ? parseInt(childText(mi as Element, "midi-program"), 10) || undefined : undefined,
        channel: mi ? parseInt(childText(mi as Element, "midi-channel"), 10) || undefined : undefined,
      };
    });
}

// ─── Extração de notas ────────────────────────────────────────────────────────
function extractAllNotes(doc: Document, trimSilence: boolean) {
  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  const notes: ParsedNote[] = [];
  let minStart  = Infinity;
  let divisions = DEFAULT_DIVISIONS;

  parts.forEach((part, partIndex) => {
    let t = 0, lastStart = 0;
    for (const measure of Array.from(part.querySelectorAll("measure"))) {
      const divsEl = measure.querySelector("attributes > divisions");
      if (divsEl?.textContent) divisions = parseInt(divsEl.textContent, 10) || divisions;

      for (const child of Array.from(measure.children)) {
        const tag = child.tagName;
        if      (tag === "backup")  { t -= parseInt(childText(child as Element, "duration"),10)||0; continue; }
        else if (tag === "forward") { t += parseInt(childText(child as Element, "duration"),10)||0; continue; }
        else if (tag !== "note") continue;

        const isRest  = child.querySelector("rest")  !== null;
        const isChord = child.querySelector("chord") !== null;
        const dur     = parseInt(childText(child as Element, "duration"),10) || 0;
        const staff   = parseInt(childText(child as Element, "staff"),   10) || 1;
        const noteStart = isChord ? lastStart : t;
        if (!isChord) { lastStart = t; t += dur; }
        if (isRest)   continue;

        const pitchEl     = child.querySelector("pitch");
        const unpitchedEl = child.querySelector("unpitched");
        if (!pitchEl && !unpitchedEl) continue;

        const src       = (pitchEl ?? unpitchedEl) as Element;
        const stepTag   = pitchEl ? "step"   : "display-step";
        const octaveTag = pitchEl ? "octave" : "display-octave";
        const step      = childText(src, stepTag)   || "C";
        const alter     = pitchEl ? childText(src, "alter") : "";
        const octave    = childText(src, octaveTag) || "4";

        notes.push({
          midi: pitchToMidi(step, alter, octave),
          startTicks: noteStart, durationTicks: dur,
          staff, partIndex, step, alter, octave,
          isPercussion: !!unpitchedEl,
        });
        minStart = Math.min(minStart, noteStart);
      }
    }
  });

  const offset = trimSilence && isFinite(minStart) ? minStart : 0;
  if (offset > 0) notes.forEach(n => { n.startTicks -= offset; });

  return { notes, divisions };
}

// ─── Grade de eventos por staff ───────────────────────────────────────────────
function buildStaffEvents(
  notes: ParsedNote[], parts: PartMeta[],
  divisions: number, timeStepsPerQ: number, maxSimultaneous: number
) {
  const partStaffCount = parts.map((_, i) => {
    const pn = notes.filter(n => n.partIndex === i);
    return pn.length ? Math.max(...pn.map(n => n.staff)) : 1;
  });

  const partBaseIdx: number[] = [];
  let totalStaves = 0;
  for (const c of partStaffCount) { partBaseIdx.push(totalStaves); totalStaves += c; }
  const numStaves  = Math.max(totalStaves, maxSimultaneous);
  const stepTicks  = divisions / timeStepsPerQ;

  const staffEvents: Map<number, Map<number, NoteOnStep[]>> = new Map(
    Array.from({ length: numStaves }, (_, s) => [s, new Map()])
  );
  let maxStep = 0;

  for (const n of notes) {
    const startSteps    = Math.round(n.startTicks / stepTicks);
    const durationSteps = Math.max(1, Math.round(n.durationTicks / stepTicks));
    maxStep = Math.max(maxStep, startSteps + durationSteps);

    const sIdx    = Math.min((partBaseIdx[n.partIndex]??0) + (n.staff-1), numStaves-1);
    const stepMap = staffEvents.get(sIdx)!;
    if (!stepMap.has(startSteps)) stepMap.set(startSteps, []);

    const pitch = n.isPercussion
      ? { staffIndex: 0, accidental: "" }
      : xmlPitchToStaff(n.step, n.alter, n.octave);  // usa enarmonia do XML

    stepMap.get(startSteps)!.push({ ...pitch, durationSteps });
  }

  const staffToPartIndex: number[] = [];
  for (let i = 0; i < parts.length; i++)
    for (let j = 0; j < partStaffCount[i]; j++) staffToPartIndex.push(i);
  while (staffToPartIndex.length < numStaves) staffToPartIndex.push(0);

  return { staffEvents, staffToPartIndex, numStaves, maxStep };
}

// ─── Gerador de linhas de evento de um staff ──────────────────────────────────
function buildEventLines(
  stepMap: Map<number, NoteOnStep[]>,
  maxStep: number,
  timeStepsPerQ: number
): string[] {
  const lines: string[] = [];
  let t = 0;

  while (t < maxStep) {
    const here = stepMap.get(t);

    if (here?.length) {
      const minDur = Math.min(...here.map(n => n.durationSteps));
      const { code: dur, stepsUsed } = getClosestDurationCode(minDur, timeStepsPerQ);
      const glyphs = here.map(n => `N:${n.staffIndex}&${dur}&${n.accidental}&&&`).join(",");
      lines.push(attackLine(dur, glyphs));
      for (let f = 1; f < stepsUsed; f++) lines.push(REST_LINE);
      t += stepsUsed;
    } else {
      let next = maxStep;
      for (const k of stepMap.keys()) if (k > t && k < next) next = k;
      const { code: dur, stepsUsed } = getClosestDurationCode(next - t, timeStepsPerQ);
      lines.push(silenceLine(dur));
      for (let f = 1; f < stepsUsed; f++) lines.push(REST_LINE);
      t += stepsUsed;
    }
  }

  return lines;
}

// ─── Ponto de entrada público ─────────────────────────────────────────────────
export function convertMusicXmlToMaestroAy(
  xmlContent: string,
  opts: {
    title?:                      string;
    maxSimultaneousNotes?:       number;
    maestroTimeStepsPerQuarter?: number;
    trimSilence?:                boolean;
  } = {}
) {
  const title         = opts.title                       ?? "Converted XML";
  const maxSimult     = opts.maxSimultaneousNotes        ?? DEFAULT_MAX_SIMULTANEOUS_NOTES;
  const timeStepsPerQ = opts.maestroTimeStepsPerQuarter  ?? DEFAULT_TIME_STEPS_PER_QUARTER;
  const trimSilence   = opts.trimSilence                 ?? true;

  const doc = parseMusicXml(xmlContent);
  if (!doc.querySelector("score-partwise"))
    throw new Error("MusicXML inválido: <score-partwise> não encontrado.");
  if (!doc.querySelector("score-partwise > part"))
    throw new Error("MusicXML sem parts.");

  const parts = extractPartMeta(doc);
  const { notes, divisions } = extractAllNotes(doc, trimSilence);
  if (!notes.length) throw new Error("Nenhuma nota encontrada no MusicXML.");

  const { staffEvents, staffToPartIndex, numStaves, maxStep } =
    buildStaffEvents(notes, parts, divisions, timeStepsPerQ, maxSimult);

  const staffs: MaestroAyStaff[] = Array.from({ length: numStaves }, (_, s) => {
    const meta = parts[staffToPartIndex[s]] ?? {};
    return {
      index: s, octave: 0, transpose: 0,
      keyboard:      resolveKeyboard({ midiChannel: meta.channel, midiProgram: meta.program, name: meta.name }),
      bracketTop:    "connect", bracketBottom: "connect",
      visible:       "show",   lineColor: 0,
      instrument3:   0,        instrument4: 0,
      rawEventLines: buildEventLines(staffEvents.get(s)!, maxStep, timeStepsPerQ),
      embeddedMeta:  [],
    };
  });

  const header: MaestroAyHeader = { title, bpm: 120, numerator: 4, denominator: 4, working: 25 };
  return { maestroDocument: { header, staffs } };
}
