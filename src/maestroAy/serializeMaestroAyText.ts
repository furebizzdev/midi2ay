import type { MaestroAyDocument, MaestroAyStaff } from "../types/maestroAy.js";

function serializeStaff(staff: MaestroAyStaff): string {
  const lines: string[] = [];
  lines.push("NEW STAFF");
  lines.push(String(staff.index));

  if (staff.octave !== undefined) lines.push(`OCTAVE:${staff.octave}`);
  if (staff.transpose !== undefined) lines.push(`TRANSPOSE:${staff.transpose}`);
  if (staff.keyboard !== undefined) lines.push(`KEYBOARD:${staff.keyboard}`);

  // Metas opcionais (mantemos simples)
  if (staff.visible !== undefined) lines.push(`VISIBLE:${staff.visible}`);
  if (staff.lineColor !== undefined) lines.push(`LINE_COLOR:${staff.lineColor}`);
  if (staff.instrument3 !== undefined) lines.push(`INSTRUMENT3:${staff.instrument3}`);
  if (staff.instrument4 !== undefined) lines.push(`INSTRUMENT4:${staff.instrument4}`);

  if (staff.bracketTop !== undefined) lines.push(`BRACKET_TOP:${staff.bracketTop}`);
  if (staff.bracketBottom !== undefined) lines.push(`BRACKET_BOTTOM:${staff.bracketBottom}`);

  // marcador que aparece nos exemplos
  lines.push("COLOR_NOTE:false");
  lines.push("");

  for (const meta of staff.embeddedMeta) {
    // embeddedMeta no nosso parser/decoder é só preservação textual
    lines.push(meta);
  }

  for (const raw of staff.rawEventLines) {
    lines.push(raw);
  }

  return lines.join("\n");
}

export function serializeMaestroAyDocumentToText(doc: MaestroAyDocument): string {
  const lines: string[] = [];
  lines.push(doc.header.title);
  lines.push("Maestro");
  lines.push(String(doc.header.bpm));
  lines.push(String(doc.header.numerator));
  lines.push(String(doc.header.denominator));
  lines.push("working");
  lines.push(String(doc.header.working));

  for (const staff of doc.staffs) {
    lines.push("");
    lines.push(serializeStaff(staff));
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
