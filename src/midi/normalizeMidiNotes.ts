import type { MidiNoteEvent } from "../types/maestroAy.js";

export function normalizeMidiNotes(notes: MidiNoteEvent[]): MidiNoteEvent[] {
  return [...notes].sort((a, b) => {
    if (a.startTicks !== b.startTicks) return a.startTicks - b.startTicks;
    if (a.durationTicks !== b.durationTicks) return a.durationTicks - b.durationTicks;
    return a.midi - b.midi;
  });
}
