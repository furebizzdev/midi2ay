/**
 * instrumentMap.js — Dashboard version
 * Tabela de configuração centralizada. Edite aqui, não em cadeia de if/else.
 */

export const KEYBOARD = {
  PIANO:      9,
  ORGAN:      1,
  SYNTH:      3,
  BRASS:      4,
  WOODWIND:   6,
  GUITAR:     5,
  BASS:       12,
  STRINGS:    8,
  CELLO:      11,
  PERCUSSION: 2,
  ETHNIC:     7,
};

/** Faixas de programa MIDI (1-based, inclusive) → keyboard Maestro */
export const PROGRAM_RANGES = [
  { min:   1, max:   8, keyboard: 9,  label: "Piano" },
  { min:   9, max:  16, keyboard: 9,  label: "Chromatic Perc" },
  { min:  17, max:  24, keyboard: 1,  label: "Organ" },
  { min:  25, max:  32, keyboard: 5,  label: "Guitar" },
  { min:  33, max:  40, keyboard: 12, label: "Bass" },
  { min:  41, max:  41, keyboard: 8,  label: "Violin" },
  { min:  42, max:  43, keyboard: 11, label: "Viola / Cello" },
  { min:  44, max:  56, keyboard: 8,  label: "Strings / Ensemble" },
  { min:  57, max:  64, keyboard: 4,  label: "Brass" },
  { min:  65, max:  80, keyboard: 6,  label: "Woodwind" },
  { min:  81, max: 104, keyboard: 3,  label: "Synth" },
  { min: 105, max: 112, keyboard: 7,  label: "Ethnic" },
  { min: 113, max: 128, keyboard: 2,  label: "Percussion / Effects" },
];

/** Regras por palavras-chave no nome do instrumento (fallback) */
export const NAME_RULES = [
  { keywords: ["drum","snare","kick","cymbal","hi-hat","hihat","bongo","conga",
               "tambourine","cabasa","shaker","marimba","xylophone","vibraphone",
               "percussion","gong","cowbell"],
    keyboard: 2 },
  { keywords: ["cello","violoncello"],                              keyboard: 11 },
  { keywords: ["contrabass","double bass","str. bass","electric bass","bass guitar"],
    keyboard: 12 },
  { keywords: ["bass"],                                             keyboard: 12 },
  { keywords: ["violin","viola","fiddle","harp","string"],          keyboard: 8  },
  { keywords: ["guitar","banjo","ukulele","lute"],                  keyboard: 5  },
  { keywords: ["piano","harpsichord","clavinet","celesta","electric piano","keyboard"],
    keyboard: 9 },
  { keywords: ["organ","accordion","harmonica"],                    keyboard: 1  },
  { keywords: ["flute","piccolo","oboe","clarinet","bassoon","saxophone","sax","recorder"],
    keyboard: 6 },
  { keywords: ["trumpet","trombone","tuba","horn","brass","cornet","flugelhorn"],
    keyboard: 4 },
  { keywords: ["synth","pad","lead","electronic"],                  keyboard: 3  },
  { keywords: ["ethnic","sitar","shamisen","koto","dulcimer"],      keyboard: 7  },
];

export function keyboardFromProgram(program) {
  for (const r of PROGRAM_RANGES) {
    if (program >= r.min && program <= r.max) return r.keyboard;
  }
  return 9; // PIANO default
}

export function keyboardFromName(name) {
  const lower = name.toLowerCase();
  for (const rule of NAME_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) return rule.keyboard;
  }
  return 9;
}

export function resolveKeyboard({ midiChannel, midiProgram, name } = {}) {
  if (midiChannel === 10) return 2;                                // canal 10 = percussão
  if (midiProgram !== undefined && midiProgram >= 1)
    return keyboardFromProgram(midiProgram);
  if (name) return keyboardFromName(name);
  return 9;
}
