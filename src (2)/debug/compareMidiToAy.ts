import { parseMidiToNoteEvents } from "../midi/parseMidi.js";
import { parseMaestroAyText } from "../maestroAy/parseMaestroAy.js";
import { decodeMaestroAyStaffEvents } from "../maestroAy/decodeMaestroAyEvents.js";
import type { ConvertMidiToMaestroAyOptions } from "../types/options.js";

export type MidiVsAyMatch = {
  stepIndex: number;
  midiCount: number;
  ayCount: number;
  matchedByPitchClassApprox: number;
};

function glyphToPitchClassApprox(glyphText: string): number | null {
  // glyphText esperado: "N:<y>&<x>"
  // Aproximação: pegar primeiro número após "N:"
  const m = glyphText.match(/N: *(-?\d+)/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

function quantizeTicksToStepIndex(startTicks: number, startBaseTicks: number, stepsPerQuarter: number, ticksPerQuarter: number): number {
  const relative = startTicks - startBaseTicks;
  const ticksPerStep = ticksPerQuarter / stepsPerQuarter;
  return Math.max(0, Math.round(relative / ticksPerStep));
}

export type CompareResult = {
  stepsPerQuarter: number;
  midiNotesTotal: number;
  ayRawGlyphTotal: number;
  matches: MidiVsAyMatch[];
};

export async function compareMidiToAyApprox(input: {
  midiBytes: Uint8Array;
  ayText: string;
  stepsPerQuarter: number;
  options?: Partial<ConvertMidiToMaestroAyOptions>;
}): Promise<CompareResult> {
  const { ticksPerQuarter, notes } = parseMidiToNoteEvents(input.midiBytes);

  const ayDoc = parseMaestroAyText(input.ayText);

  const firstMidiStart = notes.length ? Math.min(...notes.map((n) => n.startTicks)) : 0;
  const stepsPerQuarter = Math.max(1, input.stepsPerQuarter);

  // MIDI: stepIndex -> list de pitch classes
  const midiByStep = new Map<number, number[]>();
  for (const n of notes) {
    const stepIndex = quantizeTicksToStepIndex(n.startTicks, firstMidiStart, stepsPerQuarter, ticksPerQuarter);
    const list = midiByStep.get(stepIndex) ?? [];
    list.push(n.midi); // pitch class approx: midi note number
    midiByStep.set(stepIndex, list);
  }

  // AY: stepIndex -> list de pitch classes approx (via glyph parsing)
  const ayByStep = new Map<number, number[]>();
  for (const staff of ayDoc.staffs) {
    const decoded = decodeMaestroAyStaffEvents(staff);
    for (const t of decoded.tokens) {
      if (t.kind !== "row") continue;
      const rawLine = t.text;

      // passo heurístico: no nosso placeholder é o prefixo numérico da linha
      const m = rawLine.match(/^\s*(-?\d+)&/);
      if (!m) continue;
      const stepIndex = Number(m[1]);
      if (!Number.isFinite(stepIndex)) continue;

      // glyphs na linha
      const glyphRegex = /N: *(-?\d+)&([^\s,&]+)/g;
      for (const match of rawLine.matchAll(glyphRegex)) {
        const y = Number(match[1]);
        if (Number.isFinite(y)) {
          const list = ayByStep.get(stepIndex) ?? [];
          list.push(y);
          ayByStep.set(stepIndex, list);
        }
      }

      // fallback: tenta extrair qualquer "N:<n>"
      if (rawLine.includes("N:") && !rawLine.match(/N: *-?\d+&/)) {
        const glyphs = rawLine.match(/N: *-?\d+/g) ?? [];
        for (const g of glyphs) {
          const approx = glyphToPitchClassApprox(g);
          if (approx !== null) {
            const list = ayByStep.get(stepIndex) ?? [];
            list.push(approx);
            ayByStep.set(stepIndex, list);
          }
        }
      }
    }
  }

  const allSteps = new Set<number>([...midiByStep.keys(), ...ayByStep.keys()]);
  const matches: MidiVsAyMatch[] = [];

  for (const stepIndex of [...allSteps].sort((a, b) => a - b)) {
    const midiVals = midiByStep.get(stepIndex) ?? [];
    const ayVals = ayByStep.get(stepIndex) ?? [];

    // match “por pitch class approx”:
    // - como a decodificação real do glyph ainda não está calibrada, fazemos coincidência por igualdade do “y” vs midi
    const midiCounts = new Map<number, number>();
    for (const v of midiVals) midiCounts.set(v, (midiCounts.get(v) ?? 0) + 1);

    let matched = 0;
    for (const a of ayVals) {
      const c = midiCounts.get(a) ?? 0;
      if (c > 0) {
        matched++;
        midiCounts.set(a, c - 1);
      }
    }

    matches.push({
      stepIndex,
      midiCount: midiVals.length,
      ayCount: ayVals.length,
      matchedByPitchClassApprox: matched,
    });
  }

  return {
    stepsPerQuarter,
    midiNotesTotal: notes.length,
    ayRawGlyphTotal: [...ayByStep.values()].reduce((acc, v) => acc + v.length, 0),
    matches,
  };
}
