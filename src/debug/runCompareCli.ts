import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { compareMidiToAyApprox } from "./compareMidiToAy.js";

type Args = {
  midi: string;
  ay: string;
  stepsPerQuarter: number;
  outJson?: string;
};

function parseArgs(argv: string[]): Args {
  const map = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const k = t.slice(2);
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) throw new Error(`Missing value for --${k}`);
    map.set(k, v);
    i++;
  }

  const midi = map.get("midi");
  const ay = map.get("ay");
  const spq = map.get("stepsPerQuarter");
  if (!midi || !ay || !spq) {
    throw new Error("Usage: node runCompareCli --midi file.mid --ay file.ay --stepsPerQuarter 4 [--outJson out.json]");
  }

  const stepsPerQuarter = Number(spq);
  if (!Number.isFinite(stepsPerQuarter) || stepsPerQuarter <= 0) {
    throw new Error("--stepsPerQuarter inválido");
  }

  return { midi, ay, stepsPerQuarter, outJson: map.get("outJson") };
}

async function main() {
  const argv = process.argv as string[];
  const args = parseArgs(argv);

  console.log("=== runCompareCli ===");
  console.log("midi:", args.midi);
  console.log("ay:", args.ay);
  console.log("stepsPerQuarter:", args.stepsPerQuarter);
  console.log("outJson:", args.outJson);

  const midiBytes = new Uint8Array(readFileSync(args.midi));
  const ayText = readFileSync(args.ay, { encoding: "utf8" });

  const res = await compareMidiToAyApprox({
    midiBytes,
    ayText,
    stepsPerQuarter: args.stepsPerQuarter,
  });

  console.log("=== Compare Summary ===");
  console.log(`MIDI notes total: ${res.midiNotesTotal}`);
  console.log(`AY raw glyph total: ${res.ayRawGlyphTotal}`);
  console.log(`Steps considered: ${res.matches.length}`);

  const totalMatched = res.matches.reduce((acc, m) => acc + m.matchedByPitchClassApprox, 0);
  console.log(`Matched (approx): ${totalMatched}`);

  if (args.outJson) {
    try {
      const outPath = args.outJson;
      const parent = dirname(outPath);
      if (parent && parent !== ".") mkdirSync(parent, { recursive: true });

      writeFileSync(outPath, JSON.stringify(res, null, 2), { encoding: "utf8" });
      console.log(`Wrote JSON: ${outPath}`);
    } catch (err) {
      console.error("Failed to write outJson:", err);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
