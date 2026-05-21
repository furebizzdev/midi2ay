import { promises as fs } from "node:fs";

export async function loadTextFileUtf8(path: string): Promise<string> {
  return fs.readFile(path, { encoding: "utf8" });
}

export async function loadBinaryFile(path: string): Promise<Uint8Array> {
  const buf = await fs.readFile(path);
  // Node Buffer is a Uint8Array, but keep an explicit conversion for typing clarity.
  return new Uint8Array(buf);
}

export async function saveTextFileUtf8(path: string, content: string): Promise<void> {
  await fs.writeFile(path, content, { encoding: "utf8" });
}
