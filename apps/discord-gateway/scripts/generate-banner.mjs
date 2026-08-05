/**
 * Generates a simple 1200x360 PNG banner for V2 LAB without external font licenses.
 * Source script kept editable; output: apps/discord-gateway/assets/v2-lab-banner.png
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const width = 1200;
const height = 360;

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function colorAt(x, y) {
  const base = { r: 24, g: 28, b: 38 };
  const violet = { r: 124, g: 58, b: 237 };
  const cyan = { r: 34, g: 211, b: 238 };
  const grid = x % 48 < 1 || y % 48 < 1 ? 18 : 0;
  const diagonal = (x + y) % 180 < 3 ? 30 : 0;
  const mixV = Math.max(0, 1 - Math.hypot(x - 280, y - 120) / 420);
  const mixC = Math.max(0, 1 - Math.hypot(x - 980, y - 220) / 380);
  return {
    r: Math.min(255, base.r + violet.r * mixV * 0.55 + cyan.r * mixC * 0.35 + grid + diagonal),
    g: Math.min(255, base.g + violet.g * mixV * 0.35 + cyan.g * mixC * 0.45 + grid + diagonal),
    b: Math.min(255, base.b + violet.b * mixV * 0.65 + cyan.b * mixC * 0.55 + grid + diagonal),
  };
}

const raw = Buffer.alloc((width * 4 + 1) * height);
for (let y = 0; y < height; y += 1) {
  const rowStart = y * (width * 4 + 1);
  raw[rowStart] = 0;
  for (let x = 0; x < width; x += 1) {
    const { r, g, b } = colorAt(x, y);
    const offset = rowStart + 1 + x * 4;
    raw[offset] = r;
    raw[offset + 1] = g;
    raw[offset + 2] = b;
    raw[offset + 3] = 255;
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'v2-lab-banner.png');
writeFileSync(outFile, png);
console.log(`Wrote ${outFile}`);
