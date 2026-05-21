// Position-based conversion for Maestro AY (Dashboard version)
// This is an intermediate format between parsed MIDI/WebMscore and Maestro AY

const DURATION_MAP = [
  { code: 0, beats: 4.0 },
  { code: 1, beats: 2.0 },
  { code: 2, beats: 1.0 },
  { code: 3, beats: 0.5 },
  { code: 4, beats: 0.25 },
  { code: 5, beats: 0.125 },
  { code: 6, beats: 0.0625 },
  { code: 7, beats: 0.03125 },
];

function getClosestDurationCode(steps, timeStepsPerQuarter) {
  for (const item of DURATION_MAP) {
    const itemSteps = item.beats * timeStepsPerQuarter;
    if (itemSteps <= steps) {
      return { code: item.code, stepsUsed: itemSteps };
    }
  }
  const minSteps = 0.125 * timeStepsPerQuarter;
  if (minSteps >= 1) {
    return { code: 7, stepsUsed: Math.max(1, Math.round(minSteps)) };
  }
  return { code: 6, stepsUsed: Math.max(1, Math.round(0.25 * timeStepsPerQuarter)) };
}

// MIDI to Maestro staffIndex conversion
function midiToStaffIndexAndAccidental(midi) {
  const naturalSteps = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const isSharp = [false, true, false, true, false, false, true, false, true, false, true, false];
  const semitone = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const staffIndex = (octave - 4) * 7 + naturalSteps[semitone];
  const accidental = isSharp[semitone] ? "2" : "";
  return { staffIndex, accidental };
}

// Keyboard mapping from MIDI program
function getKeyboardFromProgram(program) {
  if (!program) return 9;
  if (program >= 1 && program <= 8) return 9;
  if (program >= 9 && program <= 16) return 9;
  if (program >= 17 && program <= 24) return 1;
  if (program >= 25 && program <= 32) return 5;
  if (program >= 33 && program <= 40) return 12;
  if (program >= 41 && program <= 48) return 8;
  if (program >= 81 && program <= 104) return 3;
  if (program >= 105 && program <= 112) return 7;
  if (program >= 113 && program <= 128) return 2;
  return 9;
}

export function positionsToMaestroAy(positions, opts = {}) {
  const title = opts.title || "Converted";
  const bpm = opts.bpm || 120;
  const timeSig = opts.timeSignature || { numerator: 4, denominator: 4 };
  const maxSimultaneousNotes = opts.maxSimultaneousNotes ?? 4;
  const timeStepsPerQuarter = opts.maestroTimeStepsPerQuarter || 4;

  const notes = [...positions].sort((a, b) => a.time - b.time);

  const stepNotes = notes.map(n => ({
    startSteps: Math.round(n.time * timeStepsPerQuarter),
    durationSteps: Math.max(1, Math.round(n.duration * timeStepsPerQuarter)),
    midi: n.pitch,
    staff: n.staff,
    velocity: n.velocity,
    program: n.program,
  }));

  let maxStep = 0;
  for (const n of stepNotes) {
    maxStep = Math.max(maxStep, n.startSteps + n.durationSteps);
  }

  const staffActiveNotes = Array.from({ length: maxSimultaneousNotes }, () => []);
  const staffEvents = new Map();
  for (let s = 0; s < maxSimultaneousNotes; s++) {
    staffEvents.set(s, new Map());
  }

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
    const stepMap = staffEvents.get(allocatedStaff);
    if (!stepMap.has(note.startSteps)) {
      stepMap.set(note.startSteps, []);
    }
    stepMap.get(note.startSteps).push({
      midi: note.midi,
      durationSteps: note.durationSteps,
      accidental,
      staffIndex,
    });
  }

  const staffs = [];

  for (let s = 0; s < maxSimultaneousNotes; s++) {
    const stepMap = staffEvents.get(s);
    const rawEventLines = [];
    const keyboardId = getKeyboardFromProgram(notes[0]?.program);

    let t = 0;
    while (t < maxStep) {
      const notesStarting = stepMap.get(t);
      if (notesStarting && notesStarting.length > 0) {
        const minDuration = Math.min(...notesStarting.map(n => n.durationSteps));
        const { code: durCode, stepsUsed } = getClosestDurationCode(minDuration, timeStepsPerQuarter);
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
        const { code: durCode, stepsUsed } = getClosestDurationCode(silenceSteps, timeStepsPerQuarter);
        rawEventLines.push(`1&${durCode}&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&`);
        t += stepsUsed;
        for (let fill = 1; fill < stepsUsed; fill++) {
          rawEventLines.push("-1&-1&");
        }
      }
    }

    staffs.push({
      index: s,
      octave: 0,
      transpose: 0,
      keyboard: keyboardId,
      bracketTop: "connect",
      bracketBottom: "connect",
      visible: "show",
      lineColor: 0,
      instrument3: 0,
      instrument4: 0,
      rawEventLines,
      embeddedMeta: [],
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