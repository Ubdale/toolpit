'use client';

import { TEXT_LINE_RATIO, type Annotation } from './annotate';

/**
 * Hit-testing and dragging for the editor's select tool.
 *
 * These live outside the component because they are pure geometry over the
 * annotation model — the same model the exporter draws from — and because
 * "which mark did I just click" is the kind of thing worth being able to reason
 * about without a React tree in the way.
 */

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);

  // Project the point onto the segment, clamped to its ends.
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Rough height of a text block, from its wrap width and how much text there is. */
export function textHeight(annotation: Extract<Annotation, { kind: 'text' }>): number {
  const lineHeight = annotation.size * TEXT_LINE_RATIO;
  if (!annotation.text) return lineHeight;

  const perLine = Math.max(1, Math.floor(annotation.width / (annotation.size * 0.5)));
  const lines = annotation.text
    .split('\n')
    .reduce((total, paragraph) => total + Math.max(1, Math.ceil(paragraph.length / perLine)), 0);

  return lines * lineHeight;
}

export function hitTest(annotation: Annotation, x: number, y: number): boolean {
  // A generous margin, because a 1pt line is almost impossible to click exactly.
  const margin = 4;

  switch (annotation.kind) {
    case 'rect':
    case 'ellipse':
    case 'highlight':
    case 'image':
      return (
        x >= annotation.x - margin &&
        x <= annotation.x + annotation.width + margin &&
        y >= annotation.y - margin &&
        y <= annotation.y + annotation.height + margin
      );

    case 'text':
      return (
        x >= annotation.x - margin &&
        x <= annotation.x + annotation.width + margin &&
        y >= annotation.y - margin &&
        y <= annotation.y + textHeight(annotation) + margin
      );

    case 'line':
      return (
        distanceToSegment(x, y, annotation.x1, annotation.y1, annotation.x2, annotation.y2) <=
        annotation.strokeWidth + margin
      );

    case 'ink': {
      for (let i = 0; i + 3 < annotation.points.length; i += 2) {
        const distance = distanceToSegment(
          x,
          y,
          annotation.points[i]!,
          annotation.points[i + 1]!,
          annotation.points[i + 2]!,
          annotation.points[i + 3]!,
        );
        if (distance <= annotation.strokeWidth + margin) return true;
      }
      return false;
    }
  }
}

/** The topmost mark under a point — later marks are drawn over earlier ones. */
export function findAt(annotations: Annotation[], x: number, y: number): Annotation | null {
  for (let i = annotations.length - 1; i >= 0; i -= 1) {
    const annotation = annotations[i]!;
    if (hitTest(annotation, x, y)) return annotation;
  }
  return null;
}

/** Shifts a mark by a delta, whatever shape it happens to be. */
export function translate(annotation: Annotation, dx: number, dy: number): Annotation {
  switch (annotation.kind) {
    case 'line':
      return {
        ...annotation,
        x1: annotation.x1 + dx,
        y1: annotation.y1 + dy,
        x2: annotation.x2 + dx,
        y2: annotation.y2 + dy,
      };

    case 'ink':
      return {
        ...annotation,
        points: annotation.points.map((value, index) => (index % 2 === 0 ? value + dx : value + dy)),
      };

    default:
      return { ...annotation, x: annotation.x + dx, y: annotation.y + dy };
  }
}
