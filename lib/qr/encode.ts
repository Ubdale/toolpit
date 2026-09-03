/**
 * A QR Code encoder, written from scratch.
 *
 * Toolpit deliberately has no QR dependency. Every hosted QR service either
 * points the code at a redirect it controls — which can expire, count scans, or
 * start charging once the poster is printed — or ships a library an order of
 * magnitude larger than the algorithm itself. The spec (ISO/IEC 18004) is small
 * enough to implement directly, and doing so means the code in your hand is
 * genuinely yours: it encodes the text you typed and nothing else.
 *
 * Supports every version (1-40), all four error-correction levels, and picks
 * numeric / alphanumeric / byte mode automatically so codes stay as coarse —
 * and therefore as scannable — as the content allows.
 */

export type EccLevel = 'L' | 'M' | 'Q' | 'H';

export type QrMatrix = {
  /** Width and height in modules, including the quiet zone's exclusion. */
  size: number;
  /** `modules[y][x]` — true is a dark module. */
  modules: boolean[][];
  version: number;
  ecc: EccLevel;
};

const ECC_ORDER: EccLevel[] = ['L', 'M', 'Q', 'H'];

/** Format-info bit pattern per level — not the same order as the enum. */
const ECC_FORMAT_BITS: Record<EccLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

// Index 0 is unused so version numbers index directly.
const ECC_CODEWORDS_PER_BLOCK: Record<EccLevel, number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

const NUM_ECC_BLOCKS: Record<EccLevel, number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

const ALNUM_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

type Mode = 'numeric' | 'alphanumeric' | 'byte';

const MODE_INDICATOR: Record<Mode, number> = { numeric: 1, alphanumeric: 2, byte: 4 };

/** Character-count field width, by mode and version band. */
function charCountBits(mode: Mode, version: number): number {
  const band = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  if (mode === 'numeric') return [10, 12, 14][band]!;
  if (mode === 'alphanumeric') return [9, 11, 13][band]!;
  return [8, 16, 16][band]!;
}

// ---------------------------------------------------------------- bit buffer

class BitBuffer {
  readonly bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) this.bits.push((value >>> i) & 1);
  }

  get length(): number {
    return this.bits.length;
  }

  toBytes(): number[] {
    const bytes: number[] = new Array(Math.ceil(this.bits.length / 8)).fill(0);
    for (const [index, bit] of this.bits.entries()) {
      if (bit) bytes[index >>> 3]! |= 0x80 >>> (index & 7);
    }
    return bytes;
  }
}

// ------------------------------------------------------------ mode selection

function chooseMode(text: string, bytes: Uint8Array): Mode {
  if (/^\d*$/.test(text)) return 'numeric';
  // Alphanumeric mode only helps when every character is in its 45-symbol set,
  // which rules out lowercase — so most URLs still land in byte mode.
  if ([...text].every((char) => ALNUM_CHARSET.includes(char))) return 'alphanumeric';
  // A multi-byte character means the byte count, not the character count,
  // drives the segment length.
  void bytes;
  return 'byte';
}

function encodeSegment(mode: Mode, text: string, bytes: Uint8Array, buffer: BitBuffer): void {
  if (mode === 'numeric') {
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      buffer.push(Number(chunk), chunk.length * 3 + 1);
    }
    return;
  }

  if (mode === 'alphanumeric') {
    for (let i = 0; i < text.length; i += 2) {
      const first = ALNUM_CHARSET.indexOf(text[i]!);
      if (i + 1 < text.length) {
        buffer.push(first * 45 + ALNUM_CHARSET.indexOf(text[i + 1]!), 11);
      } else {
        buffer.push(first, 6);
      }
    }
    return;
  }

  for (const byte of bytes) buffer.push(byte, 8);
}

/** Number of characters (or bytes, in byte mode) the count field must hold. */
function segmentLength(mode: Mode, text: string, bytes: Uint8Array): number {
  return mode === 'byte' ? bytes.length : text.length;
}

function segmentBitLength(mode: Mode, text: string, bytes: Uint8Array): number {
  if (mode === 'numeric') {
    const full = Math.floor(text.length / 3);
    const rest = text.length % 3;
    return full * 10 + (rest === 0 ? 0 : rest === 1 ? 4 : 7);
  }
  if (mode === 'alphanumeric') {
    return Math.floor(text.length / 2) * 11 + (text.length % 2) * 6;
  }
  return bytes.length * 8;
}

// ------------------------------------------------------------- capacity math

/** Total data+ECC modules available in a version, before format/version info. */
function rawDataModules(version: number): number {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alignCount = Math.floor(version / 7) + 2;
    modules -= (25 * alignCount - 10) * alignCount - 55;
    if (version >= 7) modules -= 36;
  }
  return modules;
}

function dataCodewords(version: number, ecc: EccLevel): number {
  const blocks = NUM_ECC_BLOCKS[ecc][version]!;
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[ecc][version]!;
  return Math.floor(rawDataModules(version) / 8) - eccPerBlock * blocks;
}

// --------------------------------------------------------- Reed-Solomon (GF256)

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    // Multiply by 2 in GF(256) with the QR primitive polynomial 0x11d.
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255]!;
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

/**
 * The product (x - a^0)(x - a^1)...(x - a^(degree-1)), stored highest power
 * first so `poly[0]` is the leading 1 that `rsRemainder` skips over.
 */
function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (const [index, coefficient] of poly.entries()) {
      // Multiplying by x keeps a coefficient's index; multiplying by a^i
      // pushes it one power lower, which is one index later.
      next[index] = next[index]! ^ coefficient;
      next[index + 1] = next[index + 1]! ^ gfMul(coefficient, GF_EXP[i]!);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: number[], generator: number[]): number[] {
  const remainder = new Array<number>(generator.length - 1).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder.shift()!;
    remainder.push(0);
    for (const [index, coefficient] of generator.entries()) {
      if (index === 0) continue;
      remainder[index - 1] = remainder[index - 1]! ^ gfMul(coefficient, factor);
    }
  }
  return remainder;
}

/**
 * Splits the data codewords into blocks, appends each block's ECC, then
 * interleaves both — the spread that lets a scanner survive a coffee ring over
 * one corner of the code.
 */
function buildCodewords(data: number[], version: number, ecc: EccLevel): number[] {
  const blockCount = NUM_ECC_BLOCKS[ecc][version]!;
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[ecc][version]!;
  const totalCodewords = Math.floor(rawDataModules(version) / 8);
  const shortBlockLength = Math.floor(totalCodewords / blockCount) - eccPerBlock;
  const longBlockCount = totalCodewords % blockCount;

  const generator = rsGenerator(eccPerBlock);
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];

  let offset = 0;
  for (let block = 0; block < blockCount; block += 1) {
    const length = shortBlockLength + (block >= blockCount - longBlockCount ? 1 : 0);
    const chunk = data.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(chunk);
    eccBlocks.push(rsRemainder(chunk, generator));
  }

  const result: number[] = [];
  const longestData = shortBlockLength + 1;
  for (let i = 0; i < longestData; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) result.push(block[i]!);
    }
  }
  for (let i = 0; i < eccPerBlock; i += 1) {
    for (const block of eccBlocks) result.push(block[i]!);
  }
  return result;
}

// ------------------------------------------------------------ matrix drawing

type Grid = {
  size: number;
  modules: boolean[][];
  /** Function patterns and format areas that data must skip. */
  reserved: boolean[][];
};

function createGrid(version: number): Grid {
  const size = version * 4 + 17;
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function setModule(grid: Grid, x: number, y: number, dark: boolean, reserve = true): void {
  grid.modules[y]![x] = dark;
  if (reserve) grid.reserved[y]![x] = true;
}

function drawFinder(grid: Grid, centerX: number, centerY: number): void {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = centerX + dx;
      const y = centerY + dy;
      if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) continue;
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setModule(grid, x, y, distance !== 2 && distance !== 4);
    }
  }
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;

  // Always starts at 6 and ends at size - 7; the rest fill in from the far end
  // backwards, so each new position is inserted just after the leading 6 to
  // keep the list ascending.
  const positions = [6];
  for (let pos = size - 7; positions.length < count; pos -= step) positions.splice(1, 0, pos);
  return positions;
}

function drawFunctionPatterns(grid: Grid, version: number): void {
  const size = grid.size;

  // Timing patterns.
  for (let i = 0; i < size; i += 1) {
    setModule(grid, 6, i, i % 2 === 0);
    setModule(grid, i, 6, i % 2 === 0);
  }

  drawFinder(grid, 3, 3);
  drawFinder(grid, size - 4, 3);
  drawFinder(grid, 3, size - 4);

  const positions = alignmentPositions(version);
  for (const [i, centerY] of positions.entries()) {
    for (const [j, centerX] of positions.entries()) {
      // The three finder corners already own their alignment slots.
      const isFinderCorner =
        (i === 0 && j === 0) ||
        (i === 0 && j === positions.length - 1) ||
        (i === positions.length - 1 && j === 0);
      if (isFinderCorner) continue;

      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          setModule(
            grid,
            centerX + dx,
            centerY + dy,
            Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
          );
        }
      }
    }
  }

  // Reserve the format-info strips; the real bits land after masking. Index 6
  // is skipped in both strips — that module belongs to the timing pattern, and
  // the format bits step over it.
  for (let i = 0; i < 9; i += 1) {
    if (i === 6) continue;
    setModule(grid, i, 8, false);
    setModule(grid, 8, i, false);
  }
  for (let i = 0; i < 8; i += 1) {
    setModule(grid, size - 1 - i, 8, false);
    setModule(grid, 8, size - 1 - i, false);
  }
  // The always-dark module beside the bottom-left finder.
  setModule(grid, 8, size - 8, true);

  if (version >= 7) {
    let remainder = version;
    for (let i = 0; i < 12; i += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    }
    const bits = (version << 12) | remainder;
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setModule(grid, a, b, dark);
      setModule(grid, b, a, dark);
    }
  }
}

function drawFormatInfo(grid: Grid, ecc: EccLevel, mask: number): void {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const size = grid.size;

  for (let i = 0; i <= 5; i += 1) setModule(grid, 8, i, ((bits >>> i) & 1) === 1);
  setModule(grid, 8, 7, ((bits >>> 6) & 1) === 1);
  setModule(grid, 8, 8, ((bits >>> 7) & 1) === 1);
  setModule(grid, 7, 8, ((bits >>> 8) & 1) === 1);
  for (let i = 9; i < 15; i += 1) {
    setModule(grid, 14 - i, 8, ((bits >>> i) & 1) === 1);
  }

  for (let i = 0; i < 8; i += 1) {
    setModule(grid, size - 1 - i, 8, ((bits >>> i) & 1) === 1);
  }
  for (let i = 8; i < 15; i += 1) {
    setModule(grid, 8, size - 15 + i, ((bits >>> i) & 1) === 1);
  }
}

/** Walks the two-module-wide zigzag from the bottom right, skipping column 6. */
function drawCodewords(grid: Grid, codewords: number[]): void {
  const size = grid.size;
  let bitIndex = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    // The vertical timing pattern owns column 6, so the pair that would have
    // straddled it shifts left by one — and every later pair shifts with it.
    if (right === 6) right = 5;

    for (let step = 0; step < size; step += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - step : step;
        if (grid.reserved[y]![x]) continue;

        const byte = codewords[bitIndex >>> 3];
        // Versions leave a few remainder modules with no codeword; they stay light.
        const dark = byte !== undefined && ((byte >>> (7 - (bitIndex & 7))) & 1) === 1;
        grid.modules[y]![x] = dark;
        bitIndex += 1;
      }
    }
  }
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function applyMask(grid: Grid, mask: number): void {
  for (let y = 0; y < grid.size; y += 1) {
    for (let x = 0; x < grid.size; x += 1) {
      if (grid.reserved[y]![x]) continue;
      if (maskBit(mask, x, y)) grid.modules[y]![x] = !grid.modules[y]![x];
    }
  }
}

/**
 * The spec's four penalty rules. The mask with the lowest total is the one a
 * scanner will have the easiest time with — long same-colour runs and
 * finder-lookalike sequences are what confuse decoders in practice.
 */
function penalty(grid: Grid): number {
  const size = grid.size;
  const dark = grid.modules;
  let score = 0;

  const runPenalty = (run: number) => (run >= 5 ? 3 + (run - 5) : 0);

  for (let y = 0; y < size; y += 1) {
    let runColor = dark[y]![0]!;
    let run = 1;
    for (let x = 1; x < size; x += 1) {
      if (dark[y]![x] === runColor) {
        run += 1;
      } else {
        score += runPenalty(run);
        runColor = dark[y]![x]!;
        run = 1;
      }
    }
    score += runPenalty(run);
  }

  for (let x = 0; x < size; x += 1) {
    let runColor = dark[0]![x]!;
    let run = 1;
    for (let y = 1; y < size; y += 1) {
      if (dark[y]![x] === runColor) {
        run += 1;
      } else {
        score += runPenalty(run);
        runColor = dark[y]![x]!;
        run = 1;
      }
    }
    score += runPenalty(run);
  }

  // Rule 2: solid 2x2 blocks.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const value = dark[y]![x];
      if (value === dark[y]![x + 1] && value === dark[y + 1]![x] && value === dark[y + 1]![x + 1]) {
        score += 3;
      }
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns with four light modules beside them.
  const pattern = [true, false, true, true, true, false, true];
  const matchesAt = (get: (i: number) => boolean, start: number): boolean =>
    pattern.every((expected, i) => get(start + i) === expected);

  for (let i = 0; i < size; i += 1) {
    const row = (index: number) => (index >= 0 && index < size ? dark[i]![index]! : false);
    const column = (index: number) => (index >= 0 && index < size ? dark[index]![i]! : false);

    for (const get of [row, column]) {
      for (let start = 0; start <= size - 7; start += 1) {
        if (!matchesAt(get, start)) continue;
        const before = [get(start - 4), get(start - 3), get(start - 2), get(start - 1)];
        const after = [get(start + 7), get(start + 8), get(start + 9), get(start + 10)];
        if (before.every((bit) => !bit) || after.every((bit) => !bit)) score += 40;
      }
    }
  }

  // Rule 4: deviation from an even split of dark and light.
  let darkCount = 0;
  for (const row of dark) for (const module of row) if (module) darkCount += 1;
  const total = size * size;
  const deviation = Math.abs(darkCount * 20 - total * 10);
  score += Math.floor(deviation / total) * 10;

  return score;
}

// ------------------------------------------------------------------- public

export class QrTooLongError extends Error {
  readonly ecc: EccLevel;

  constructor(ecc: EccLevel) {
    super(
      'That is too much data for a QR code. Shorten the text, or drop the error correction level.',
    );
    this.name = 'QrTooLongError';
    this.ecc = ecc;
  }
}

export type EncodeOptions = {
  ecc?: EccLevel;
  /** Force a minimum version (size). Useful for keeping a set of codes uniform. */
  minVersion?: number;
};

export function encodeQr(text: string, options: EncodeOptions = {}): QrMatrix {
  const ecc = options.ecc ?? 'M';
  const minVersion = Math.min(Math.max(options.minVersion ?? 1, 1), 40);

  const bytes = new TextEncoder().encode(text);
  const mode = chooseMode(text, bytes);
  const payloadBits = segmentBitLength(mode, text, bytes);

  let version = minVersion;
  for (; version <= 40; version += 1) {
    const capacity = dataCodewords(version, ecc) * 8;
    if (4 + charCountBits(mode, version) + payloadBits <= capacity) break;
  }
  if (version > 40) throw new QrTooLongError(ecc);

  const capacityBits = dataCodewords(version, ecc) * 8;
  const buffer = new BitBuffer();
  buffer.push(MODE_INDICATOR[mode], 4);
  buffer.push(segmentLength(mode, text, bytes), charCountBits(mode, version));
  encodeSegment(mode, text, bytes, buffer);

  // Terminator, then pad to a byte boundary, then the spec's alternating filler.
  buffer.push(0, Math.min(4, capacityBits - buffer.length));
  buffer.push(0, (8 - (buffer.length % 8)) % 8);
  const data = buffer.toBytes();
  for (let pad = 0xec; data.length * 8 < capacityBits; pad ^= 0xec ^ 0x11) data.push(pad);

  const codewords = buildCodewords(data, version, ecc);

  // Draw once per mask and keep the least penalised result.
  let best: Grid | null = null;
  let bestScore = Infinity;

  for (let mask = 0; mask < 8; mask += 1) {
    const grid = createGrid(version);
    drawFunctionPatterns(grid, version);
    drawCodewords(grid, codewords);
    drawFormatInfo(grid, ecc, mask);
    applyMask(grid, mask);

    const score = penalty(grid);
    if (score < bestScore) {
      bestScore = score;
      best = grid;
    }
  }

  const grid = best!;
  return { size: grid.size, modules: grid.modules, version, ecc };
}

export const eccLevels: { value: EccLevel; label: string; description: string }[] = [
  { value: 'L', label: 'Low', description: 'Recovers ~7% — smallest code, for clean screens.' },
  { value: 'M', label: 'Medium', description: 'Recovers ~15% — the sensible default.' },
  { value: 'Q', label: 'Quartile', description: 'Recovers ~25% — good for print.' },
  { value: 'H', label: 'High', description: 'Recovers ~30% — survives a logo in the middle.' },
];

export { ECC_ORDER };
