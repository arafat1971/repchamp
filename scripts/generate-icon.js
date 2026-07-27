#!/usr/bin/env node
/**
 * Generates the app icon as a PNG, with no image-editor or binary asset in the
 * repo. Re-run after changing brand colours:
 *
 *   node scripts/generate-icon.js
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 1024;

/** Brand gradient endpoints, matching palette.green500 → palette.green700. */
const FROM = [0x22, 0xc5, 0x5e];
const TO = [0x15, 0x80, 0x3d];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/** Signed-distance helper: is (x, y) inside an axis-aligned rounded rect? */
function inRoundedRect(x, y, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(x - cx) - (halfW - r);
  const dy = Math.abs(y - cy) - (halfH - r);
  if (dx <= 0 || dy <= 0) return Math.abs(x - cx) <= halfW && Math.abs(y - cy) <= halfH;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Dumbbell mark: two end plates, two inner collars and a connecting bar,
 * all centred and scaled to the canvas.
 */
function isMark(x, y) {
  const c = SIZE / 2;
  const u = SIZE / 100; // 1 unit = 1% of the canvas

  if (inRoundedRect(x, y, c, c, 26 * u, 5 * u, 2.5 * u)) return true; // bar
  for (const sign of [-1, 1]) {
    if (inRoundedRect(x, y, c + sign * 30 * u, c, 6 * u, 20 * u, 3 * u)) return true; // plate
    if (inRoundedRect(x, y, c + sign * 20 * u, c, 4 * u, 13 * u, 2 * u)) return true; // collar
  }
  return false;
}

const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
let offset = 0;

for (let y = 0; y < SIZE; y++) {
  raw[offset++] = 0; // PNG filter type 0 (None) for this scanline
  for (let x = 0; x < SIZE; x++) {
    // Diagonal gradient, then punch the white mark over it.
    const t = (x / SIZE) * 0.5 + (y / SIZE) * 0.5;
    const mark = isMark(x, y);
    raw[offset++] = mark ? 0xff : lerp(FROM[0], TO[0], t);
    raw[offset++] = mark ? 0xff : lerp(FROM[1], TO[1], t);
    raw[offset++] = mark ? 0xff : lerp(FROM[2], TO[2], t);
  }
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: truecolour RGB
// bytes 10-12 stay 0: deflate compression, adaptive filtering, no interlace

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
for (const name of ['icon.png', 'adaptive-icon.png', 'splash-icon.png', 'favicon.png']) {
  fs.writeFileSync(path.join(outDir, name), png);
}
console.log(`✓ Wrote ${SIZE}x${SIZE} icon set (${png.length} bytes each)`);
