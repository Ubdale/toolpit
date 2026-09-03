'use client';

import { toWinAnsi } from './encoding';
import { displaySize, hexToRgb, normalizeRotation, toPdfPoint } from './geometry';
import { copyBytes, loadPdfLib } from './runtime';

/**
 * Watermarks and page numbers — two stamps that share one problem: they have to
 * land in the same visual place on every page of a document whose pages may be
 * different sizes and rotations. Everything here is positioned in display space
 * and transformed per page, rather than assuming page one's geometry holds.
 */

const LOAD_OPTIONS = { ignoreEncryption: true } as const;

export type Corner =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const corners: { value: Corner; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top centre' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom centre' },
  { value: 'bottom-right', label: 'Bottom right' },
];

// ------------------------------------------------------------------ watermark

export type WatermarkPlacement = 'diagonal' | 'center' | 'tile';

export type WatermarkOptions = {
  text: string;
  /** PNG or JPEG bytes for a logo watermark; text is ignored when set. */
  image: { bytes: Uint8Array; isPng: boolean } | null;
  placement: WatermarkPlacement;
  fontSize: number;
  color: string;
  opacity: number;
  rotation: number;
  /** Fraction of the page width a logo should span, 0-1. */
  imageScale: number;
  /** Zero-based pages to stamp; empty means every page. */
  pageIndices: number[];
};

export const defaultWatermarkOptions: WatermarkOptions = {
  text: 'CONFIDENTIAL',
  image: null,
  placement: 'diagonal',
  fontSize: 60,
  color: '#d1541f',
  opacity: 0.18,
  rotation: 45,
  imageScale: 0.4,
  pageIndices: [],
};

export async function addWatermark(
  bytes: Uint8Array,
  options: WatermarkOptions,
): Promise<{ bytes: Uint8Array; substitutions: number }> {
  const { PDFDocument, StandardFonts, degrees, rgb } = await loadPdfLib();
  const doc = await PDFDocument.load(copyBytes(bytes), LOAD_OPTIONS);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  const sanitized = toWinAnsi(options.text);
  const embedded = options.image
    ? options.image.isPng
      ? await doc.embedPng(options.image.bytes)
      : await doc.embedJpg(options.image.bytes)
    : null;

  if (!embedded && !sanitized.text.trim()) {
    throw new Error('Enter watermark text, or choose an image to stamp.');
  }

  const [r, g, b] = hexToRgb(options.color);
  const pages = doc.getPages();
  const targets = options.pageIndices.length > 0 ? new Set(options.pageIndices) : null;

  for (const [index, page] of pages.entries()) {
    if (targets && !targets.has(index)) continue;

    const { width, height } = page.getSize();
    const rotation = normalizeRotation(page.getRotation().angle);
    const view = displaySize(width, height, rotation);

    // Positions are chosen in display space, then transformed once per page.
    const spots: { u: number; v: number }[] = [];
    if (options.placement === 'tile') {
      const stepX = view.width / 3;
      const stepY = view.height / 4;
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < 3; column += 1) {
          spots.push({ u: (column + 0.5) * stepX, v: (row + 0.5) * stepY });
        }
      }
    } else {
      spots.push({ u: view.width / 2, v: view.height / 2 });
    }

    const angle =
      options.placement === 'diagonal' ? options.rotation : options.placement === 'tile' ? 30 : 0;

    for (const spot of spots) {
      const point = toPdfPoint(spot.u, spot.v, width, height, rotation);

      if (embedded) {
        const drawWidth = view.width * options.imageScale * (options.placement === 'tile' ? 0.5 : 1);
        const drawHeight = (embedded.height / embedded.width) * drawWidth;
        page.drawImage(embedded, {
          // drawImage anchors bottom-left, so back off by half to centre it.
          x: point.x - drawWidth / 2,
          y: point.y - drawHeight / 2,
          width: drawWidth,
          height: drawHeight,
          opacity: options.opacity,
          rotate: degrees(rotation + angle),
        });
        continue;
      }

      const size = options.placement === 'tile' ? options.fontSize * 0.55 : options.fontSize;
      const textWidth = font.widthOfTextAtSize(sanitized.text, size);
      const radians = ((rotation + angle) * Math.PI) / 180;

      // drawText rotates about its own origin, so the centring offset has to be
      // rotated with it or the text drifts off-centre as the angle grows.
      const offsetX = (-textWidth / 2) * Math.cos(radians) - (-size * 0.35) * Math.sin(radians);
      const offsetY = (-textWidth / 2) * Math.sin(radians) + (-size * 0.35) * Math.cos(radians);

      page.drawText(sanitized.text, {
        x: point.x + offsetX,
        y: point.y + offsetY,
        size,
        font,
        color: rgb(r, g, b),
        opacity: options.opacity,
        rotate: degrees(rotation + angle),
      });
    }
  }

  return { bytes: await doc.save({ useObjectStreams: true }), substitutions: sanitized.substitutions };
}

// --------------------------------------------------------------- page numbers

export type NumberFormat = 'plain' | 'of-total' | 'page-n' | 'page-n-of-total' | 'dashes';

export const numberFormats: { value: NumberFormat; label: string; example: string }[] = [
  { value: 'plain', label: 'Number only', example: '7' },
  { value: 'of-total', label: 'Number of total', example: '7 / 24' },
  { value: 'page-n', label: 'Page N', example: 'Page 7' },
  { value: 'page-n-of-total', label: 'Page N of total', example: 'Page 7 of 24' },
  { value: 'dashes', label: 'Dashed', example: '— 7 —' },
];

export type PageNumberOptions = {
  format: NumberFormat;
  position: Corner;
  fontSize: number;
  color: string;
  margin: number;
  /** The number printed on the first numbered page. */
  startAt: number;
  /** Zero-based pages that get a number; empty means every page. */
  pageIndices: number[];
  /** Text placed before the number, e.g. a document reference. */
  prefix: string;
};

export const defaultPageNumberOptions: PageNumberOptions = {
  format: 'plain',
  position: 'bottom-center',
  fontSize: 10,
  color: '#4a453c',
  margin: 32,
  startAt: 1,
  pageIndices: [],
  prefix: '',
};

function formatNumber(format: NumberFormat, current: number, total: number): string {
  switch (format) {
    case 'of-total':
      return `${current} / ${total}`;
    case 'page-n':
      return `Page ${current}`;
    case 'page-n-of-total':
      return `Page ${current} of ${total}`;
    case 'dashes':
      return `- ${current} -`;
    default:
      return String(current);
  }
}

export async function addPageNumbers(
  bytes: Uint8Array,
  options: PageNumberOptions,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, degrees, rgb } = await loadPdfLib();
  const doc = await PDFDocument.load(copyBytes(bytes), LOAD_OPTIONS);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const [r, g, b] = hexToRgb(options.color);
  const pages = doc.getPages();
  const targets = options.pageIndices.length > 0 ? new Set(options.pageIndices) : null;

  const numbered = pages.filter((_, index) => !targets || targets.has(index));
  const total = numbered.length + options.startAt - 1;

  let counter = options.startAt;

  for (const [index, page] of pages.entries()) {
    if (targets && !targets.has(index)) continue;

    const { width, height } = page.getSize();
    const rotation = normalizeRotation(page.getRotation().angle);
    const view = displaySize(width, height, rotation);

    const label = toWinAnsi(
      `${options.prefix ? `${options.prefix} ` : ''}${formatNumber(options.format, counter, total)}`,
    ).text;
    const textWidth = font.widthOfTextAtSize(label, options.fontSize);

    const [vertical, horizontal] = options.position.split('-') as [
      'top' | 'bottom',
      'left' | 'center' | 'right',
    ];

    const u =
      horizontal === 'left'
        ? options.margin
        : horizontal === 'right'
          ? view.width - options.margin - textWidth
          : (view.width - textWidth) / 2;

    // The anchor is the text's baseline-left corner in display space.
    const v =
      vertical === 'top'
        ? options.margin + options.fontSize
        : view.height - options.margin;

    const point = toPdfPoint(u, v, width, height, rotation);

    page.drawText(label, {
      // The transform gives the anchor; nothing else needs offsetting because
      // the text grows to the right of it in its own rotated frame.
      x: point.x,
      y: point.y,
      size: options.fontSize,
      font,
      color: rgb(r, g, b),
      rotate: degrees(rotation),
    });

    counter += 1;
  }

  return doc.save({ useObjectStreams: true });
}
