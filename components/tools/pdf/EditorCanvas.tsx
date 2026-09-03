'use client';

import { useMemo, type PointerEvent as ReactPointerEvent } from 'react';

import type { Annotation } from '@/lib/pdf/annotate';
import { TEXT_LINE_RATIO } from '@/lib/pdf/annotate';

/**
 * The page image plus the annotation overlay.
 *
 * Annotations are stored in page points and drawn through a single CSS scale,
 * so zooming changes one number and never touches the data. Shapes go in one
 * SVG (which gets the same geometry the PDF writer will use), while text and
 * images are real DOM elements so they can be selected and edited in place.
 */
export function EditorCanvas({
  pageUrl,
  pageWidth,
  pageHeight,
  zoom,
  annotations,
  selectedId,
  imageUrls,
  cursor,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  pageUrl: string | null;
  /** Page size in points, at 100%. */
  pageWidth: number;
  pageHeight: number;
  zoom: number;
  annotations: Annotation[];
  selectedId: string | null;
  imageUrls: Record<string, string>;
  cursor: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const shapes = useMemo(
    () => annotations.filter((annotation) => annotation.kind !== 'text' && annotation.kind !== 'image'),
    [annotations],
  );

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        width: pageWidth * zoom,
        height: pageHeight * zoom,
        cursor,
      }}
      className="relative shrink-0 touch-none select-none bg-white shadow-card"
    >
      {pageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a rendered page, not an asset
        <img
          src={pageUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full"
        />
      ) : (
        <div className="grid size-full place-items-center text-sm text-muted">Rendering page…</div>
      )}

      <svg
        viewBox={`0 0 ${pageWidth} ${pageHeight}`}
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
      >
        {shapes.map((annotation) => (
          <Shape key={annotation.id} annotation={annotation} selected={annotation.id === selectedId} />
        ))}
      </svg>

      {annotations.map((annotation) => {
        if (annotation.kind === 'text') {
          const selected = annotation.id === selectedId;
          return (
            <div
              key={annotation.id}
              className={`pointer-events-none absolute whitespace-pre-wrap ${
                selected ? 'outline-2 outline-offset-2 outline-accent' : ''
              }`}
              style={{
                left: annotation.x * zoom,
                top: annotation.y * zoom,
                width: annotation.width * zoom,
                fontFamily:
                  annotation.family === 'serif'
                    ? "'Times New Roman', Times, serif"
                    : annotation.family === 'mono'
                      ? "'Courier New', Courier, monospace"
                      : 'Helvetica, Arial, sans-serif',
                fontSize: annotation.size * zoom,
                lineHeight: TEXT_LINE_RATIO,
                fontWeight: annotation.bold ? 700 : 400,
                fontStyle: annotation.italic ? 'italic' : 'normal',
                color: annotation.color,
              }}
            >
              {annotation.text || (selected ? '' : 'Text')}
            </div>
          );
        }

        if (annotation.kind === 'image') {
          const url = imageUrls[annotation.id];
          if (!url) return null;
          return (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL
            <img
              key={annotation.id}
              src={url}
              alt=""
              draggable={false}
              className={`pointer-events-none absolute ${
                annotation.id === selectedId ? 'outline-2 outline-offset-2 outline-accent' : ''
              }`}
              style={{
                left: annotation.x * zoom,
                top: annotation.y * zoom,
                width: annotation.width * zoom,
                height: annotation.height * zoom,
                opacity: annotation.opacity,
              }}
            />
          );
        }

        return null;
      })}
    </div>
  );
}

function Shape({ annotation, selected }: { annotation: Annotation; selected: boolean }) {
  const outline = selected ? { stroke: '#d1541f', strokeDasharray: '4 3', strokeWidth: 1 } : null;

  switch (annotation.kind) {
    case 'rect':
    case 'highlight': {
      const filled = annotation.filled || annotation.kind === 'highlight';
      return (
        <>
          <rect
            x={annotation.x}
            y={annotation.y}
            width={annotation.width}
            height={annotation.height}
            fill={filled ? annotation.color : 'none'}
            fillOpacity={filled ? annotation.opacity : 0}
            stroke={filled ? 'none' : annotation.color}
            strokeOpacity={annotation.opacity}
            strokeWidth={annotation.strokeWidth}
          />
          {outline ? (
            <rect
              x={annotation.x}
              y={annotation.y}
              width={annotation.width}
              height={annotation.height}
              fill="none"
              {...outline}
            />
          ) : null}
        </>
      );
    }

    case 'ellipse':
      return (
        <ellipse
          cx={annotation.x + annotation.width / 2}
          cy={annotation.y + annotation.height / 2}
          rx={Math.max(1, annotation.width / 2)}
          ry={Math.max(1, annotation.height / 2)}
          fill={annotation.filled ? annotation.color : 'none'}
          fillOpacity={annotation.filled ? annotation.opacity : 0}
          stroke={annotation.filled ? (selected ? '#d1541f' : 'none') : annotation.color}
          strokeOpacity={annotation.opacity}
          strokeWidth={annotation.strokeWidth}
          strokeDasharray={selected ? '4 3' : undefined}
        />
      );

    case 'line': {
      const angle = Math.atan2(annotation.y2 - annotation.y1, annotation.x2 - annotation.x1);
      const head = Math.max(6, annotation.strokeWidth * 4);
      const spread = 0.44;

      return (
        <g
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth}
          strokeLinecap="round"
          fill="none"
        >
          <line x1={annotation.x1} y1={annotation.y1} x2={annotation.x2} y2={annotation.y2} />
          {annotation.arrow
            ? [1, -1].map((direction) => (
                <line
                  key={direction}
                  x1={annotation.x2}
                  y1={annotation.y2}
                  x2={annotation.x2 - head * Math.cos(angle - direction * spread)}
                  y2={annotation.y2 - head * Math.sin(angle - direction * spread)}
                />
              ))
            : null}
          {selected ? (
            <line
              x1={annotation.x1}
              y1={annotation.y1}
              x2={annotation.x2}
              y2={annotation.y2}
              stroke="#d1541f"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}
        </g>
      );
    }

    case 'ink': {
      const path = annotation.points.reduce(
        (accumulator, value, index) =>
          index % 2 === 0
            ? `${accumulator}${index === 0 ? 'M' : 'L'}${value} `
            : `${accumulator}${value} `,
        '',
      );
      return (
        <path
          d={path}
          fill="none"
          stroke={annotation.color}
          strokeWidth={annotation.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={selected ? 0.75 : 1}
        />
      );
    }

    default:
      return null;
  }
}
