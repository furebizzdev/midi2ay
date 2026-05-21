import type { MaestroAyDocument, MaestroAyStaff, MidiNoteEvent } from "../types/maestroAy.js";

export type BuildMaestroAyDocumentFromGlyphsInput = {
  title: string;
  bpm: number;
  numerator: number;
  denominator: number;
  working: number;

  notes: MidiNoteEvent[];

  maestroStepsPerQuarter: number;
  maxSimultaneousNotes: number;

  midiNoteToGlyph: (midi: number) => string;
};

function staffBase(staffIndex: number, keyboard: number, octave: number): Omit<MaestroAyStaff, "rawEventLines" | "embeddedMeta"> {
  return {
    index: staffIndex,
    octave,
    transpose: 0,
    keyboard,
  };
}

function formatMaestroEventRow(_stepIndex: number, glyphs: string[]): string {
  // PLACEHOLDER: stream real do Maestro tem uma sintaxe mais rica.
  // Aqui mantemos um formato estável só pra gerar .ay válido e debugar.
  const prefix = "0&6&9";
  const glyphPart = glyphs.length ? glyphs.join("&,") : "&";
  return `${prefix}&&${glyphPart}&`;
}

export function buildMaestroAyDocumentFromGlyphs(input: BuildMaestroAyDocumentFromGlyphsInput): MaestroAyDocument {
  const staff: MaestroAyStaff = {
    ...staffBase(0, 1, 0),
    octave: input.notes.length ? 0 : 0,
    rawEventLines: [],
    embeddedMeta: [],
  };

  const stepsPerQuarter = Math.max(1, input.maestroStepsPerQuarter);

  const notesByStep = new Map<number, MidiNoteEvent[]>();

  const baseStartTicks = input.notes.length ? input.notes[0].startTicks : 0;

  for (const n of input.notes) {
    const relativeTicks = n.startTicks - baseStartTicks;
    const stepIndex = Math.max(0, Math.round(relativeTicks / stepsPerQuarter)); // placeholder
    const list = notesByStep.get(stepIndex) ?? [];
    list.push(n);
    notesByStep.set(stepIndex, list);
  }

  const sortedSteps = [...notesByStep.keys()].sort((a, b) => a - b);

  for (const step of sortedSteps) {
    const events = notesByStep.get(step)!;
    const limited = events.slice(0, input.maxSimultaneousNotes);
    const glyphs = limited.map((e) => input.midiNoteToGlyph(e.midi));
    staff.rawEventLines.push(formatMaestroEventRow(step, glyphs));
  }

  return {
    header: {
      title: input.title,
      bpm: input.bpm,
      numerator: input.numerator,
      denominator: input.denominator,
      working: input.working,
    },
    staffs: [staff],
  };
}
