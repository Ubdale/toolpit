'use client';

/**
 * Mapping between what a reader sees and what the file stores.
 *
 * A PDF page carries a /Rotate entry, and viewers honour it — so a page whose
 * MediaBox is 595x842 can be displayed 842x595, with the origin somewhere other
 * than where the file puts it. Anything drawn from a click on a preview has to
 * be transformed back, or the stamp lands rotated ninety degrees off the corner
 * the person actually pointed at. This is the one place that transform lives.
 *
 * Display space: origin at the top-left of the page *as displayed*, x right,
 * y down. PDF user space: origin bottom-left, y up, unrotated.
 */

export type Rotation = 0 | 90 | 180 | 270;

export function normalizeRotation(angle: number): Rotation {
  const value = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return value as Rotation;
}

/** Page size as the reader sees it, with the axes swapped on a quarter turn. */
export function displaySize(
  width: number,
  height: number,
  rotation: Rotation,
): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };
}

export function toPdfPoint(
  u: number,
  v: number,
  width: number,
  height: number,
  rotation: Rotation,
): { x: number; y: number } {
  switch (rotation) {
    case 90:
      return { x: v, y: u };
    case 180:
      return { x: width - u, y: v };
    case 270:
      return { x: width - v, y: height - u };
    default:
      return { x: u, y: height - v };
  }
}

/**
 * A display-space rectangle as a PDF-space rectangle. Because rotations are
 * always quarter turns, an axis-aligned box stays axis-aligned — only its
 * corners and its width/height trade places.
 */
export function toPdfRect(
  u: number,
  v: number,
  boxWidth: number,
  boxHeight: number,
  pageWidth: number,
  pageHeight: number,
  rotation: Rotation,
): { x: number; y: number; width: number; height: number } {
  const a = toPdfPoint(u, v, pageWidth, pageHeight, rotation);
  const b = toPdfPoint(u + boxWidth, v + boxHeight, pageWidth, pageHeight, rotation);

  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/**
 * How far to rotate drawn content so it reads upright.
 *
 * The viewer turns the page `rotation` degrees clockwise, so content has to be
 * pre-turned the same amount counter-clockwise to come out level.
 */
export function uprightRotation(rotation: Rotation): number {
  return rotation;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '').trim();
  const full =
    value.length === 3
      ? value
          .split('')
          .map((character) => character + character)
          .join('')
      : value.padEnd(6, '0').slice(0, 6);

  const parse = (start: number) => {
    const parsed = parseInt(full.slice(start, start + 2), 16);
    return Number.isNaN(parsed) ? 0 : parsed / 255;
  };

  return [parse(0), parse(2), parse(4)];
}
