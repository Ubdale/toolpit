'use client';

import { toWinAnsi } from './encoding';
import {
  hexToRgb,
  normalizeRotation,
  toPdfPoint,
  toPdfRect,
} from './geometry';
import { copyBytes, loadPdfLib } from './runtime';

/**
 * The model behind the PDF editor, and the pass that bakes it into a document.
 *
 * Annotations are stored in *display space* — points from the top-left of the
 * page as the reader sees it, at 100% zoom. That is the coordinate system the
 * preview works in, so a mark stays exactly where it was dropped no matter what
 * zoom the editor happens to be at or how the page is rotated in the file.
 *
 * Everything drawn here becomes ordinary page content rather than a PDF
 * annotation object. Comment annotations can be hidden, stripped, or rendered
 * differently by every viewer; flattened content looks the same everywhere and
 * survives printing — which is what someone signing a form actually needs.
 */

const LOAD_OPTIONS = { ignoreEncryption: true } as const;

export type AnnotationKind =
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'highlight'
  | 'line'
  | 'ink'
  | 'image';

type Base = {
  id: string;
  pageIndex: number;
  kind: AnnotationKind;
};

export type TextAnnotation = Base & {
  kind: 'text';
  x: number;
  y: number;
  /** Wrapping width; the box grows downwards as text is typed. */
  width: number;
  text: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  family: 'sans' | 'serif' | 'mono';
};

export type BoxAnnotation = Base & {
  kind: 'rect' | 'ellipse' | 'highlight';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  /** Fill the shape rather than outline it. Highlights are always filled. */
  filled: boolean;
  strokeWidth: number;
  opacity: number;
};

export type LineAnnotation = Base & {
  kind: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
  arrow: boolean;
};

export type InkAnnotation = Base & {
  kind: 'ink';
  /** Flat [x, y, x, y, …] in display space — a stroke drawn or signed by hand. */
  points: number[];
  color: string;
  strokeWidth: number;
};

export type ImageAnnotation = Base & {
  kind: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  bytes: Uint8Array;
  isPng: boolean;
  opacity: number;
};

export type Annotation =
  | TextAnnotation
  | BoxAnnotation
  | LineAnnotation
  | InkAnnotation
  | ImageAnnotation;

let counter = 0;
export const nextAnnotationId = () => `annotation-${(counter += 1)}`;

export const annotationTools: {
  kind: AnnotationKind;
  label: string;
  hint: string;
}[] = [
  { kind: 'text', label: 'Text', hint: 'Click where the text should start, then type.' },
  { kind: 'highlight', label: 'Highlight', hint: 'Drag across the words you want marked.' },
  { kind: 'rect', label: 'Box', hint: 'Drag a rectangle. Fill it to white out what is underneath.' },
  { kind: 'ellipse', label: 'Ellipse', hint: 'Drag to circle something on the page.' },
  { kind: 'line', label: 'Line', hint: 'Drag from one point to another. Add an arrowhead if you like.' },
  { kind: 'ink', label: 'Draw', hint: 'Draw freehand — this is the one to sign with.' },
  { kind: 'image', label: 'Image', hint: 'Place a logo, a stamp, or a photo of your signature.' },
];

/** Wrapping for the text tool, using the same metrics the PDF will be drawn with. */
export function wrapAnnotationText(
  text: string,
  measure: (value: string) => number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  // Explicit newlines are respected; each paragraph then wraps on its own.
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }

  return lines;
}

export const TEXT_LINE_RATIO = 1.25;

export type ApplyResult = {
  bytes: Uint8Array;
  /** Characters approximated to fit the standard-font encoding. */
  substitutions: number;
};

export async function applyAnnotations(
  bytes: Uint8Array,
  annotations: Annotation[],
): Promise<ApplyResult> {
  const { PDFDocument, StandardFonts, degrees, rgb } = await loadPdfLib();
  const doc = await PDFDocument.load(copyBytes(bytes), LOAD_OPTIONS);
  const pages = doc.getPages();

  // Fonts are embedded lazily: a document annotated only with boxes has no
  // reason to carry three font programs it never draws with.
  const fontCache = new Map<string, Awaited<ReturnType<typeof doc.embedFont>>>();
  const fontFor = async (annotation: TextAnnotation) => {
    const key = `${annotation.family}-${annotation.bold ? 'b' : ''}${annotation.italic ? 'i' : ''}`;
    const cached = fontCache.get(key);
    if (cached) return cached;

    const standard =
      annotation.family === 'serif'
        ? annotation.bold && annotation.italic
          ? StandardFonts.TimesRomanBoldItalic
          : annotation.bold
            ? StandardFonts.TimesRomanBold
            : annotation.italic
              ? StandardFonts.TimesRomanItalic
              : StandardFonts.TimesRoman
        : annotation.family === 'mono'
          ? annotation.bold && annotation.italic
            ? StandardFonts.CourierBoldOblique
            : annotation.bold
              ? StandardFonts.CourierBold
              : annotation.italic
                ? StandardFonts.CourierOblique
                : StandardFonts.Courier
          : annotation.bold && annotation.italic
            ? StandardFonts.HelveticaBoldOblique
            : annotation.bold
              ? StandardFonts.HelveticaBold
              : annotation.italic
                ? StandardFonts.HelveticaOblique
                : StandardFonts.Helvetica;

    const font = await doc.embedFont(standard);
    fontCache.set(key, font);
    return font;
  };

  let substitutions = 0;

  for (const annotation of annotations) {
    const page = pages[annotation.pageIndex];
    if (!page) continue;

    const { width, height } = page.getSize();
    const rotation = normalizeRotation(page.getRotation().angle);
    switch (annotation.kind) {
      case 'rect':
      case 'highlight': {
        const box = toPdfRect(
          annotation.x,
          annotation.y,
          annotation.width,
          annotation.height,
          width,
          height,
          rotation,
        );
        const [r, g, b] = hexToRgb(annotation.color);
        const filled = annotation.filled || annotation.kind === 'highlight';

        page.drawRectangle({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          ...(filled
            ? { color: rgb(r, g, b), opacity: annotation.opacity }
            : {
                borderColor: rgb(r, g, b),
                borderWidth: annotation.strokeWidth,
                borderOpacity: annotation.opacity,
              }),
        });
        break;
      }

      case 'ellipse': {
        const box = toPdfRect(
          annotation.x,
          annotation.y,
          annotation.width,
          annotation.height,
          width,
          height,
          rotation,
        );
        const [r, g, b] = hexToRgb(annotation.color);

        page.drawEllipse({
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          xScale: Math.max(1, box.width / 2),
          yScale: Math.max(1, box.height / 2),
          ...(annotation.filled
            ? { color: rgb(r, g, b), opacity: annotation.opacity }
            : {
                borderColor: rgb(r, g, b),
                borderWidth: annotation.strokeWidth,
                borderOpacity: annotation.opacity,
              }),
        });
        break;
      }

      case 'line': {
        const start = toPdfPoint(annotation.x1, annotation.y1, width, height, rotation);
        const end = toPdfPoint(annotation.x2, annotation.y2, width, height, rotation);
        const [r, g, b] = hexToRgb(annotation.color);

        page.drawLine({
          start,
          end,
          thickness: annotation.strokeWidth,
          color: rgb(r, g, b),
        });

        if (annotation.arrow) {
          // Two short strokes back from the tip, at 25 degrees either side.
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const size = Math.max(6, annotation.strokeWidth * 4);
          const spread = 0.44;

          for (const direction of [1, -1]) {
            page.drawLine({
              start: end,
              end: {
                x: end.x - size * Math.cos(angle - direction * spread),
                y: end.y - size * Math.sin(angle - direction * spread),
              },
              thickness: annotation.strokeWidth,
              color: rgb(r, g, b),
            });
          }
        }
        break;
      }

      case 'ink': {
        const [r, g, b] = hexToRgb(annotation.color);
        // Each segment is drawn separately, which keeps the stroke faithful to
        // the path without needing a content-stream path operator.
        for (let i = 0; i + 3 < annotation.points.length; i += 2) {
          const start = toPdfPoint(
            annotation.points[i]!,
            annotation.points[i + 1]!,
            width,
            height,
            rotation,
          );
          const end = toPdfPoint(
            annotation.points[i + 2]!,
            annotation.points[i + 3]!,
            width,
            height,
            rotation,
          );
          page.drawLine({
            start,
            end,
            thickness: annotation.strokeWidth,
            color: rgb(r, g, b),
            lineCap: 1,
          });
        }
        break;
      }

      case 'image': {
        const embedded = annotation.isPng
          ? await doc.embedPng(annotation.bytes)
          : await doc.embedJpg(annotation.bytes);

        // The anchor is the corner that stays put under rotation, so the image
        // is placed from the transformed rectangle rather than a raw point.
        const box = toPdfRect(
          annotation.x,
          annotation.y,
          annotation.width,
          annotation.height,
          width,
          height,
          rotation,
        );

        // drawImage rotates about its own bottom-left corner, so the anchor is
        // whichever corner of the page-space box that corner lands on.
        const anchor =
          rotation === 90
            ? { x: box.x + box.width, y: box.y }
            : rotation === 180
              ? { x: box.x + box.width, y: box.y + box.height }
              : rotation === 270
                ? { x: box.x, y: box.y + box.height }
                : { x: box.x, y: box.y };

        page.drawImage(embedded, {
          x: anchor.x,
          y: anchor.y,
          width: annotation.width,
          height: annotation.height,
          opacity: annotation.opacity,
          rotate: degrees(rotation),
        });
        break;
      }

      case 'text': {
        const font = await fontFor(annotation);
        const sanitized = toWinAnsi(annotation.text);
        substitutions += sanitized.substitutions;

        const lines = wrapAnnotationText(
          sanitized.text,
          (value) => font.widthOfTextAtSize(value, annotation.size),
          annotation.width,
        );

        const [r, g, b] = hexToRgb(annotation.color);
        const lineHeight = annotation.size * TEXT_LINE_RATIO;

        for (const [index, line] of lines.entries()) {
          if (!line) continue;
          // The stored y is the top of the first line box; the baseline sits an
          // ascender below it, and each line steps down from there.
          const baselineV = annotation.y + index * lineHeight + annotation.size * 0.8;
          const point = toPdfPoint(annotation.x, baselineV, width, height, rotation);

          page.drawText(line, {
            x: point.x,
            y: point.y,
            size: annotation.size,
            font,
            color: rgb(r, g, b),
            rotate: degrees(rotation),
          });
        }
        break;
      }
    }
  }

  return { bytes: await doc.save({ useObjectStreams: true }), substitutions };
}
