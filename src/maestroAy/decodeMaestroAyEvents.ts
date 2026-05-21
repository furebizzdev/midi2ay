import type { MaestroAyStaff } from "../types/maestroAy.js";

export type MaestroAyRawEventToken =
  | { kind: "pitchGlyph"; text: string } // ex: "N:-5&6"
  | { kind: "row"; text: string } // linha “transportadora” tipo "0&6&9&&1..."
  | { kind: "embeddedMeta"; text: string };

export type DecodedMaestroAyStaffEvents = {
  staffIndex: number;
  tokens: MaestroAyRawEventToken[];
};

/**
 * Decodificação inicial (heurística) das linhas cruas do staff.
 *
 * Objetivo nesta fase:
 * - Preservar informação estrutural
 * - Separar tokens do “stream” para permitir mapeamento posterior
 *
 * Observações:
 * - Os exemplos do Maestro usam separadores '&' e marcadores "N:...".
 * - Existem também tags embedded como LAYER:... e TAIL_UP:...
 */
export function decodeMaestroAyStaffEvents(staff: MaestroAyStaff): DecodedMaestroAyStaffEvents {
  const tokens: MaestroAyRawEventToken[] = [];

  for (const meta of staff.embeddedMeta) {
    tokens.push({ kind: "embeddedMeta", text: meta });
  }

  for (const rawLine of staff.rawEventLines) {
    tokens.push({ kind: "row", text: rawLine });

    // Captura glyphs do tipo "N:-5&6" dentro da linha
    // (onde o valor após N: também contém '&' e sinais).
    const glyphRegex = /N:([^\s,]+)/g;
    for (const match of rawLine.matchAll(glyphRegex)) {
      const full = match[0]; // "N:-5&6"
      const value = match[1];
      if (typeof value === "string" && value.length > 0) {
        tokens.push({ kind: "pitchGlyph", text: full });
      }
    }

    // Outros marcadores (possível futura extensão)
    // ex: "LAYER:1.0_0.5" às vezes aparecem dentro do stream.
    if (rawLine.includes("LAYER:")) {
      const layerMatch = rawLine.match(/LAYER:([^\s,&]+)/);
      if (layerMatch?.[0]) tokens.push({ kind: "embeddedMeta", text: layerMatch[0] });
    }
  }

  return { staffIndex: staff.index, tokens };
}
