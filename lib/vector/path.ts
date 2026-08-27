'use client';

/**
 * SVG path parsing, normalised to absolute move/line/cubic/close.
 *
 * Both the PDF and EPS writers need real geometry rather than a `d` string, and
 * both speak only lines and cubic Béziers. Everything else — relative commands,
 * shorthand curves, quadratics, elliptical arcs — is converted here once, so
 * neither writer has to know the difference.
 */

export type PathSegment =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Z' };

const NUMBER = /-?\d*\.?\d+(?:[eE][-+]?\d+)?/g;

function numbers(input: string): number[] {
  return (input.match(NUMBER) ?? []).map(Number);
}

/**
 * Converts an elliptical arc to up to four cubic Béziers.
 *
 * Implements the endpoint-to-centre conversion from the SVG spec's
 * implementation notes. Traced output never contains arcs, but hand-authored
 * and editor-exported SVGs do, and silently dropping them would quietly corrupt
 * someone's artwork.
 */
function arcToCubics(
  x0: number,
  y0: number,
  rx: number,
  ry: number,
  angleDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x: number,
  y: number,
): PathSegment[] {
  if (rx === 0 || ry === 0) return [{ type: 'L', x, y }];

  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const dx2 = (x0 - x) / 2;
  const dy2 = (y0 - y) / 2;
  const x1 = cos * dx2 + sin * dy2;
  const y1 = -sin * dx2 + cos * dy2;

  let radiusX = Math.abs(rx);
  let radiusY = Math.abs(ry);

  // Scale the radii up if they are too small to span the endpoints.
  const check = (x1 * x1) / (radiusX * radiusX) + (y1 * y1) / (radiusY * radiusY);
  if (check > 1) {
    const scale = Math.sqrt(check);
    radiusX *= scale;
    radiusY *= scale;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator =
    radiusX * radiusX * radiusY * radiusY -
    radiusX * radiusX * y1 * y1 -
    radiusY * radiusY * x1 * x1;
  const denominator = radiusX * radiusX * y1 * y1 + radiusY * radiusY * x1 * x1;
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator));

  const cx1 = (coefficient * radiusX * y1) / radiusY;
  const cy1 = (-coefficient * radiusY * x1) / radiusX;
  const cx = cos * cx1 - sin * cy1 + (x0 + x) / 2;
  const cy = sin * cx1 + cos * cy1 + (y0 + y) / 2;

  const theta = Math.atan2((y1 - cy1) / radiusY, (x1 - cx1) / radiusX);
  let delta =
    Math.atan2((-y1 - cy1) / radiusY, (-x1 - cx1) / radiusX) - theta;
  if (!sweep && delta > 0) delta -= Math.PI * 2;
  if (sweep && delta < 0) delta += Math.PI * 2;

  const steps = Math.max(1, Math.ceil(Math.abs(delta / (Math.PI / 2))));
  const step = delta / steps;
  // Magic constant for approximating a circular arc segment with a cubic.
  const handle = (4 / 3) * Math.tan(step / 4);

  const out: PathSegment[] = [];
  let start = theta;
  let fromX = x0;
  let fromY = y0;

  for (let i = 0; i < steps; i += 1) {
    const end = start + step;

    const cosStart = Math.cos(start);
    const sinStart = Math.sin(start);
    const cosEnd = Math.cos(end);
    const sinEnd = Math.sin(end);

    const endX = cos * radiusX * cosEnd - sin * radiusY * sinEnd + cx;
    const endY = sin * radiusX * cosEnd + cos * radiusY * sinEnd + cy;

    const dxStart = -radiusX * sinStart;
    const dyStart = radiusY * cosStart;
    const dxEnd = -radiusX * sinEnd;
    const dyEnd = radiusY * cosEnd;

    out.push({
      type: 'C',
      x1: fromX + handle * (cos * dxStart - sin * dyStart),
      y1: fromY + handle * (sin * dxStart + cos * dyStart),
      x2: endX - handle * (cos * dxEnd - sin * dyEnd),
      y2: endY - handle * (sin * dxEnd + cos * dyEnd),
      x: endX,
      y: endY,
    });

    start = end;
    fromX = endX;
    fromY = endY;
  }

  return out;
}

/** Parses a `d` attribute into absolute move/line/cubic/close segments. */
export function parsePath(d: string): PathSegment[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) ?? [];
  const out: PathSegment[] = [];

  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // Reflection points for the shorthand S and T commands.
  let lastControlX = 0;
  let lastControlY = 0;
  let lastType = '';

  for (const token of tokens) {
    const command = token[0]!;
    const relative = command === command.toLowerCase();
    const args = numbers(token.slice(1));
    const upper = command.toUpperCase();

    const consume = (count: number) => {
      const chunks: number[][] = [];
      for (let i = 0; i + count <= args.length; i += count) {
        chunks.push(args.slice(i, i + count));
      }
      return chunks;
    };

    if (upper === 'Z') {
      out.push({ type: 'Z' });
      x = startX;
      y = startY;
      lastType = 'Z';
      continue;
    }

    if (upper === 'M') {
      for (const [index, [ax, ay]] of consume(2).entries()) {
        x = relative ? x + ax! : ax!;
        y = relative ? y + ay! : ay!;
        // Extra coordinate pairs after a moveto are implicit linetos.
        if (index === 0) {
          out.push({ type: 'M', x, y });
          startX = x;
          startY = y;
        } else {
          out.push({ type: 'L', x, y });
        }
      }
    } else if (upper === 'L') {
      for (const [ax, ay] of consume(2)) {
        x = relative ? x + ax! : ax!;
        y = relative ? y + ay! : ay!;
        out.push({ type: 'L', x, y });
      }
    } else if (upper === 'H') {
      for (const [ax] of consume(1)) {
        x = relative ? x + ax! : ax!;
        out.push({ type: 'L', x, y });
      }
    } else if (upper === 'V') {
      for (const [ay] of consume(1)) {
        y = relative ? y + ay! : ay!;
        out.push({ type: 'L', x, y });
      }
    } else if (upper === 'C') {
      for (const [c1x, c1y, c2x, c2y, ax, ay] of consume(6)) {
        const x1 = relative ? x + c1x! : c1x!;
        const y1 = relative ? y + c1y! : c1y!;
        const x2 = relative ? x + c2x! : c2x!;
        const y2 = relative ? y + c2y! : c2y!;
        x = relative ? x + ax! : ax!;
        y = relative ? y + ay! : ay!;
        out.push({ type: 'C', x1, y1, x2, y2, x, y });
        lastControlX = x2;
        lastControlY = y2;
      }
    } else if (upper === 'S') {
      for (const [c2x, c2y, ax, ay] of consume(4)) {
        const reflect = lastType === 'C' || lastType === 'S';
        const x1 = reflect ? 2 * x - lastControlX : x;
        const y1 = reflect ? 2 * y - lastControlY : y;
        const x2 = relative ? x + c2x! : c2x!;
        const y2 = relative ? y + c2y! : c2y!;
        x = relative ? x + ax! : ax!;
        y = relative ? y + ay! : ay!;
        out.push({ type: 'C', x1, y1, x2, y2, x, y });
        lastControlX = x2;
        lastControlY = y2;
      }
    } else if (upper === 'Q' || upper === 'T') {
      const chunks = upper === 'Q' ? consume(4) : consume(2);
      for (const chunk of chunks) {
        let qx: number;
        let qy: number;
        let ax: number;
        let ay: number;

        if (upper === 'Q') {
          qx = relative ? x + chunk[0]! : chunk[0]!;
          qy = relative ? y + chunk[1]! : chunk[1]!;
          ax = relative ? x + chunk[2]! : chunk[2]!;
          ay = relative ? y + chunk[3]! : chunk[3]!;
        } else {
          const reflect = lastType === 'Q' || lastType === 'T';
          qx = reflect ? 2 * x - lastControlX : x;
          qy = reflect ? 2 * y - lastControlY : y;
          ax = relative ? x + chunk[0]! : chunk[0]!;
          ay = relative ? y + chunk[1]! : chunk[1]!;
        }

        // Exact quadratic-to-cubic elevation.
        out.push({
          type: 'C',
          x1: x + (2 / 3) * (qx - x),
          y1: y + (2 / 3) * (qy - y),
          x2: ax + (2 / 3) * (qx - ax),
          y2: ay + (2 / 3) * (qy - ay),
          x: ax,
          y: ay,
        });

        lastControlX = qx;
        lastControlY = qy;
        x = ax;
        y = ay;
      }
    } else if (upper === 'A') {
      for (const [rx, ry, rot, large, sweep, ax, ay] of consume(7)) {
        const endX = relative ? x + ax! : ax!;
        const endY = relative ? y + ay! : ay!;
        out.push(
          ...arcToCubics(x, y, rx!, ry!, rot!, large !== 0, sweep !== 0, endX, endY),
        );
        x = endX;
        y = endY;
      }
    }

    lastType = upper;
  }

  return out;
}

/** Applies a 2D affine matrix to every coordinate in a path. */
export function transformPath(segments: PathSegment[], m: DOMMatrix): PathSegment[] {
  const point = (px: number, py: number) => ({
    x: m.a * px + m.c * py + m.e,
    y: m.b * px + m.d * py + m.f,
  });

  return segments.map((segment) => {
    if (segment.type === 'Z') return segment;
    if (segment.type === 'C') {
      const c1 = point(segment.x1, segment.y1);
      const c2 = point(segment.x2, segment.y2);
      const end = point(segment.x, segment.y);
      return { type: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: end.x, y: end.y };
    }
    const end = point(segment.x, segment.y);
    return { type: segment.type, x: end.x, y: end.y };
  });
}
