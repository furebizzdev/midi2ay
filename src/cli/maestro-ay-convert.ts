import { convertMidiToMaestroAy } from "../converters/convertMidiToMaestroAy.js";
import { parseMidiToNoteEvents } from "../midi/parseMidi.js";
import { serializeMaestroAy } from "../maestroAy/serializeMaestroAy.js";
import { loadBinaryFile, saveTextFileUtf8 } from "../utils/io.js";

type CliArgs = {
  input: string;
  output: string;
  title?: string;
  maxSimultaneousNotes?: number;
  maestroTimeStepsPerQuarter?: number;
  trimSilence?: boolean;
  sequential?: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value) throw new Error(`Missing value for --${key}`);
    args.set(key, value);
    i++;
  }

  const input = args.get("input");
  const output = args.get("output");
  const title = args.get("title");
  
  const maxSimNotesStr = args.get("maxSimultaneousNotes");
  const maxSimultaneousNotes = maxSimNotesStr ? Number(maxSimNotesStr) : undefined;

  const timeStepsStr = args.get("maestroTimeStepsPerQuarter");
  const maestroTimeStepsPerQuarter = timeStepsStr ? Number(timeStepsStr) : undefined;

  const trimSilenceStr = args.get("trimSilence");
  const trimSilence = trimSilenceStr !== undefined ? trimSilenceStr === "true" : undefined;

  const sequentialStr = args.get("sequential");
  const sequential = sequentialStr !== undefined ? sequentialStr === "true" : undefined;

  if (!input || !output) {
    throw new Error(
      "Uso: node dist/cli/maestro-ay-convert.js --input arquivo.mid --output arquivo.ay [--title 'Nome'] [--maxSimultaneousNotes 1] [--maestroTimeStepsPerQuarter 4] [--trimSilence true] [--sequential true]"
    );
  }

  return { input, output, title, maxSimultaneousNotes, maestroTimeStepsPerQuarter, trimSilence, sequential };
}

// POLYFILL 1: Redefinir navigator para ser gravável e contornar bug do Node 22/24 no webmscore
const mockNavigator = {
  userAgent: 'node',
  platform: 'win32'
};
Object.defineProperty(globalThis, 'navigator', {
  value: mockNavigator,
  writable: true,
  configurable: true
});

// POLYFILL 2: Deletar a função fetch nativa para forçar o webmscore a ler usando fs (evita erro de scheme no Node)
Object.defineProperty(globalThis, 'fetch', {
  value: undefined,
  writable: true,
  configurable: true
});

async function main() {
  const { default: processDefault } = await import("node:process");
  const argv = processDefault.argv as string[];
  const cli = parseArgs(argv);

  console.log(`Lendo arquivo MIDI: ${cli.input}...`);
  const midiBytes = await loadBinaryFile(cli.input);

  let convertedDoc;

  try {
    console.log("Tentando conversão de alto nível via motor MuseScore (WebMscore WebAssembly)...");
    const WebMscoreModule = await import("webmscore");
    const WebMscore = WebMscoreModule.default;
    await WebMscore.ready;

    console.log("Carregando MIDI no motor do MuseScore...");
    const score = await WebMscore.load("midi", midiBytes, [], false);

    console.log("Transcrição profissional concluída! Exportando MusicXML...");
    const xmlContent = await score.saveXml();
    
    // DEBUG: Save intermediate XML to inspect transpose
    const { saveTextFileUtf8 } = await import("../utils/io.js");
    await saveTextFileUtf8("debug_webmscore_output.xml", xmlContent);
    
    console.log("Convertendo MusicXML para o formato Maestro .ay...");
    const { convertMusicXmlToMaestroAy } = await import("../converters/convertMusicXmlToMaestroAy.js");
    const { maestroDocument } = convertMusicXmlToMaestroAy(xmlContent, {
      title: cli.title || "Converted Music",
      maxSimultaneousNotes: cli.maxSimultaneousNotes,
      maestroTimeStepsPerQuarter: cli.maestroTimeStepsPerQuarter,
      trimSilence: cli.trimSilence,
    });
    convertedDoc = maestroDocument;
    console.log("Conversão premium via MuseScore concluída com sucesso absoluto!");
  } catch (err: any) {
    console.warn(`Aviso: Não foi possível usar o motor MuseScore (${err.message || err}).`);
    console.warn("Caindo de volta para a conversão direta de MIDI nativa...");

    console.log("Parseando eventos MIDI nativos...");
    const parsedMidi = parseMidiToNoteEvents(midiBytes);
    console.log(`Encontradas ${parsedMidi.notes.length} notas no MIDI original.`);

    console.log("Convertendo para o formato Maestro .ay...");
    const { maestroDocument } = convertMidiToMaestroAy(parsedMidi, {
      title: cli.title || "Converted Music",
      maxSimultaneousNotes: cli.maxSimultaneousNotes,
      maestroTimeStepsPerQuarter: cli.maestroTimeStepsPerQuarter,
      trimSilence: cli.trimSilence,
      sequential: cli.sequential,
    });
    convertedDoc = maestroDocument;
  }

  console.log("Serializando documento .ay...");
  const ayContent = serializeMaestroAy(convertedDoc);

  console.log(`Gravando resultado em: ${cli.output}...`);
  await saveTextFileUtf8(cli.output, ayContent);

  console.log("Conversão concluída com sucesso!");
}

main().catch((err) => {
  console.error("Erro na conversão:", err.message || err);
  process.exit(1);
});
