import type { MaestroAyDocument, MaestroAyHeader, MaestroAyStaff } from "../types/maestroAy.js";

function parseNumberMaybe(value: string): number | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function stripEmptyLines(lines: string[]): string[] {
  return lines.map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
}

/**
 * Parser conservador do formato .ay do app Maestro.
 *
 * Ele:
 * - Lê o header (Título, bpm, numerador/denominador, working)
 * - Divide por "NEW STAFF"
 * - Coleta metadados de cada staff
 * - Guarda as linhas de eventos cruas (as linhas que não parecem meta)
 * - Guarda linhas meta embutidas (ex: "LAYER:1.0_0.5", "TAIL_UP:0.0")
 *
 * Depois, outro módulo interpreta rawEventLines para pitch/timing.
 */
export function parseMaestroAyText(text: string): MaestroAyDocument {
  const lines = stripEmptyLines(text.split(/\r?\n/));
  if (lines.length < 5) throw new Error("Arquivo .ay muito curto/ inválido.");

  // Exemplos:
  // My Music
  // Maestro
  // 114
  // 4
  // 4
  // working
  // 25
  // ...
  const title = lines[0];
  // lines[1] = Maestro (string fixa)
  const bpm = parseNumberMaybe(lines[2]);
  if (bpm === undefined) throw new Error("Não consegui parsear BPM.");

  const numerator = parseNumberMaybe(lines[3]);
  const denominator = parseNumberMaybe(lines[4]);
  if (numerator === undefined || denominator === undefined) throw new Error("Não consegui parsear compasso.");

  const workingIndex = lines.findIndex((l) => l.trim() === "working");
  if (workingIndex === -1) throw new Error('Não achei a palavra "working".');

  const working = parseNumberMaybe(lines[workingIndex + 1]);
  if (working === undefined) throw new Error("Não consegui parsear working (valor após 'working').");

  const header: MaestroAyHeader = { title, bpm, numerator, denominator, working };

  const staffs: MaestroAyStaff[] = [];
  let i = workingIndex + 2;

  while (i < lines.length) {
    if (lines[i].trim() === "NEW STAFF") {
      const indexLine = lines[i + 1];
      const index = parseNumberMaybe(indexLine);
      if (index === undefined) throw new Error("NEW STAFF sem id numérico.");

      const staff: MaestroAyStaff = {
        index,
        octave: 0,
        transpose: 0,
        keyboard: 0,
        rawEventLines: [],
        embeddedMeta: [],
      };

      i += 2;

      // Lê até achar "NEW STAFF" ou final do arquivo.
      while (i < lines.length && lines[i].trim() !== "NEW STAFF") {
        const line = lines[i].trim();

        if (line.startsWith("OCTAVE:")) {
          const v = parseNumberMaybe(line.split(":")[1]);
          if (v === undefined) throw new Error("OCTAVE inválido.");
          staff.octave = v;
        } else if (line.startsWith("TRANSPOSE:")) {
          const v = parseNumberMaybe(line.split(":")[1]);
          if (v === undefined) throw new Error("TRANSPOSE inválido.");
          staff.transpose = v;
        } else if (line.startsWith("KEYBOARD:")) {
          const v = parseNumberMaybe(line.split(":")[1]);
          if (v === undefined) throw new Error("KEYBOARD inválido.");
          staff.keyboard = v;
        } else if (line.startsWith("VISIBLE:")) {
          staff.visible = line.split(":")[1] ?? "";
        } else if (line.startsWith("LINE_COLOR:")) {
          staff.lineColor = line.split(":")[1] ?? "";
        } else if (line.startsWith("INSTRUMENT3:")) {
          staff.instrument3 = line.split(":")[1] ?? "";
        } else if (line.startsWith("INSTRUMENT4:")) {
          staff.instrument4 = line.split(":")[1] ?? "";
        } else if (line.startsWith("BRACKET_TOP:")) {
          staff.bracketTop = line.split(":")[1] ?? "";
        } else if (line.startsWith("BRACKET_BOTTOM:")) {
          staff.bracketBottom = line.split(":")[1] ?? "";
        } else if (line.startsWith("LAYER:")) {
          // LAYER aparece como parte do “stream” de tokens às vezes; ainda assim guardamos.
          staff.embeddedMeta.push(line);
        } else if (line.startsWith("TAIL_UP:")) {
          staff.embeddedMeta.push(line);
        } else if (line.startsWith("COLOR_NOTE:")) {
          // não precisamos interpretar agora
        } else if (line === "WORKING" || line === "COMPLETED") {
          // ignora marcadores desconhecidos
        } else if (line.includes(":") && (line.includes("LAYER") || line.includes("TAIL_UP"))) {
          // caso "meta" venha junto (raramente)
          staff.embeddedMeta.push(line);
        } else if (line.includes("&&&&&&") || line.includes("0&") || line.includes("1&") || line.includes("-1&") || line.includes("2&")) {
          // heurística: linhas “de eventos” costumam ter muitos '&' e começam com dígitos "&".
          staff.rawEventLines.push(line);
        } else {
          // Alguns arquivos colocam linhas como "1&1&&&&&..." sem precedente.
          // Mantemos como evento se parecer com o padrão.
          const looksLikeEvent = /-?\d+&-?\d+&/.test(line) || /^-?\d+&-?\d+&/.test(line) || line.includes("&&&&");
          if (looksLikeEvent) staff.rawEventLines.push(line);
        }

        i++;
      }

      staffs.push(staff);
      continue;
    }

    // Marcadores extras (COMPLETED etc.) antes do primeiro staff:
    i++;
  }

  return { header, staffs };
}
