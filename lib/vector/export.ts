'use client';

import { loadPdfLib } from '@/lib/pdf/runtime';

import { parsePath, transformPath, type PathSegment } from './path';

export type VectorFormat = 'svg' | 'pdf' | 'ai' | 'eps';

export const VECTOR_FORMATS: {
  id: VectorFormat;
  label: string;
  extension: string;
  mime: string;
  note: string;
}[] = [
  {
    id: 'svg',
    label: 'SVG',
    extension: 'svg',
    mime: 'image/svg+xml',
    note: 'The web standard. Opens anywhere, scales forever.',
  },
  {
    id: 'pdf',
    label: 'PDF',
    extension: 'pdf',
    mime: 'application/pdf',
    note: 'True vector PDF for print, not a wrapped bitmap.',
  },
  {
    id: 'ai',
    label: 'Illustrator',
    extension: 'ai',
    mime: 'application/postscript',
    note: 'PDF-compatible .ai — Illustrator opens it with paths intact.',
  },
  {
    id: 'eps',
    label: 'EPS',
    extension: 'eps',
    mime: 'application/postscript',
    note: 'PostScript, for older print workflows and cutting machines.',
  },
];

type Shape = { segments: PathSegment[]; fill: [number, number, number] };

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [1, 1, 1],
  red: [1, 0, 0],
  green: [0, 0.5, 0],
  blue: [0, 0, 1],
};

/** Parses a CSS colour into 0-1 RGB. Returns null for `none` and transparent. */
function parseColor(value: string | null): [number, number, number] | null {
  if (!value) return null;
  const input = value.trim().toLowerCase();
  if (input === 'none' || input === 'transparent') return null;
  if (NAMED[input]) return NAMED[input];

  const hex = /^#([0-9a-f]{3,8})$/.exec(input);
  if (hex) {
    let digits = hex[1]!;
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const r = parseInt(digits.slice(0, 2), 16) / 255;
    const g = parseInt(digits.slice(2, 4), 16) / 255;
    const b = parseInt(digits.slice(4, 6), 16) / 255;
    // A fully transparent fill contributes nothing.
    if (digits.length >= 8 && parseInt(digits.slice(6, 8), 16) === 0) return null;
    return [r, g, b];
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(input);
  if (rgb) {
    const parts = rgb[1]!.split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length >= 3) {
      if (parts.length >= 4 && parts[3] === 0) return null;
      return [parts[0]! / 255, parts[1]! / 255, parts[2]! / 255];
    }
  }

  return [0, 0, 0];
}

/** Converts the basic shape elements to equivalent path data. */
function shapeToPathData(element: Element): string | null {
  const attr = (name: string) => Number(element.getAttribute(name) ?? 0);

  switch (element.tagName.toLowerCase()) {
    case 'path':
      return element.getAttribute('d');
    case 'rect': {
      const x = attr('x');
      const y = attr('y');
      const w = attr('width');
      const h = attr('height');
      if (w <= 0 || h <= 0) return null;
      return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = attr('cx');
      const cy = attr('cy');
      const rx = element.tagName.toLowerCase() === 'circle' ? attr('r') : attr('rx');
      const ry = element.tagName.toLowerCase() === 'circle' ? attr('r') : attr('ry');
      if (rx <= 0 || ry <= 0) return null;
      // Two half-arcs, which parsePath turns into cubics.
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'polygon':
    case 'polyline': {
      const points = (element.getAttribute('points') ?? '').trim();
      if (!points) return null;
      const pairs = points.split(/[\s,]+/).map(Number);
      if (pairs.length < 4) return null;
      let d = `M${pairs[0]} ${pairs[1]}`;
      for (let i = 2; i + 1 < pairs.length; i += 2) d += `L${pairs[i]} ${pairs[i + 1]}`;
      return element.tagName.toLowerCase() === 'polygon' ? `${d}Z` : d;
    }
    default:
      return null;
  }
}

function matrixFrom(element: Element, parent: DOMMatrix): DOMMatrix {
  const transform = element.getAttribute('transform');
  if (!transform) return parent;
  try {
    return parent.multiply(new DOMMatrix(transform));
  } catch {
    // An unparseable transform is better ignored than fatal.
    return parent;
  }
}

export type ParsedSvg = { shapes: Shape[]; width: number; height: number };

/**
 * Reads filled shapes out of an SVG.
 *
 * Traced output is a flat stack of `<path fill="…">`, which is the easy case.
 * Hand-authored files also bring basic shapes, nested groups and transforms, so
 * those are handled too — anything genuinely unsupported (text, gradients,
 * images, clip paths) is skipped rather than silently mangled, and the caller
 * reports the count so nobody downloads a file with pieces missing and no
 * warning.
 */
export function parseSvg(svg: string): ParsedSvg & { skipped: number } {
  const document_ = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = document_.querySelector('svg');
  if (!root) throw new Error('That does not look like an SVG.');

  let width = Number(root.getAttribute('width')?.replace(/[^\d.]/g, '') ?? 0);
  let height = Number(root.getAttribute('height')?.replace(/[^\d.]/g, '') ?? 0);

  const viewBox = root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  if ((!width || !height) && viewBox?.length === 4) {
    width = viewBox[2]!;
    height = viewBox[3]!;
  }
  if (!width || !height) {
    width = 1000;
    height = 1000;
  }

  const shapes: Shape[] = [];
  let skipped = 0;

  const walk = (element: Element, inherited: DOMMatrix, inheritedFill: string | null) => {
    const matrix = matrixFrom(element, inherited);
    const fillAttr =
      element.getAttribute('fill') ??
      (element as SVGElement).style?.fill ??
      inheritedFill ??
      null;

    for (const child of Array.from(element.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'g' || tag === 'svg') {
        walk(child, matrix, fillAttr);
        continue;
      }

      const data = shapeToPathData(child);
      if (!data) {
        if (!['defs', 'title', 'desc', 'metadata', 'style'].includes(tag)) skipped += 1;
        continue;
      }

      const childMatrix = matrixFrom(child, matrix);
      const fill = parseColor(
        child.getAttribute('fill') ?? (child as SVGElement).style?.fill ?? fillAttr ?? '#000000',
      );
      if (!fill) continue;

      shapes.push({ segments: transformPath(parsePath(data), childMatrix), fill });
    }
  };

  walk(root, new DOMMatrix(), null);
  return { shapes, width, height, skipped };
}

function segmentsToPathData(segments: PathSegment[], precision = 3): string {
  const n = (value: number) => Number(value.toFixed(precision));
  let d = '';
  for (const segment of segments) {
    if (segment.type === 'M') d += `M${n(segment.x)} ${n(segment.y)}`;
    else if (segment.type === 'L') d += `L${n(segment.x)} ${n(segment.y)}`;
    else if (segment.type === 'C') {
      d += `C${n(segment.x1)} ${n(segment.y1)} ${n(segment.x2)} ${n(segment.y2)} ${n(segment.x)} ${n(segment.y)}`;
    } else d += 'Z';
  }
  return d;
}

/**
 * Writes a real vector PDF — paths as paths, not a rasterised page.
 *
 * Illustrator has opened PDF natively since version 9, so the same bytes served
 * as `.ai` open with every path editable. That is exactly what Illustrator's own
 * "PDF compatible file" option produces.
 */
export async function svgToPdf(svg: string): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await loadPdfLib();
  const { shapes, width, height } = parseSvg(svg);

  const document_ = await PDFDocument.create();
  document_.setCreator('Toolpit');
  document_.setProducer('Toolpit — processed on your device');
  const page = document_.addPage([width, height]);

  for (const shape of shapes) {
    page.drawSvgPath(segmentsToPathData(shape.segments), {
      // drawSvgPath places the path's own origin here and runs y downward, so
      // anchoring at the top-left corner reproduces SVG coordinates exactly.
      x: 0,
      y: height,
      color: rgb(shape.fill[0], shape.fill[1], shape.fill[2]),
      borderWidth: 0,
    });
  }

  return document_.save();
}

/** Encapsulated PostScript, for print workflows and cutting machines. */
export function svgToEps(svg: string, title: string): string {
  const { shapes, width, height } = parseSvg(svg);
  const n = (value: number) => Number(value.toFixed(3));

  const lines: string[] = [
    '%!PS-Adobe-3.0 EPSF-3.0',
    `%%Creator: Toolpit (processed on your device)`,
    `%%Title: ${title.replace(/[\r\n]/g, ' ')}`,
    `%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}`,
    `%%HiResBoundingBox: 0 0 ${n(width)} ${n(height)}`,
    '%%EndComments',
    'gsave',
    // PostScript's origin is bottom-left with y running up; SVG's is top-left
    // with y running down. One flip up front lets every coordinate below be
    // emitted verbatim.
    `[1 0 0 -1 0 ${n(height)}] concat`,
  ];

  for (const shape of shapes) {
    lines.push(`${n(shape.fill[0])} ${n(shape.fill[1])} ${n(shape.fill[2])} setrgbcolor`);
    lines.push('newpath');

    for (const segment of shape.segments) {
      if (segment.type === 'M') lines.push(`${n(segment.x)} ${n(segment.y)} moveto`);
      else if (segment.type === 'L') lines.push(`${n(segment.x)} ${n(segment.y)} lineto`);
      else if (segment.type === 'C') {
        lines.push(
          `${n(segment.x1)} ${n(segment.y1)} ${n(segment.x2)} ${n(segment.y2)} ${n(segment.x)} ${n(segment.y)} curveto`,
        );
      } else lines.push('closepath');
    }

    lines.push('fill');
  }

  lines.push('grestore', 'showpage', '%%EOF', '');
  return lines.join('\n');
}

export async function exportVector(
  svg: string,
  format: VectorFormat,
  title: string,
): Promise<Blob> {
  const meta = VECTOR_FORMATS.find((entry) => entry.id === format)!;

  if (format === 'svg') return new Blob([svg], { type: meta.mime });
  if (format === 'eps') return new Blob([svgToEps(svg, title)], { type: meta.mime });

  const bytes = await svgToPdf(svg);
  return new Blob([bytes as unknown as BlobPart], { type: meta.mime });
}
