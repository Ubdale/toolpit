'use client';

import type { PDFDict } from 'pdf-lib';

import {
  serializeContentStream,
  tokenizeContentStream,
  TEXT_SHOWING,
  type Operand,
  type Operation,
} from './content-stream';
import { hexToRgb, normalizeRotation, type Rotation } from './geometry';
import { copyBytes, loadPdfJs, loadPdfLib } from './runtime';

/**
 * Editing the text that is already in a PDF.
 *
 * A PDF has no paragraphs. Text is a sequence of drawing instructions — "set
 * this font at this size, move the pen here, show these bytes" — so there is
 * nothing to re-flow and no way to make a sentence push the one after it along.
 * What there *is*, and what every practical PDF editor actually does, is this:
 * find the instruction that draws a run of text, delete it, and draw the
 * replacement at the same place in the same font, size and colour.
 *
 * That is what this does, and it is genuinely editing the original text rather
 * than hiding it under a white box — the old glyphs leave the file. The honest
 * limit is width: a longer replacement occupies more space than the run it
 * replaced, and the text beside it will not move out of the way.
 *
 * Two passes are needed because neither source has everything:
 *
 *  - the content stream (walked here) has the *instructions* — the operator to
 *    delete, the exact position, size, colour and font;
 *  - pdf.js has the *text* — decoding a subset or CID font's bytes back to
 *    characters needs its embedded ToUnicode map, which is a large amount of
 *    machinery that already exists and is already loaded.
 *
 * The two are matched on position.
 */

const LOAD_OPTIONS = { ignoreEncryption: true } as const;

export type TextRun = {
  id: string;
  pageIndex: number;
  /** Index of the drawing operation in the page's content stream. */
  operationIndex: number;
  /** The text as a reader sees it. */
  text: string;
  /** Baseline start, in display space (top-left origin, y down). */
  x: number;
  y: number;
  /** Rendered size in points, after the text and transform matrices. */
  fontSize: number;
  /** Advance width of the original run, for showing what will overflow. */
  width: number;
  color: string;
  bold: boolean;
  italic: boolean;
  family: 'sans' | 'serif' | 'mono';
  /** Clockwise rotation of the baseline, in degrees. */
  angle: number;
};

export type TextEdit = {
  runId: string;
  /** The replacement. An empty string deletes the run. */
  text: string;
  color?: string;
  fontSize?: number;
};

// ------------------------------------------------------------ matrix helpers

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function numbers(operands: Operand[], count: number): number[] {
  return operands.slice(-count).map((operand) => Number(operand.raw) || 0);
}

// ------------------------------------------------------------- font guessing

/**
 * Which standard font to redraw with, inferred from the original's BaseFont.
 *
 * The embedded font usually cannot be reused: it is typically subset to only
 * the glyphs the document already used, so a replacement containing any new
 * letter would draw blanks. Matching a standard font by name keeps the
 * replacement close without that risk.
 */
function classifyFont(baseFont: string): Pick<TextRun, 'bold' | 'italic' | 'family'> {
  const name = baseFont.toLowerCase();
  return {
    bold: /bold|black|heavy|semibold|demibold|[-,]b\b/.test(name),
    italic: /italic|oblique|[-,]i\b/.test(name),
    family: /courier|mono/.test(name) ? 'mono' : /times|serif|georgia|garamond|book/.test(name) ? 'serif' : 'sans',
  };
}

// ----------------------------------------------------------- the state walker

type GraphicsState = {
  ctm: Matrix;
  fill: string;
  fontKey: string;
  fontSize: number;
  charSpacing: number;
  wordSpacing: number;
  horizontalScale: number;
  leading: number;
  rise: number;
};

function initialState(): GraphicsState {
  return {
    ctm: IDENTITY,
    fill: '#000000',
    fontKey: '',
    fontSize: 0,
    charSpacing: 0,
    wordSpacing: 0,
    horizontalScale: 1,
    leading: 0,
    rise: 0,
  };
}

function toHex(...channels: number[]): string {
  return `#${channels
    .map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Walks a content stream tracking everything needed to place and restyle text. */
function walkTextOperations(
  operations: Operation[],
  fontNames: Map<string, string>,
): Omit<TextRun, 'id' | 'pageIndex' | 'text' | 'width'>[] {
  const runs: Omit<TextRun, 'id' | 'pageIndex' | 'text' | 'width'>[] = [];

  let state = initialState();
  const stack: GraphicsState[] = [];

  let textMatrix: Matrix = IDENTITY;
  let lineMatrix: Matrix = IDENTITY;

  for (const [index, operation] of operations.entries()) {
    const { operator, operands } = operation;

    switch (operator) {
      case 'q':
        stack.push({ ...state });
        break;
      case 'Q':
        state = stack.pop() ?? initialState();
        break;
      case 'cm': {
        const [a, b, c, d, e, f] = numbers(operands, 6);
        state.ctm = multiply([a!, b!, c!, d!, e!, f!], state.ctm);
        break;
      }

      // Fill colour, in the three device spaces plus the generic setters.
      case 'g': {
        const [grey] = numbers(operands, 1);
        state.fill = toHex(grey!, grey!, grey!);
        break;
      }
      case 'rg': {
        const [r, g, b] = numbers(operands, 3);
        state.fill = toHex(r!, g!, b!);
        break;
      }
      case 'k': {
        const [c, m, y, kk] = numbers(operands, 4);
        state.fill = toHex((1 - c!) * (1 - kk!), (1 - m!) * (1 - kk!), (1 - y!) * (1 - kk!));
        break;
      }
      case 'sc':
      case 'scn': {
        const values = operands.filter((operand) => operand.kind === 'number');
        if (values.length === 1) {
          const [grey] = numbers(values, 1);
          state.fill = toHex(grey!, grey!, grey!);
        } else if (values.length === 3) {
          const [r, g, b] = numbers(values, 3);
          state.fill = toHex(r!, g!, b!);
        } else if (values.length === 4) {
          const [c, m, y, kk] = numbers(values, 4);
          state.fill = toHex((1 - c!) * (1 - kk!), (1 - m!) * (1 - kk!), (1 - y!) * (1 - kk!));
        }
        break;
      }

      case 'BT':
        textMatrix = IDENTITY;
        lineMatrix = IDENTITY;
        break;

      case 'Tf': {
        const nameOperand = operands[operands.length - 2];
        state.fontKey = nameOperand?.raw ?? '';
        state.fontSize = numbers(operands, 1)[0] ?? 0;
        break;
      }
      case 'Tc':
        state.charSpacing = numbers(operands, 1)[0] ?? 0;
        break;
      case 'Tw':
        state.wordSpacing = numbers(operands, 1)[0] ?? 0;
        break;
      case 'Tz':
        state.horizontalScale = (numbers(operands, 1)[0] ?? 100) / 100;
        break;
      case 'TL':
        state.leading = numbers(operands, 1)[0] ?? 0;
        break;
      case 'Ts':
        state.rise = numbers(operands, 1)[0] ?? 0;
        break;

      case 'Tm': {
        const [a, b, c, d, e, f] = numbers(operands, 6);
        lineMatrix = [a!, b!, c!, d!, e!, f!];
        textMatrix = lineMatrix;
        break;
      }
      case 'Td': {
        const [tx, ty] = numbers(operands, 2);
        lineMatrix = multiply([1, 0, 0, 1, tx!, ty!], lineMatrix);
        textMatrix = lineMatrix;
        break;
      }
      case 'TD': {
        const [tx, ty] = numbers(operands, 2);
        state.leading = -ty!;
        lineMatrix = multiply([1, 0, 0, 1, tx!, ty!], lineMatrix);
        textMatrix = lineMatrix;
        break;
      }
      case 'T*':
        lineMatrix = multiply([1, 0, 0, 1, 0, -state.leading], lineMatrix);
        textMatrix = lineMatrix;
        break;

      default:
        break;
    }

    if (!TEXT_SHOWING.has(operator)) continue;

    // The quote operators move to the next line before showing anything.
    if (operator === "'" || operator === '"') {
      lineMatrix = multiply([1, 0, 0, 1, 0, -state.leading], lineMatrix);
      textMatrix = lineMatrix;
    }

    const full = multiply(textMatrix, state.ctm);
    // The rendered size is the font size scaled by the vertical component of
    // the combined matrix — a 1pt font under a 12x matrix reads as 12pt.
    const scale = Math.hypot(full[2], full[3]) || 1;
    const angle = Math.atan2(full[1], full[0]) * (180 / Math.PI);

    const baseFont = fontNames.get(state.fontKey) ?? '';

    runs.push({
      operationIndex: index,
      x: full[4],
      y: full[5],
      fontSize: state.fontSize * scale,
      color: state.fill,
      angle,
      ...classifyFont(baseFont),
    });
  }

  return runs;
}

// -------------------------------------------------------------- font lookup

/** Maps each `/F1`-style resource name on a page to its BaseFont. */
async function fontNamesFor(page: unknown): Promise<Map<string, string>> {
  const { PDFDict: PDFDictCtor, PDFName, PDFRef } = await loadPdfLib();
  const names = new Map<string, string>();

  const leaf = page as { Resources?: () => unknown; lookup?: (name: unknown) => unknown };
  const resources = (typeof leaf.Resources === 'function' ? leaf.Resources() : undefined) as
    | PDFDict
    | undefined;

  const fonts = resources?.lookup(PDFName.of('Font')) as PDFDict | undefined;
  if (!(fonts instanceof PDFDictCtor)) return names;

  for (const [key, value] of fonts.entries()) {
    const dict = (value instanceof PDFRef ? fonts.context.lookup(value) : value) as
      | PDFDict
      | undefined;
    if (!(dict instanceof PDFDictCtor)) continue;

    const baseFont = dict.lookup(PDFName.of('BaseFont')) as { asString?: () => string } | undefined;
    names.set(key.asString(), baseFont?.asString?.() ?? '');
  }

  return names;
}

// ------------------------------------------------------------------ extract

let runCounter = 0;

export type PageText = {
  runs: TextRun[];
  /** Page size as displayed, for placing the overlay. */
  width: number;
  height: number;
  rotation: Rotation;
};

/**
 * Every editable run of text on one page.
 *
 * Runs whose text pdf.js cannot decode are dropped rather than shown as
 * mojibake: offering to "edit" a string that is already wrong would replace
 * readable output with nonsense.
 */
export async function extractPageText(bytes: Uint8Array, pageIndex: number): Promise<PageText> {
  const { PDFDocument, PDFName, PDFRawStream, PDFArray, decodePDFRawStream } = await loadPdfLib();

  const doc = await PDFDocument.load(copyBytes(bytes), LOAD_OPTIONS);
  const page = doc.getPage(pageIndex);
  const { width, height } = page.getSize();
  const rotation = normalizeRotation(page.getRotation().angle);

  // --- instructions, from the content stream
  const contents = page.node.lookup(PDFName.of('Contents'));
  const parts: Uint8Array[] = [];
  const push = (value: unknown) => {
    if (value instanceof PDFRawStream) {
      try {
        parts.push(decodePDFRawStream(value).decode());
      } catch {
        // Skip a stream that will not decode rather than failing the page.
      }
    }
  };
  if (contents instanceof PDFArray) {
    for (let i = 0; i < contents.size(); i += 1) push(contents.lookup(i));
  } else {
    push(contents);
  }

  if (parts.length === 0) return { runs: [], width, height, rotation };

  const joined = joinStreams(parts);
  const operations = tokenizeContentStream(joined);
  const fontNames = await fontNamesFor(page.node);
  const placed = walkTextOperations(operations, fontNames);

  // --- readable text, from pdf.js
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: copyBytes(bytes) });
  const jsDoc = await task.promise;

  const runs: TextRun[] = [];

  try {
    const jsPage = await jsDoc.getPage(pageIndex + 1);
    const content = await jsPage.getTextContent();

    const items = content.items
      .filter((item): item is typeof item & { str: string; transform: number[]; width: number } =>
        'str' in item && typeof (item as { str?: unknown }).str === 'string',
      )
      .filter((item) => item.str.trim().length > 0);

    const used = new Set<number>();

    for (const item of items) {
      const [, , , , itemX, itemY] = item.transform;

      // Nearest unused instruction to where pdf.js says this text sits. Both
      // sources compute the same user-space point, so the match is normally
      // exact; the tolerance covers accumulated floating-point drift.
      let bestIndex = -1;
      let bestDistance = Infinity;

      for (const [index, run] of placed.entries()) {
        if (used.has(index)) continue;
        const distance = Math.hypot(run.x - (itemX ?? 0), run.y - (itemY ?? 0));
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }

      if (bestIndex === -1 || bestDistance > 1.5) continue;
      used.add(bestIndex);

      const run = placed[bestIndex]!;
      runs.push({
        ...run,
        id: `run-${(runCounter += 1)}`,
        pageIndex,
        text: item.str,
        width: item.width || 0,
        // Display space measures y downwards from the top of the page.
        y: height - run.y,
      });
    }

    jsPage.cleanup();
  } finally {
    await task.destroy();
  }

  runs.sort((a, b) => a.y - b.y || a.x - b.x);
  return { runs, width, height, rotation };
}

function joinStreams(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0]!;
  const total = parts.reduce((sum, part) => sum + part.length + 1, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
    joined[offset] = 0x0a;
    offset += 1;
  }
  return joined;
}

// -------------------------------------------------------------------- apply

export type ApplyTextResult = {
  bytes: Uint8Array;
  replaced: number;
  /** Runs whose replacement is wider than the text it replaced. */
  overflowing: string[];
};

/**
 * Removes the original drawing instructions and draws the replacements.
 *
 * Edits are grouped per page and applied in one pass over each content stream,
 * so a page with forty changes is rewritten once rather than forty times.
 */
export async function applyTextEdits(
  bytes: Uint8Array,
  runs: TextRun[],
  edits: TextEdit[],
): Promise<ApplyTextResult> {
  const { PDFDocument, PDFName, PDFRawStream, PDFArray, StandardFonts, decodePDFRawStream, degrees, rgb } =
    await loadPdfLib();
  const { toWinAnsi } = await import('./encoding');

  const doc = await PDFDocument.load(copyBytes(bytes), LOAD_OPTIONS);
  const byId = new Map(runs.map((run) => [run.id, run]));

  const perPage = new Map<number, { run: TextRun; edit: TextEdit }[]>();
  for (const edit of edits) {
    const run = byId.get(edit.runId);
    if (!run) continue;
    if (edit.text === run.text) continue;
    const list = perPage.get(run.pageIndex) ?? [];
    list.push({ run, edit });
    perPage.set(run.pageIndex, list);
  }

  const fontCache = new Map<string, Awaited<ReturnType<typeof doc.embedFont>>>();
  const fontFor = async (run: TextRun) => {
    const key = `${run.family}-${run.bold ? 'b' : ''}${run.italic ? 'i' : ''}`;
    const cached = fontCache.get(key);
    if (cached) return cached;

    const standard =
      run.family === 'serif'
        ? run.bold && run.italic
          ? StandardFonts.TimesRomanBoldItalic
          : run.bold
            ? StandardFonts.TimesRomanBold
            : run.italic
              ? StandardFonts.TimesRomanItalic
              : StandardFonts.TimesRoman
        : run.family === 'mono'
          ? run.bold && run.italic
            ? StandardFonts.CourierBoldOblique
            : run.bold
              ? StandardFonts.CourierBold
              : run.italic
                ? StandardFonts.CourierOblique
                : StandardFonts.Courier
          : run.bold && run.italic
            ? StandardFonts.HelveticaBoldOblique
            : run.bold
              ? StandardFonts.HelveticaBold
              : run.italic
                ? StandardFonts.HelveticaOblique
                : StandardFonts.Helvetica;

    const font = await doc.embedFont(standard);
    fontCache.set(key, font);
    return font;
  };

  let replaced = 0;
  const overflowing: string[] = [];

  for (const [pageIndex, list] of perPage) {
    const page = doc.getPage(pageIndex);
    const { height } = page.getSize();

    const contents = page.node.lookup(PDFName.of('Contents'));
    const parts: Uint8Array[] = [];
    const push = (value: unknown) => {
      if (value instanceof PDFRawStream) {
        try {
          parts.push(decodePDFRawStream(value).decode());
        } catch {
          // As above: an undecodable stream is skipped, not fatal.
        }
      }
    };
    if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i += 1) push(contents.lookup(i));
    } else {
      push(contents);
    }
    if (parts.length === 0) continue;

    const operations = tokenizeContentStream(joinStreams(parts));
    const doomed = new Set(list.map((entry) => entry.run.operationIndex));

    // The original glyphs are removed from the stream, not covered over.
    const kept = operations.filter((_, index) => !doomed.has(index));

    page.node.set(
      PDFName.of('Contents'),
      doc.context.register(doc.context.flateStream(serializeContentStream(kept))),
    );

    for (const { run, edit } of list) {
      replaced += 1;
      const value = edit.text;
      if (!value) continue;

      const font = await fontFor(run);
      const size = edit.fontSize ?? run.fontSize;
      const sanitized = toWinAnsi(value);
      const [r, g, b] = hexToRgb(edit.color ?? run.color);

      if (font.widthOfTextAtSize(sanitized.text, size) > run.width + 1 && run.width > 0) {
        overflowing.push(run.id);
      }

      page.drawText(sanitized.text, {
        x: run.x,
        // The run's y was flipped into display space for the UI; flip it back.
        y: height - run.y,
        size,
        font,
        color: rgb(r, g, b),
        ...(Math.abs(run.angle) > 0.01 ? { rotate: degrees(run.angle) } : {}),
      });
    }
  }

  return { bytes: await doc.save({ useObjectStreams: true }), replaced, overflowing };
}
