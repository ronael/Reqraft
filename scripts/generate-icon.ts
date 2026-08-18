/**
 * Generates the app icon (build/icon.png, 1024×1024) for electron-builder.
 *
 * Same throwaway PNG encoder as the tray icons (WORKLOG lot 4), kept this
 * time: the icon must be regenerable. Rounded violet square with the brand
 * dot, aligned on `src/ui/theme/palette-values.ts` (single source).
 *
 * Usage: pnpm tsx scripts/generate-icon.ts
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { PALETTE_VALUES } from "@/shared/palette-values.js";

const SIZE = 1024;
const CORNER_RADIUS = 220;
const DOT_RADIUS = 250;

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

const BACKGROUND = hexToRgb(PALETTE_VALUES.accentStrong);
const DOT: [number, number, number] = [255, 255, 255];

function crc32(buffer: Buffer): number {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function roundedSquareCoverage(x: number, y: number): number {
  // 1 inside the rounded square, 0 outside, smooth edge over ~2 px.
  const dx = Math.max(CORNER_RADIUS - x, 0, x - (SIZE - 1 - CORNER_RADIUS));
  const dy = Math.max(CORNER_RADIUS - y, 0, y - (SIZE - 1 - CORNER_RADIUS));
  const distance = Math.hypot(dx, dy);
  return Math.min(1, Math.max(0, CORNER_RADIUS + 1 - distance));
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
const center = (SIZE - 1) / 2;
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  for (let x = 0; x < SIZE; x++) {
    const offset = y * (SIZE * 4 + 1) + 1 + x * 4;
    const coverage = roundedSquareCoverage(x, y);
    const dotCoverage = Math.min(
      1,
      Math.max(0, DOT_RADIUS + 1 - Math.hypot(x - center, y - center)),
    );
    const red = BACKGROUND[0] * (1 - dotCoverage) + DOT[0] * dotCoverage;
    const green = BACKGROUND[1] * (1 - dotCoverage) + DOT[1] * dotCoverage;
    const blue = BACKGROUND[2] * (1 - dotCoverage) + DOT[2] * dotCoverage;
    raw[offset] = Math.round(red);
    raw[offset + 1] = Math.round(green);
    raw[offset + 2] = Math.round(blue);
    raw[offset + 3] = Math.round(255 * coverage);
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync("build", { recursive: true });
writeFileSync("build/icon.png", png);
console.log(`build/icon.png généré (${String(SIZE)}×${String(SIZE)}).`);
