// Generates every icon asset: the SVG, the 512px PNG the manifest points at,
// and a favicon.ico carrying 16, 32 and 48px cuts.
//
// Rasterised here with a tiny zlib-backed encoder rather than pulled from an
// image library: it is a flat brand mark made of a rounded rectangle, a
// half-disc and two capsules, and this keeps the dependency list honest.
//
// The .ico matters more than it looks. Browsers and crawlers request
// /favicon.ico by path whether or not the page declares one, and a 404 there
// leaves some of them showing a generic page glyph - or a stale icon they
// cached earlier.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

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

/** Signed distance to a capsule: a line segment thickened by `half`. */
function capsuleDistance(x, y, ax, ay, bx, by, half) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  // Project the point onto the segment, clamped to its ends so the caps round.
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) - half;
}

/**
 * Is the point inside the pit?
 *
 * The pit is a flat-mouthed box sitting on a half-round floor - the same shape
 * the SVG draws with one path, kept in step by sharing the 32-unit grid.
 */
function insidePit(x, y, u) {
  const inBox = x >= 3.8 * u && x <= 28.2 * u && y >= 13.2 * u && y <= 19 * u;
  const inFloor = y >= 19 * u && Math.hypot(x - 16 * u, y - 19 * u) <= 12.2 * u;
  return inBox || inFloor;
}

function blend(base, layer, coverage)  {
  return base.map((channel, index) =>
    Math.round(channel * (1 - coverage) + layer[index] * coverage),
  );
}

function renderPixels(SIZE) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      let colour = EMBER;

      // Coverage is sampled rather than taken from the distance field.
      //
      // The pit is the union of a flat-mouthed box and a round floor that
      // share an edge, and along that edge both distances are zero - so an
      // analytic 0.5-minus-distance blend paints a half-covered seam straight
      // across the shape. A boolean inside-test over a 4x4 grid has no such
      // artefact, and 16 samples on 512px is imperceptible in build time.
      const u = (SIZE * 0.82) / 32;
      const originX = SIZE / 2 - 16 * u;
      // The mark spans y 5 to 31.2 on the 32-unit grid, so its optical centre
      // is 18.1 rather than 16 - centring on 16 leaves it visibly high.
      const originY = SIZE / 2 - 18.1 * u;

      let hits = 0;
      for (let sy = 0; sy < 4; sy += 1) {
        for (let sx = 0; sx < 4; sx += 1) {
          const mx = x + (sx + 0.5) / 4 - originX;
          const my = y + (sy + 0.5) / 4 - originY;
          if (
            insidePit(mx, my, u) ||
            capsuleDistance(mx, my, 10.6 * u, 6.2 * u, 21.4 * u, 6.2 * u, 1.25 * u) < 0 ||
            capsuleDistance(mx, my, 16 * u, 6.2 * u, 16 * u, 13.2 * u, 1.25 * u) < 0
          ) {
            hits += 1;
          }
        }
      }

      if (hits > 0) colour = blend(colour, CREAM, hits / 16);

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

function encodePng(pixels, SIZE) {
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
  <g transform="translate(16 16) scale(0.82) translate(-16 -18.1)">
    <path d="M3.8 13.2h24.4v5.8a12.2 12.2 0 0 1-24.4 0z" fill="#fbfaf8"/>
    <path d="M10.6 6.2h10.8M16 6.2v7" fill="none" stroke="#fbfaf8" stroke-width="2.5" stroke-linecap="round"/>
  </g>
</svg>
`;

/**
 * Packs PNGs into an .ico.
 *
 * The format predates PNG, but every browser in use has accepted PNG-compressed
 * entries for well over a decade, and they are far smaller than the BMP cuts
 * the original spec called for.
 */
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;

  entries.forEach((entry, index) => {
    const at = index * 16;
    // 256 is written as 0, which is the format's way of saying "not a byte".
    directory[at] = entry.size >= 256 ? 0 : entry.size;
    directory[at + 1] = entry.size >= 256 ? 0 : entry.size;
    directory[at + 2] = 0; // palette size
    directory[at + 3] = 0; // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(entry.data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.data.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)]);
}

await mkdir(publicDir, { recursive: true });

await writeFile(path.join(publicDir, 'icon-512.png'), encodePng(renderPixels(512), 512));
await writeFile(path.join(publicDir, 'icon-192.png'), encodePng(renderPixels(192), 192));
await writeFile(path.join(publicDir, 'icon-32.png'), encodePng(renderPixels(32), 32));
await writeFile(path.join(publicDir, 'icon.svg'), svg);

const ico = encodeIco(
  [16, 32, 48].map((size) => ({ size, data: encodePng(renderPixels(size), size) })),
);
await writeFile(path.join(publicDir, 'favicon.ico'), ico);

console.log('[toolpit] wrote favicon.ico (16/32/48), icon-32, icon-192, icon-512 and icon.svg');
