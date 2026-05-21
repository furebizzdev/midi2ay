import type { MaestroAyDocument } from "../types/maestroAy.js";

export function serializeMaestroAy(doc: MaestroAyDocument): string {
  const h = doc.header;
  let out = "";
  
  // Header global
  out += `${h.title}\n\n`;
  out += `Maestro\n`;
  out += `${h.bpm}\n`;
  out += `${h.numerator}\n`;
  out += `${h.denominator}\n\n`;
  
  out += `working\n`; // Pode ser 'working' ou 'COMPLETED'
  out += `${h.working}\n`;
  out += `&&&&&roboto&roboto&&&&&&&black&&black&&&roboto&black&roboto&black&&&\n`;
  out += `22049\n`;
  out += `4\n\n\n`;

  // Staffs
  for (let s = 0; s < doc.staffs.length; s++) {
    const staff = doc.staffs[s];
    out += `NEW STAFF\n`;
    out += `${staff.index}\n`;
    out += `0&0\n`; // Configuração padrão
    out += `10\n`;
    out += `7\n`;
    out += `V:100\n`;
    out += `OCTAVE:${staff.octave}\n`;
    out += `TRANSPOSE:${staff.transpose}\n`;
    out += `KEYBOARD:${staff.keyboard}\n`;
    
    if (staff.bracketTop !== undefined) out += `BRACKET_TOP:${staff.bracketTop}\n`;
    if (staff.bracketBottom !== undefined) out += `BRACKET_BOTTOM:${staff.bracketBottom}\n`;
    if (staff.visible !== undefined) out += `VISIBLE:${staff.visible}\n`;
    if (staff.lineColor !== undefined) out += `LINE_COLOR:${staff.lineColor}\n`;
    if (staff.instrument3 !== undefined) out += `INSTRUMENT3:${staff.instrument3}\n`;
    if (staff.instrument4 !== undefined) out += `INSTRUMENT4:${staff.instrument4}\n`;
    
    out += `INSTRUMENT_TEXT:\n`;
    out += `COLOR_NOTE:false\n`;

    // Eventos
    for (let i = 0; i < staff.rawEventLines.length; i++) {
      out += staff.rawEventLines[i];
      if (i < staff.rawEventLines.length - 1 || s < doc.staffs.length - 1) {
        out += "\n";
      }
    }
  }

  return out;
}
export { type MaestroAyDocument };
