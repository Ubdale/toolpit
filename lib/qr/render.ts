import type { QrMatrix } from './encode';

export type QrStyle = {
  /** Module size in px (PNG) or user units (SVG). */
  scale: number;
  /** Quiet zone in modules. The spec asks for 4; below that, scanners struggle. */
  margin: number;
  dark: string;
  light: string;
  /** Rounds each module's corners, 0-0.5 of a module. Purely cosmetic. */
  radius: number;
  /** Draw the light modules, or leave them transparent. */
  transparent: boolean;
};

export const defaultStyle: QrStyle = {
  scale: 8,
  margin: 4,
  dark: '#000000',
  light: '#ffffff',
  radius: 0,
  transparent: false,
};

/**
 * One SVG path for every dark module.
 *
 * Square modules are merged into horizontal runs first, which typically cuts
 * the path data by more than half — the difference between an SVG a designer
 * can drop into Illustrator and one that chokes it.
 */
function darkPath(matrix: QrMatrix, style: QrStyle): string {
  const { scale, margin, radius } = style;
  const offset = margin * scale;
  const parts: string[] = [];

  if (radius <= 0) {
    for (let y = 0; y < matrix.size; y += 1) {
      let runStart = -1;
      for (let x = 0; x <= matrix.size; x += 1) {
        const dark = x < matrix.size && matrix.modules[y]![x];
        if (dark && runStart === -1) runStart = x;
        if (!dark && runStart !== -1) {
          const px = offset + runStart * scale;
          const py = offset + y * scale;
          parts.push(`M${px} ${py}h${(x - runStart) * scale}v${scale}h-${(x - runStart) * scale}z`);
          runStart = -1;
        }
      }
    }
    return parts.join('');
  }

  const r = Math.min(radius, 0.5) * scale;
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (!matrix.modules[y]![x]) continue;
      const px = offset + x * scale;
      const py = offset + y * scale;
      parts.push(
        `M${px + r} ${py}h${scale - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}` +
          `v${scale - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}` +
          `h-${scale - 2 * r}a${r} ${r} 0 0 1 -${r} -${r}` +
          `v-${scale - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}z`,
      );
    }
  }
  return parts.join('');
}

export function qrToSvg(matrix: QrMatrix, style: QrStyle = defaultStyle): string {
  const dimension = (matrix.size + style.margin * 2) * style.scale;
  const background = style.transparent
    ? ''
    : `<rect width="${dimension}" height="${dimension}" fill="${style.light}"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dimension}" height="${dimension}" ` +
    `viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges">` +
    background +
    `<path fill="${style.dark}" d="${darkPath(matrix, style)}"/>` +
    `</svg>`
  );
}

export function qrToSvgBlob(matrix: QrMatrix, style: QrStyle): Blob {
  return new Blob([qrToSvg(matrix, style)], { type: 'image/svg+xml' });
}

/**
 * Draws the code straight onto a canvas rather than rasterising the SVG, so the
 * module grid lands on exact pixel boundaries and the result stays crisp at
 * any size.
 */
export function qrToCanvas(matrix: QrMatrix, style: QrStyle): HTMLCanvasElement {
  const dimension = (matrix.size + style.margin * 2) * style.scale;
  const canvas = document.createElement('canvas');
  canvas.width = dimension;
  canvas.height = dimension;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not open a 2D canvas.');

  if (!style.transparent) {
    context.fillStyle = style.light;
    context.fillRect(0, 0, dimension, dimension);
  }

  context.fillStyle = style.dark;
  const offset = style.margin * style.scale;
  const radius = Math.min(style.radius, 0.5) * style.scale;

  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (!matrix.modules[y]![x]) continue;
      const px = offset + x * style.scale;
      const py = offset + y * style.scale;
      if (radius > 0) {
        context.beginPath();
        context.roundRect(px, py, style.scale, style.scale, radius);
        context.fill();
      } else {
        context.fillRect(px, py, style.scale, style.scale);
      }
    }
  }

  return canvas;
}
