// Constants for Maestro AY format
export const STEPS_PER_MEASURE = 16; // 4/4 time signature with 4 steps per quarter note
export const DEFAULT_TIME_STEPS_PER_QUARTER = 4;
export const DEFAULT_MAX_SIMULTANEOUS_NOTES = 1;
export const DEFAULT_BPM = 120;
// Códigos reais do Maestro: começam em 2 (semibreve=2, mínima=3, semínima=4 ...)
export const DURATION_MAP = [
    { code: 2, beats: 4.0   }, // Semibreve
    { code: 3, beats: 2.0   }, // Mínima
    { code: 4, beats: 1.0   }, // Semínima
    { code: 5, beats: 0.5   }, // Colcheia
    { code: 6, beats: 0.25  }, // Semicolcheia
    { code: 7, beats: 0.125 }, // Fusa
];
export function getClosestDurationCode(steps, timeStepsPerQuarter) {
    for (const item of DURATION_MAP) {
        const itemSteps = item.beats * timeStepsPerQuarter;
        if (itemSteps <= steps) {
            return { code: item.code, stepsUsed: itemSteps };
        }
    }
    // Fallback seguro baseado na fusa ou semicolcheia conforme a resolução
    return { code: 7, stepsUsed: Math.max(1, Math.round(0.125 * timeStepsPerQuarter)) };
}

// Mapeamento de programa MIDI (1-128) para keyboard Maestro
export function getKeyboardFromProgram(program) {
    if (!program || program <= 0) return 1;
    if (program <= 8)   return 1;  // Piano
    if (program <= 16)  return 1;  // Chromatic Perc
    if (program <= 24)  return 2;  // Organ
    if (program <= 32)  return 5;  // Guitar
    if (program <= 40)  return 12; // Bass
    if (program <= 56)  return 8;  // Strings
    if (program <= 80)  return 8;  // Brass
    if (program <= 104) return 3;  // Synth
    if (program <= 112) return 7;  // Ethnic
    return 1;
}

// Order of accidentals in key signature
const SHARPS = ["F", "C", "G", "D", "A", "E", "B"];
const FLATS = ["B", "E", "A", "D", "G", "C", "F"];
function getKeyAlterations(k) {
    const alters = new Map();
    if (k > 0) {
        for (let i = 0; i < Math.min(k, 7); i++) {
            alters.set(SHARPS[i], 1);
        }
    }
    else if (k < 0) {
        const absK = Math.abs(k);
        for (let i = 0; i < Math.min(absK, 7); i++) {
            alters.set(FLATS[i], -1);
        }
    }
    return alters;
}
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
// Tabelas diatônicas: [sustenido/natural, bemol]
// chromatic 0-11 → degrau diatônico (0=C … 6=B)
const DIA_SHARP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // C C# D D# E F F# G G# A A# B
const DIA_FLAT  = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]; // C Db D Eb E F Gb G Ab A Bb B
const IS_ALTERED = [false,true,false,true,false,false,true,false,true,false,true,false];

export function midiToStaffIndexAndAccidental(midiNumber, keySignatureSharpsFlats = 0) {
    const sem  = ((midiNumber % 12) + 12) % 12;
    const oct  = Math.floor(midiNumber / 12) - 1;
    const useFlat = keySignatureSharpsFlats < 0;  // bemóis quando sf < 0
    const diaStep = useFlat ? DIA_FLAT[sem] : DIA_SHARP[sem];
    const staffIndex = (oct - 4) * 7 + diaStep;
    const accidental = IS_ALTERED[sem] ? (useFlat ? "1" : "2") : "";
    return { staffIndex, accidental };
}


export function convertMidiToMaestroAy(parsedMidi, opts = {}) {
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
        }
        else {
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
    const staffActiveNotes = Array.from({ length: maxSimultaneousNotes }, () => []);
    const staffEvents = new Map();
    for (let s = 0; s < maxSimultaneousNotes; s++) {
        staffEvents.set(s, new Map());
    }
    // Metade dos canais para clave de sol, metade para clave de fá
    const numTrebleVoices = Math.ceil(maxSimultaneousNotes / 2);  // ex: 4 → 2 treble
    const numBassVoices   = maxSimultaneousNotes - numTrebleVoices; // ex: 4 → 2 bass

    for (const note of normalizedNotes) {
        // Decide faixa preferida baseado no pitch
        const preferBass  = note.midi < 60;
        const vStart = preferBass ? numTrebleVoices : 0;
        const vEnd   = preferBass ? maxSimultaneousNotes : numTrebleVoices;

        let allocatedStaffIdx = -1;

        // Tenta primeiro na faixa preferida (treble ou bass)
        for (let s = vStart; s < vEnd; s++) {
            const active = staffActiveNotes[s];
            const isFree = active.every(act => act.endStep <= note.startSteps || act.startStep === note.startSteps);
            if (isFree) { allocatedStaffIdx = s; break; }
        }
        // Fallback: qualquer canal livre
        if (allocatedStaffIdx === -1) {
            for (let s = 0; s < maxSimultaneousNotes; s++) {
                const active = staffActiveNotes[s];
                const isFree = active.every(act => act.endStep <= note.startSteps || act.startStep === note.startSteps);
                if (isFree) { allocatedStaffIdx = s; break; }
            }
        }
        if (allocatedStaffIdx === -1) continue; // polifonia máxima atingida
        // Adiciona nota ativa na staff correspondente
        staffActiveNotes[allocatedStaffIdx].push({
            startStep: note.startSteps,
            endStep: note.startSteps + note.durationSteps,
            midi: note.midi,
        });
        // Mapeia pitch para diatônico
        const { staffIndex, accidental } = midiToStaffIndexAndAccidental(note.midi, keySigSf);
        const stepMap = staffEvents.get(allocatedStaffIdx);
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
    // ─ Formatos de linha por clef ───────────────────────────────────────────
    const barlineTreble = (type) => `2&${type}&9&&&&&&&&&&&&&&&&&&&&&&&&&&&&&`;  // 31 &
    const barlineBass   = (type) => `2&${type}&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&`;   // 31 &
    const attackTreble  = (dur, glyphs) => `0&${dur}&9&&&&&&&&&&&&&&&&&&&&&&&&&&&&&,${glyphs}`;
    const attackBass    = (dur, glyphs) => `0&${dur}&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&,${glyphs}`;
    const silenceFn     = (dur) => `1&${dur}&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&`;
    const REST          = "-1&-1&";

    // Construir o documento MaestroAyDocument
    const staffs = [];
    for (let s = 0; s < maxSimultaneousNotes; s++) {
        const stepMap = staffEvents.get(s);

        // Detectar clef e timbre ANTES de gerar as linhas
        const allMidis2 = [...(stepMap?.values() ?? [])].flat().map(n => n.midi);
        const avgMidi2  = allMidis2.length ? allMidis2.reduce((a,b) => a+b, 0) / allMidis2.length : 60;
        // Clef por posição: vozes 0..numTreble-1 = treble, resto = bass
        const isBass    = s >= numTrebleVoices || avgMidi2 < 52;
        const firstProg = [...(stepMap?.values() ?? [])].flat()[0]?.program;
        const keyboard  = firstProg ? getKeyboardFromProgram(firstProg) : (isBass ? 2 : 1);
        const barline   = isBass ? barlineBass : barlineTreble;
        const attack    = isBass ? attackBass  : attackTreble;

        const rawEventLines = [];
        rawEventLines.push("1&1&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&");
        rawEventLines.push(REST);

        let t = 0;
        let prevMeasure = -1;

        while (t < maxStep) {
            // ── Travessão no início de cada novo compasso ──────────────────
            const curMeasure = Math.floor(t / STEPS_PER_MEASURE);
            if (curMeasure > prevMeasure && t > 0) {
                rawEventLines.push(barline(0));
                prevMeasure = curMeasure;
            }
            if (prevMeasure < 0) prevMeasure = 0;

            const notesStarting = stepMap.get(t);
            if (notesStarting && notesStarting.length > 0) {
                const minDuration = Math.min(...notesStarting.map(n => n.durationSteps));
                const { code: durCode, stepsUsed } = getClosestDurationCode(minDuration, timeStepsPerQuarter);
                const glyphStrings = notesStarting.map(n =>
                    `N:${n.staffIndex}&${durCode}&${n.accidental}&&&`
                );
                rawEventLines.push(attack(durCode, glyphStrings.join(",")));
                t += stepsUsed;
                for (let f = 1; f < stepsUsed; f++) rawEventLines.push(REST);
            } else {
                let nextNote = maxStep;
                for (const k of stepMap.keys()) if (k > t && k < nextNote) nextNote = k;
                const silence = nextNote - t;
                const { code: durCode, stepsUsed } = getClosestDurationCode(silence, timeStepsPerQuarter);
                rawEventLines.push(silenceFn(durCode));
                t += stepsUsed;
                for (let f = 1; f < stepsUsed; f++) rawEventLines.push(REST);
            }
        }

        // Marcadores finais (dupla barra)
        rawEventLines.push(barline(4));
        rawEventLines.push(barline(0));

        staffs.push({
            index: s, octave: 0, transpose: 0, keyboard,
            bracketTop: "connect", bracketBottom: "connect",
            visible: "show", lineColor: 0,
            instrument3: 0, instrument4: 0,
            rawEventLines, embeddedMeta: [],
        });
            embeddedMeta: [],
        });
    }
    const header = {
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
