export type ConvertMidiToMaestroAyOptions = {
  title?: string;
  // quantos “canais/vozes” tentar mapear no Maestro
  maxSimultaneousNotes?: number;
  // calibração: ticks do MIDI -> “passos” do Maestro (vamos determinar depois)
  maestroTimeStepsPerQuarter?: number;
};
