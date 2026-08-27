// Generates the two icon assets the manifest points at.
//
// The PNG is rasterised here with a tiny zlib-backed encoder rather than pulled
// from an image library: it is a flat brand mark made of a rounded rectangle
// and an arc, and this keeps the dependency list honest.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const SIZE = 512;
const EMBER = [209, 84, 31];
const CREAM = [251, 250, 248];

const publicDir = path.join(process.cwd(), 'public');

/** Signed distance from p to a rounded rectangle centred at (cx, cy). */
function roundedRectDistance(x, y, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(x - cx) - (halfW - radius);
  const dy = Math.abs(y - cy) - (halfH - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

/** Signed distance to the upper half of a ring — the lock's shackle. */
function shackleDistance(x, y, cx, cy, radius, thickness) {
  if (y > cy) {
    // Below the arc's centre the shackle becomes two straight legs.
    const legX = Math.abs(x - cx) - radius;
    return Math.abs(legX) - thickness / 2;
  }
  return Math.abs(Math.hypot(x - cx, y - cy) - radius) - thickness / 2;
}

function blend(base, layer, coverage) {
  return base.map((channel, index) =>
    Math.round(channel * (1 - coverage) + layer[index] * coverage),
  );
}

function renderPixels() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const cx = SIZE / 2;

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      let colour = EMBER;

      const body = roundedRectDistance(px, py, cx, SIZE * 0.63, SIZE * 0.27, SIZE * 0.19, SIZE * 0.06);
      const shackle = shackleDistance(px, py, cx, SIZE * 0.40, SIZE * 0.155, SIZE * 0.075);
      const shackleClipped = py > SIZE * 0.47 ? 1e9 : shackle;
      const mark = Math.min(body, shackleClipped);

      // 1px of analytic anti-aliasing on the mark's edge.
      const coverage = Math.min(1, Math.max(0, 0.5 - mark));
      if (coverage > 0) colour = blend(colour, CREAM, coverage);

      // The keyhole is punched back out of the body in the brand orange.
      const keyhole = roundedRectDistance(px, py, cx, SIZE * 0.63, SIZE * 0.028, SIZE * 0.075, SIZE * 0.028);
      const keyCoverage = Math.min(1, Math.max(0, 0.5 - keyhole));
      if (keyCoverage > 0) colour = blend(colour, EMBER, keyCoverage);

      const offset = (y * SIZE + x) * 4;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels) {
  const stride = SIZE * 4;
  // PNG wants a filter byte in front of every scanline; 0 = no filter.
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#d1541f"/>
  <path d="M10 14V10a6 6 0 0 1 12 0v4" fill="none" stroke="#fbfaf8" stroke-width="2.6" stroke-linecap="round"/>
  <rect x="6" y="13.5" width="20" height="12.5" rx="3.2" fill="#fbfaf8"/>
  <rect x="14.9" y="18" width="2.2" height="4.2" rx="1.1" fill="#d1541f"/>
</svg>
`;

await mkdir(publicDir, { recursive: true });
await writeFile(path.join(publicDir, 'icon-512.png'), encodePng(renderPixels()));
await writeFile(path.join(publicDir, 'icon.svg'), svg);
console.log('[toolpit] wrote public/icon-512.png and public/icon.svg');
