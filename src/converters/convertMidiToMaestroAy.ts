import type { MaestroAyDocument, MaestroAyHeader, MaestroAyStaff, MidiNoteEvent } from "../types/maestroAy.js";

// Constants for Maestro AY format
export const STEPS_PER_MEASURE = 16; // 4/4 time signature with 4 steps per quarter note
export const DEFAULT_TIME_STEPS_PER_QUARTER = 4;
export const DEFAULT_MAX_SIMULTANEOUS_NOTES = 1;
export const DEFAULT_BPM = 120;

export const DURATION_MAP = [
  // Códigos reais do Maestro: começam em 2 (não 0)
  { code: 2, beats: 4.0 },   // Semibreve  (Whole)
  { code: 3, beats: 2.0 },   // Mínima     (Half)
  { code: 4, beats: 1.0 },   // Semínima   (Quarter)
  { code: 5, beats: 0.5 },   // Colcheia   (Eighth)
  { code: 6, beats: 0.25 },  // Semicolcheia (Sixteenth)
  { code: 7, beats: 0.125 }, // Fusa       (32nd)
];

export function getClosestDurationCode(steps: number, timeStepsPerQuarter: number): { code: number; stepsUsed: number } {
  for (const item of DURATION_MAP) {
    const itemSteps = item.beats * timeStepsPerQuarter;
    if (itemSteps <= steps) {
      return { code: item.code, stepsUsed: itemSteps };
    }
  }
  // Fallback: fusa (menor valor suportado)
  return { code: 7, stepsUsed: Math.max(1, Math.round(0.125 * timeStepsPerQuarter)) };
}

// Order of accidentals in key signature
const SHARPS = ["F", "C", "G", "D", "A", "E", "B"];
const FLATS = ["B", "E", "A", "D", "G", "C", "F"];

function getKeyAlterations(k: number): Map<string, number> {
  const alters = new Map<string, number>();
  if (k > 0) {
    for (let i = 0; i < Math.min(k, 7); i++) {
      alters.set(SHARPS[i], 1);
    }
  } else if (k < 0) {
    const absK = Math.abs(k);
    for (let i = 0; i < Math.min(absK, 7); i++) {
      alters.set(FLATS[i], -1);
    }
  }
  return alters;
}

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_OFFSETS = [0, 2, 4, 5, 7, 9, 11];

const DIA_SHARP = [0,0,1,1,2,3,3,4,4,5,5,6];
const DIA_FLAT  = [0,1,1,2,2,3,4,4,5,5,6,6];
const IS_ALTERED = [false,true,false,true,false,false,true,false,true,false,true,false];

export function midiToStaffIndexAndAccidental(midiNumber: number, keySignatureSharpsFlats = 0) {
  const sem      = ((midiNumber % 12) + 12) % 12;
  const oct      = Math.floor(midiNumber / 12) - 1;
  const useFlat  = keySignatureSharpsFlats < 0;
  const diaStep  = useFlat ? DIA_FLAT[sem] : DIA_SHARP[sem];
  const staffIndex  = (oct - 4) * 7 + diaStep;
  const accidental  = IS_ALTERED[sem] ? (useFlat ? "1" : "2") : "";
  return { staffIndex, accidental };
}


export function getKeyboardFromProgram(program: number | undefined): number {
  if (!program || program <= 0) return 1; // Grand Piano default
  if (program <= 8)   return 1;  // Piano
  if (program <= 16)  return 1;  // Chromatic Perc
  if (program <= 24)  return 2;  // Organ
  if (program <= 32)  return 5;  // Guitar
  if (program <= 40)  return 12; // Bass
  if (program <= 56)  return 8;  // Strings / Ensemble
  if (program <= 80)  return 8;  // Brass / Synth brass
  if (program <= 104) return 3;  // Synth lead/pad
  if (program <= 112) return 7;  // Ethnic
  return 1; // default
}

export type ConvertMidiToMaestroAyOptions = {
  title?: string;
  maxSimultaneousNotes?: number;
  maestroTimeStepsPerQuarter?: number;
  trimSilence?: boolean;
  sequential?: boolean;
};

export function convertMidiToMaestroAy(
  parsedMidi: { bpm?: number; ticksPerQuarter: number; notes: MidiNoteEvent[] },
  opts: ConvertMidiToMaestroAyOptions = {}
): {
  maestroDocument: MaestroAyDocument;
  normalizedMidiNotes: MidiNoteEvent[];
} {
  const title = opts.title || "My Music";
  const maxSimultaneousNotes = opts.maxSimultaneousNotes !== undefined ? opts.maxSimultaneousNotes : DEFAULT_MAX_SIMULTANEOUS_NOTES;
  const timeStepsPerQuarter = opts.maestroTimeStepsPerQuarter || DEFAULT_TIME_STEPS_PER_QUARTER;
  const trimSilence = opts.trimSilence !== false; // default true
  const sequential = opts.sequential === true;

  const bpm = parsedMidi.bpm || DEFAULT_BPM;
  const ticksPerQuarter = parsedMidi.ticksPerQuarter;
  const notes = [...parsedMidi.notes].sort((a, b) => a.startTicks - b.startTicks);

  const minStartTicks = (trimSilence && notes.length > 0) ? notes[0].startTicks : 0;

  // Normalização de tempo: ticks -> passos (grade)
  const stepTicks = ticksPerQuarter / timeStepsPerQuarter;
  let currentStartStep = 0;
  const normalizedNotes = notes.map((n) => {
    const durationSteps = Math.max(1, Math.round(n.durationTicks / stepTicks));
    
    let startStep;
    if (sequential) {
      startStep = currentStartStep;
      currentStartStep += durationSteps;
    } else {
      const relativeTicks = n.startTicks - minStartTicks;
      startStep = Math.round(relativeTicks / stepTicks);
    }

    return {
      ...n,
      startSteps: startStep,
      durationSteps: durationSteps,
    };
  });

  // Determinar extensão total da música em passos
  let maxStep = 0;
  for (const n of normalizedNotes) {
    maxStep = Math.max(maxStep, n.startSteps + n.durationSteps);
  }

  // Arredondar para compasso inteiro de 4/4 (16 passos por compasso)
  const totalSteps = Math.ceil(maxStep / STEPS_PER_MEASURE) * STEPS_PER_MEASURE;

  // Alocação Polifônica (Greedy Voice Allocator)
  // Cada "voz" corresponde a uma staff/track no Maestro.
  type ActiveStaffNote = { startStep: number; endStep: number; midi: number };
  const staffActiveNotes: ActiveStaffNote[][] = Array.from({ length: maxSimultaneousNotes }, () => []);

  // Mapeamento de quais notas vão para qual staff a cada passo
  type NoteOnStep = {
    midi: number;
    durationSteps: number;
    accidental: number | string;
    staffIndex: number; // o valor diatônico gerado
    program?: number;
  };
  const staffEvents: Map<number, Map<number, NoteOnStep[]>> = new Map();
  for (let s = 0; s < maxSimultaneousNotes; s++) {
    staffEvents.set(s, new Map());
  }

  for (const note of normalizedNotes) {
    // Tenta alocar a nota em um canal livre
    let allocatedStaffIdx = -1;
    for (let s = 0; s < maxSimultaneousNotes; s++) {
      const active = staffActiveNotes[s];
      // Verifica se o canal está livre neste startSteps OU se inicia no mesmo instante (acorde!)
      const isFree = active.every((act) => act.endStep <= note.startSteps || act.startStep === note.startSteps);
      if (isFree) {
        allocatedStaffIdx = s;
        break;
      }
    }

    // Se todos canais ocupados, derruba a nota para respeitar polifonia
    if (allocatedStaffIdx === -1) continue;

    // Adiciona nota ativa na staff correspondente
    staffActiveNotes[allocatedStaffIdx].push({
      startStep: note.startSteps,
      endStep: note.startSteps + note.durationSteps,
      midi: note.midi,
    });

    // Mapeia pitch para diatônico
    const { staffIndex, accidental } = midiToStaffIndexAndAccidental(note.midi, keySigSf);

    const stepMap = staffEvents.get(allocatedStaffIdx)!;
    if (!stepMap.has(note.startSteps)) {
      stepMap.set(note.startSteps, []);
    }
    stepMap.get(note.startSteps)!.push({
      midi: note.midi,
      durationSteps: note.durationSteps,
      accidental,
      staffIndex,
      program: (note as any).program,
    });
  }

  // Construir o documento MaestroAyDocument
  const staffs: MaestroAyStaff[] = [];

  for (let s = 0; s < maxSimultaneousNotes; s++) {
    const stepMap = staffEvents.get(s)!;
    const rawEventLines: string[] = [];

    // Metadados iniciais obrigatórios por staff
    rawEventLines.push("1&1&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&"); // Inicializador de andamento/pausa padrão
    rawEventLines.push("-1&-1&"); // Respiro inicial exigido pelo Maestro

    let t = 0;
    while (t < maxStep) {
      // 1. Inserir Barra de Compasso a cada 16 passos
      // (Barlines removidas pois corrompem a sintaxe do Maestro atual)

      // 2. Verificar se há alguma nota iniciando neste tick
      const notesStarting = stepMap.get(t);
      if (notesStarting && notesStarting.length > 0) {
        // Encontra a menor duração entre as notas para determinar a duração da linha/acorde
        const minDuration = Math.min(...notesStarting.map((n) => n.durationSteps));
        const { code: durCode, stepsUsed } = getClosestDurationCode(minDuration, timeStepsPerQuarter);

        // Agrupa todas as notas que iniciam aqui em um acorde
        const glyphStrings = notesStarting.map((n) => {
          // Formato glifo: N:pos&dur&acc&&& (exatamente 5 ampersands para conformidade com o Maestro)
          const accStr = n.accidental !== "" ? `${n.accidental}` : "";
          return `N:${n.staffIndex}&${durCode}&${accStr}&&&`;
        });

        // Monta a linha de evento de nota
        rawEventLines.push(`0&${durCode}&9&&&&&&&&&&&&&&&&&&&&&&&&&&&&&,${glyphStrings.join(",")}`);

        // Avança o cursor pelos passos ocupados pela nota
        t += stepsUsed;

        // Adiciona eventos de sustentação (-1&-1&)
        for (let fill = 1; fill < stepsUsed; fill++) {
          rawEventLines.push("-1&-1&");
        }
      } else {
        // Encontra quantos passos de silêncio temos até a próxima nota (ou até o fim)
        let nextNoteTime = maxStep;
        for (const startStep of stepMap.keys()) {
          if (startStep > t && startStep < nextNoteTime) {
            nextNoteTime = startStep;
          }
        }
        const silenceSteps = nextNoteTime - t;
        const { code: durCode, stepsUsed } = getClosestDurationCode(silenceSteps, timeStepsPerQuarter);
        
        // Pausa oficial desenhada no Maestro (começa com 1&)
        rawEventLines.push(`1&${durCode}&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&`);
        
        t += stepsUsed;
        for (let fill = 1; fill < stepsUsed; fill++) {
          rawEventLines.push("-1&-1&");
        }
      }
    }

    // (End barline removida pois corrompe a sintaxe do Maestro atual)

    // Detectar clef e timbre pela tessitura e programa
    const allMidis = [...(staffEvents.get(s)?.values() ?? [])].flat().map(n => n.midi);
    const avgMidi = allMidis.length ? allMidis.reduce((a, b) => a + b, 0) / allMidis.length : 60;
    const isBass = avgMidi < 55; // abaixo de G3 → clave de fá
    const firstProgram = [...(staffEvents.get(s)?.values() ?? [])].flat()[0]?.program;
    const keyboard = firstProgram ? getKeyboardFromProgram(firstProgram) : (isBass ? 2 : 1);

    staffs.push({
      index: s,
      octave: 0,
      transpose: 0,
      keyboard,
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

  const header: MaestroAyHeader = {
    title,
    bpm,
    numerator: 4,
    denominator: 4,
    working: 25,
  };

  return {
    maestroDocument: { header, staffs },
    normalizedMidiNotes: notes,
  };
}
