export type MaestroAyHeader = {
  title: string;
  bpm: number;
  numerator: number; // compasso: parte de cima (ex: 4)
  denominator: number; // compasso: parte de baixo (ex: 4)
  working: number; // valor que aparece logo após "working" nos exemplos
};

export type MaestroAyStaff = {
  index: number; // “NEW STAFF” + id
  octave: number; // OCTAVE:...
  transpose: number; // TRANSPOSE:...
  keyboard: number; // KEYBOARD:...
  keyboardMode?: number; // alguns arquivos parecem usar variações; mantemos opcional
  visible?: string | number; // VISIBLE:...
  lineColor?: string | number; // LINE_COLOR:...
  instrument3?: string | number; // INSTRUMENT3:...
  instrument4?: string | number; // INSTRUMENT4:...
  bracketTop?: string;
  bracketBottom?: string;
  layer?: number;

  // As “linhas de eventos” parecem codificar notas/atac-timing.
  // Mantemos como strings para preservar fidelidade ao formato e analisar depois.
  rawEventLines: string[];

  // Ajustes extra que aparecem às vezes dentro dos blocos de evento.
  // Ex: "LAYER:1.0_0.5", "TAIL_UP:0.0"
  embeddedMeta: string[];
};

export type MaestroAyDocument = {
  header: MaestroAyHeader;
  staffs: MaestroAyStaff[];
};

export type MidiNoteEvent = {
  // Pitch em semitons MIDI (0-127)
  midi: number;
  // Início em “ticks” (do próprio parser do MIDI)
  startTicks: number;
  // Duração em ticks
  durationTicks: number;
  // Canal lógico (por enquanto; ajustaremos mapeamento)
  trackIndex: number;
};

export type ConversionContext = {
  // Conversor precisa mapear ticks->passos do Maestro (vamos calibrar).
  maestroTimeStepsPerQuarter?: number;
  // Mapeamento polyphony: quais canais suportados e como distribuir.
  maestroMaxSimultaneousNotes: number;
  // Mapeamento de “voz/canal” para garantir polyphony.
  channelVoiceMap: number[];
};

export type MaestroAyNoteGlyph = {
  // Representa um “glyph” do estilo "N:-5&6" etc.
  // Iremos interpretar depois para converter de/para pitch.
  glyphText: string;
};
