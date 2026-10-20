// Repackage the upstream PNGs as an ICO without changing any pixels.
// Run from the repository root: node scripts/generate-windows-icon.mjs
import { readFile, writeFile } from 'node:fs/promises';

const directory = new URL('../src-tauri/icons/', import.meta.url);
const images = await Promise.all(['32x32.png', '128x128.png', '128x128@2x.png'].map(async (file) => {
  const data = await readFile(new URL(file, directory));
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width > 256 || height > 256) throw new Error(`ICO image too large: ${file}`);
  return { data, width, height };
}));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach(({ data, width, height }, i) => {
  const entry = 6 + i * 16;
  header[entry] = width === 256 ? 0 : width;
  header[entry + 1] = height === 256 ? 0 : height;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(data.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
await writeFile(new URL('icon.ico', directory), Buffer.concat([header, ...images.map(({ data }) => data)]));
