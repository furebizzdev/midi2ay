import type { MaestroAyDocument, MaestroAyStaff } from "../types/maestroAy.js";
import type { MaestroAyRawEventToken } from "../maestroAy/decodeMaestroAyEvents.js";

export type MaestroDebugNote = {
  staffIndex: number;
  stepIndex: number | null;
  glyphText: string;
};

export type MaestroDebugJson = {
  header: MaestroAyDocument["header"];
  staffNotes: MaestroDebugNote[];
  rawTokensCount: number;
};

function extractStepIndexHeuristic(rawEventLine: string): number | null {
  // Heurística: nas linhas placeholder que estamos gerando, começa com "0&6&9&&...".
  // Nos seus exemplos reais, o formato do prefixo pode variar, mas geralmente existe um número de “posição”.
  // Aqui tentamos pegar o primeiro número antes de "&".
  const m = rawEventLine.match(/^\s*(-?\d+)&/);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

function extractGlyphTexts(rawEventLine: string): string[] {
  // Ex: "...,N:-5&6" ou "...,N:0&6, ..."
  const glyphRegex = /N:([^\s,&]+)/g;
  const out: string[] = [];
  for (const match of rawEventLine.matchAll(glyphRegex)) {
    if (match[0]) out.push(match[0]);
  }
  return out;
}

function staffToDebug(staff: MaestroAyStaff): MaestroDebugNote[] {
  const notes: MaestroDebugNote[] = [];
  for (const raw of staff.rawEventLines) {
    const stepIndex = extractStepIndexHeuristic(raw);
    const glyphs = extractGlyphTexts(raw);
    for (const glyphText of glyphs) {
      notes.push({
        staffIndex: staff.index,
        stepIndex,
        glyphText,
      });
    }
  }
  return notes;
}

export function maestroAyDocumentToDebugJson(doc: MaestroAyDocument): MaestroDebugJson {
  let rawTokensCount = 0;
  const staffNotes: MaestroDebugNote[] = [];

  for (const staff of doc.staffs) {
    rawTokensCount += staff.rawEventLines.length;
    staffNotes.push(...staffToDebug(staff));
  }

  return {
    header: doc.header,
    staffNotes,
    rawTokensCount,
  };
}
