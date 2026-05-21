/**
 * instrumentMap.ts
 *
 * Tabela de configuração centralizada para mapeamento de instrumentos
 * ao keyboard ID do Maestro. Edite aqui ao invés de caçar if/else no código.
 *
 * Fontes de mapeamento (em ordem de prioridade):
 *  1. Canal MIDI 10 → sempre percussão
 *  2. Programa MIDI (1–128) → faixas da tabela programRanges
 *  3. Nome do instrumento  → palavras-chave da tabela nameKeywords
 *  4. Fallback              → KEYBOARD_PIANO
 */

// ─── Keyboard IDs do Maestro ──────────────────────────────────────────────────
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
} as const;

export type KeyboardId = typeof KEYBOARD[keyof typeof KEYBOARD];

// ─── Mapeamento por faixa de programa MIDI (1-based, inclusive) ───────────────
export interface ProgramRange {
  min: number;
  max: number;
  keyboard: KeyboardId;
  label?: string;
}

export const PROGRAM_RANGES: ProgramRange[] = [
  { min:   1, max:   8, keyboard: KEYBOARD.PIANO,      label: "Piano" },
  { min:   9, max:  16, keyboard: KEYBOARD.PIANO,      label: "Chromatic Perc" },
  { min:  17, max:  24, keyboard: KEYBOARD.ORGAN,      label: "Organ" },
  { min:  25, max:  32, keyboard: KEYBOARD.GUITAR,     label: "Guitar" },
  { min:  33, max:  40, keyboard: KEYBOARD.BASS,       label: "Bass" },
  { min:  41, max:  41, keyboard: KEYBOARD.STRINGS,    label: "Violin" },
  { min:  42, max:  43, keyboard: KEYBOARD.CELLO,      label: "Viola / Cello" },
  { min:  44, max:  56, keyboard: KEYBOARD.STRINGS,    label: "Strings / Ensemble" },
  { min:  57, max:  64, keyboard: KEYBOARD.BRASS,      label: "Brass" },
  { min:  65, max:  80, keyboard: KEYBOARD.WOODWIND,   label: "Woodwind" },
  { min:  81, max: 104, keyboard: KEYBOARD.SYNTH,      label: "Synth" },
  { min: 105, max: 112, keyboard: KEYBOARD.ETHNIC,     label: "Ethnic" },
  { min: 113, max: 128, keyboard: KEYBOARD.PERCUSSION, label: "Percussion / Effects" },
];

// ─── Mapeamento por palavras-chave no nome do instrumento (fallback) ──────────
export interface NameRule {
  keywords: string[];
  keyboard: KeyboardId;
}

export const NAME_RULES: NameRule[] = [
  { keywords: ["drum","snare","kick","cymbal","hi-hat","hihat","bongo","conga",
                "tambourine","cabasa","shaker","marimba","xylophone","vibraphone",
                "percussion","gong","cowbell"],
    keyboard: KEYBOARD.PERCUSSION },
  { keywords: ["cello","violoncello"],             keyboard: KEYBOARD.CELLO },
  { keywords: ["contrabass","double bass","str. bass","electric bass","bass guitar"],
    keyboard: KEYBOARD.BASS },
  { keywords: ["bass"],                            keyboard: KEYBOARD.BASS },
  { keywords: ["violin","viola","fiddle","harp","string"],
    keyboard: KEYBOARD.STRINGS },
  { keywords: ["guitar","banjo","ukulele","lute"], keyboard: KEYBOARD.GUITAR },
  { keywords: ["piano","harpsichord","clavinet","celesta","electric piano","keyboard"],
    keyboard: KEYBOARD.PIANO },
  { keywords: ["organ","accordion","harmonica"],   keyboard: KEYBOARD.ORGAN },
  { keywords: ["flute","piccolo","oboe","clarinet","bassoon","saxophone","sax","recorder","fife"],
    keyboard: KEYBOARD.WOODWIND },
  { keywords: ["trumpet","trombone","tuba","horn","brass","cornet","flugelhorn","euphonium"],
    keyboard: KEYBOARD.BRASS },
  { keywords: ["synth","pad","lead","electronic"], keyboard: KEYBOARD.SYNTH },
  { keywords: ["ethnic","sitar","shamisen","koto","banjo","dulcimer"],
    keyboard: KEYBOARD.ETHNIC },
];

// ─── Funções de resolução ─────────────────────────────────────────────────────

/** Resolve keyboard ID a partir de programa MIDI (1-based). */
export function keyboardFromProgram(program: number): KeyboardId {
  for (const r of PROGRAM_RANGES) {
    if (program >= r.min && program <= r.max) return r.keyboard;
  }
  return KEYBOARD.PIANO;
}

/** Resolve keyboard ID a partir do nome do instrumento (fallback). */
export function keyboardFromName(name: string): KeyboardId {
  const lower = name.toLowerCase();
  for (const rule of NAME_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) return rule.keyboard;
  }
  return KEYBOARD.PIANO;
}

/** Ponto de entrada principal: canal → programa → nome → padrão. */
export function resolveKeyboard(opts: {
  midiChannel?: number;
  midiProgram?: number;
  name?: string;
}): KeyboardId {
  if (opts.midiChannel === 10) return KEYBOARD.PERCUSSION;  // Canal 10 = percussão sempre
  if (opts.midiProgram !== undefined && opts.midiProgram >= 1)
    return keyboardFromProgram(opts.midiProgram);
  if (opts.name) return keyboardFromName(opts.name);
  return KEYBOARD.PIANO;
}
