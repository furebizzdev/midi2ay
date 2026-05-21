// Position-based conversion for Maestro AY
// This is an intermediate format between parsed MIDI/WebMscore and Maestro AY

// Position format:
// {
//   time: number;        // in beats (quarter notes)
//   duration: number;    // in beats
//   pitch: number;       // MIDI note number (0-127)
//   staff: number;       // 1-indexed staff number
//   velocity: number;    // 0-127
//   channel: number;     // MIDI channel
//   program: number;     // MIDI program number
// }

export interface NotePosition {
  time: number;        // in beats
  duration: number;    // in beats
  pitch: number;       // MIDI note (0-127)
  staff: number;       // 1-indexed staff
  velocity: number;    // 0-127
  channel: number;     // MIDI channel
  program?: number;    // MIDI program for timbre
}

export interface PositionsData {
  positions: NotePosition[];
  bpm: number;
  timeSignature: { numerator: number; denominator: number };
  title?: string;
}

// Convert positions to Maestro AY document
export function positionsToMaestroAy(
  positions: NotePosition[],
  opts: {
    title?: string;
    bpm?: number;
    timeSignature?: { numerator: number; denominator: number };
    maxSimultaneousNotes?: number;
    maestroTimeStepsPerQuarter?: number;
  }
) {
  const title = opts.title || "Converted";
  const bpm = opts.bpm || 120;
  const timeSig = opts.timeSignature || { numerator: 4, denominator: 4 };
  const maxSimultaneousNotes = opts.maxSimultaneousNotes ?? 4;
  const timeStepsPerQuarter = opts.maestroTimeStepsPerQuarter || 4;

  // Sort by time
  const notes = [...positions].sort((a, b) => a.time - b.time);

  // Convert time to steps
  const stepNotes = notes.map(n => ({
    startSteps: Math.round(n.time * timeStepsPerQuarter),
    durationSteps: Math.max(1, Math.round(n.duration * timeStepsPerQuarter)),
    midi: n.pitch,
    staff: n.staff,
    velocity: n.velocity,
    program: n.program,
  }));

  // Find max step
  let maxStep = 0;
  for (const n of stepNotes) {
    maxStep = Math.max(maxStep, n.startSteps + n.durationSteps);
  }

  // Round to measure
  const stepsPerMeasure = timeSig.numerator * timeStepsPerQuarter;
  const totalSteps = Math.ceil(maxStep / stepsPerMeasure) * stepsPerMeasure;

  // Staff allocation
  const staffActiveNotes: { endStep: number; startStep: number; midi: number }[][] = 
    Array.from({ length: maxSimultaneousNotes }, () => []);
  
  const staffEvents: Map<number, Map<number, { midi: number; durationSteps: number; accidental: string; staffIndex: number }[]>> = new Map();
  for (let s = 0; s < maxSimultaneousNotes; s++) {
    staffEvents.set(s, new Map());
  }

  // Map MIDI to Maestro staffIndex - Robust version
  const midiToStaffIndexAndAccidental = (midiNumber: number, keySignatureSharpsFlats = 0) => {
    // Basic constants
    const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
    const LETTER_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
    
    // Simple key signature logic (sharps/flats)
    const SHARPS = ["F", "C", "G", "D", "A", "E", "B"];
    const FLATS = ["B", "E", "A", "D", "G", "C", "F"];
    const alters = new Map();
    if (keySignatureSharpsFlats > 0) {
      for (let i = 0; i < Math.min(keySignatureSharpsFlats, 7); i++) alters.set(SHARPS[i], 1);
    } else if (keySignatureSharpsFlats < 0) {
      for (let i = 0; i < Math.min(Math.abs(keySignatureSharpsFlats), 7); i++) alters.set(FLATS[i], -1);
    }

    let bestLetterIdx = 0;
    let bestOctave = 0;
    let bestAccidental = "";
    let minDiff = Infinity;
    const targetOctave = Math.floor(midiNumber / 12) - 1;

    for (let oct = targetOctave - 1; oct <= targetOctave + 1; oct++) {
      for (let lIdx = 0; lIdx < 7; lIdx++) {
        const L = LETTERS[lIdx];
        const naturalPitch = (oct + 1) * 12 + LETTER_OFFSETS[lIdx];
        const alt = alters.get(L) || 0;
        const keyPitch = naturalPitch + alt;
        const diff = midiNumber - keyPitch;
        if (Math.abs(diff) < Math.abs(minDiff)) {
          minDiff = diff;
          bestLetterIdx = lIdx;
          bestOctave = oct;
          if (midiNumber === keyPitch) bestAccidental = "";
          else if (diff === 1) bestAccidental = "2"; // Sharp
          else if (diff === -1) bestAccidental = "1"; // Flat
          else bestAccidental = "";
        }
      }
    }
    const staffIndex = (bestOctave - 4) * 7 + bestLetterIdx;
    return { staffIndex, accidental: bestAccidental };
  };

  // Keyboard mapping from MIDI program
  const getKeyboardFromProgram = (program?: number): number => {
    if (!program) return 9; // Default piano
    if (program >= 1 && program <= 8) return 9;  // Piano
    if (program >= 9 && program <= 16) return 9;  // Chromatic percussion
    if (program >= 17 && program <= 24) return 1;  // Organ
    if (program >= 25 && program <= 32) return 5;  // Guitar
    if (program >= 33 && program <= 40) return 12; // Bass
    if (program >= 41 && program <= 48) return 8;  // Strings
    if (program >= 49 && program <= 56) return 8;  // String ensemble
    if (program >= 57 && program <= 64) return 8;  // Synth strings
    if (program >= 57 && program <= 80) return 8;  // Brass fallback
    if (program >= 81 && program <= 104) return 3; // Synth
    if (program >= 105 && program <= 112) return 7; // Ethnic
    if (program >= 113 && program <= 128) return 2; // Percussion
    return 9;
  };

  // Allocate notes to staves
  for (const note of stepNotes) {
    let allocatedStaff = -1;
    for (let s = 0; s < maxSimultaneousNotes; s++) {
      const active = staffActiveNotes[s];
      const isFree = active.every(a => a.endStep <= note.startSteps || a.startStep === note.startSteps);
      if (isFree) {
        allocatedStaff = s;
        break;
      }
    }
    if (allocatedStaff === -1) continue;

    staffActiveNotes[allocatedStaff].push({
      startStep: note.startSteps,
      endStep: note.startSteps + note.durationSteps,
      midi: note.midi,
    });

    const { staffIndex, accidental } = midiToStaffIndexAndAccidental(note.midi);
    const stepMap = staffEvents.get(allocatedStaff)!;
    if (!stepMap.has(note.startSteps)) {
      stepMap.set(note.startSteps, []);
    }
    stepMap.get(note.startSteps)!.push({
      midi: note.midi,
      durationSteps: note.durationSteps,
      accidental,
      staffIndex,
    });
  }

  // Build staffs with keyboards from programs
  const staffs: { index: number; keyboard: number; rawEventLines: string[] }[] = [];
  const durationMap: Record<number, number> = {
    0: 16, 1: 8, 2: 4, 3: 2, 4: 1, 5: 0.5, 6: 0.25, 7: 0.125
  };

  const getClosestDurationCode = (steps: number) => {
    for (const [code, beats] of Object.entries(durationMap)) {
      if (beats <= steps) return { code: parseInt(code), stepsUsed: beats };
    }
    return { code: 6, stepsUsed: 0.5 };
  };

  for (let s = 0; s < maxSimultaneousNotes; s++) {
    const stepMap = staffEvents.get(s)!;
    const rawEventLines: string[] = [];
    const keyboardId = getKeyboardFromProgram(notes[0]?.program);

    let t = 0;
    while (t < maxStep) {
      const notesStarting = stepMap.get(t);
      if (notesStarting && notesStarting.length > 0) {
        const minDuration = Math.min(...notesStarting.map(n => n.durationSteps));
        const { code: durCode, stepsUsed } = getClosestDurationCode(minDuration);
        const glyphStrings = notesStarting.map(n => {
          const accStr = n.accidental ? `${n.accidental}` : "";
          return `N:${n.staffIndex}&${durCode}&${accStr}&&&`;
        });
        rawEventLines.push(`0&${durCode}&9&&&&&&&&&&&&&&&&&&&&&&&&&&&&&,${glyphStrings.join(",")}`);
        t += stepsUsed;
        for (let fill = 1; fill < stepsUsed; fill++) {
          rawEventLines.push("-1&-1&");
        }
      } else {
        let nextNoteTime = maxStep;
        for (const startStep of Array.from(stepMap.keys())) {
          if (startStep > t) {
            nextNoteTime = Math.min(nextNoteTime, startStep);
          }
        }
        const silenceSteps = nextNoteTime - t;
        const { code: durCode, stepsUsed } = getClosestDurationCode(silenceSteps);
        rawEventLines.push(`1&${durCode}&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&`);
        t += stepsUsed;
        for (let fill = 1; fill < stepsUsed; fill++) {
          rawEventLines.push("-1&-1&");
        }
      }
    }

    staffs.push({
      index: s,
      keyboard: keyboardId,
      rawEventLines,
    });
  }

  return {
    maestroDocument: {
      header: {
        title,
        bpm,
        numerator: timeSig.numerator,
        denominator: timeSig.denominator,
        working: 25,
      },
      staffs,
    },
    positions: notes,
  };
}

// Extract positions from WebMscore score
export async function extractPositionsFromScore(score: any): Promise<PositionsData> {
  // This would use WebMscore's internal API to extract note positions
  // For now, placeholder - the dashboard has the WebMscore integration
  const xml = await score.saveXml();
  // Parse XML to positions...
  return {
    positions: [],
    bpm: 120,
    timeSignature: { numerator: 4, denominator: 4 },
  };
}