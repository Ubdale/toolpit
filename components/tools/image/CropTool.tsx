'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RangeInput, TextInput } from '@/components/ui/Field';
import { ResultPanel } from '@/components/ui/ResultPanel';
import { stripExtension } from '@/lib/format';
import {
  aspectRatios,
  cropImage,
  extensionFor,
  hasAlpha,
  imageFormats,
  type CropRect,
  type ImageFormat,
} from '@/lib/image/transform';

import { IMAGE_ACCEPT, useImageFiles } from './useImageFiles';

type DragMode =
  | { kind: 'none' }
  | { kind: 'new'; originX: number; originY: number }
  | { kind: 'move'; offsetX: number; offsetY: number }
  | { kind: 'resize'; corner: Corner; anchorX: number; anchorY: number };

type Corner = 'nw' | 'ne' | 'sw' | 'se';

const HANDLES: { corner: Corner; className: string; cursor: string }[] = [
  { corner: 'nw', className: '-left-1.5 -top-1.5', cursor: 'nwse-resize' },
  { corner: 'ne', className: '-right-1.5 -top-1.5', cursor: 'nesw-resize' },
  { corner: 'sw', className: '-bottom-1.5 -left-1.5', cursor: 'nesw-resize' },
  { corner: 'se', className: '-bottom-1.5 -right-1.5', cursor: 'nwse-resize' },
];

export default function CropTool() {
  const { files, error, setError, isReading, add, clear } = useImageFiles(false);
  const image = files[0];

  const [rect, setRect] = useState<CropRect | null>(null);
  const [ratioKey, setRatioKey] = useState('free');
  const [format, setFormat] = useState<ImageFormat | 'keep'>('keep');
  const [quality, setQuality] = useState(0.9);
  const [background, setBackground] = useState('#ffffff');
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; width: number; height: number } | null>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode>({ kind: 'none' });
  const [displayScale, setDisplayScale] = useState(1);

  const ratio = aspectRatios.find((entry) => entry.value === ratioKey)?.ratio ?? null;

  // The crop box lives in image pixels; the scale converts to what's on screen.
  const measure = useCallback(() => {
    const element = surfaceRef.current;
    if (!element || !image) return;
    setDisplayScale(element.clientWidth / image.width);
  }, [image]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // A fresh image starts with a sensible crop rather than an empty overlay the
  // visitor has to discover they need to drag.
  useEffect(() => {
    if (!image) {
      setRect(null);
      return;
    }
    const size = Math.round(Math.min(image.width, image.height) * 0.8);
    setRect({
      x: Math.round((image.width - size) / 2),
      y: Math.round((image.height - size) / 2),
      width: size,
      height: size,
    });
  }, [image]);

  /** Re-shapes the box around its centre when a ratio is picked. */
  useEffect(() => {
    if (!ratio || !image) return;
    setRect((current) => {
      if (!current) return current;
      const centerX = current.x + current.width / 2;
      const centerY = current.y + current.height / 2;

      let width = current.width;
      let height = width / ratio;
      if (height > image.height) {
        height = image.height;
        width = height * ratio;
      }
      if (width > image.width) {
        width = image.width;
        height = width / ratio;
      }

      return clamp(
        {
          x: centerX - width / 2,
          y: centerY - height / 2,
          width,
          height,
        },
        image.width,
        image.height,
      );
    });
  }, [ratio, image]);

  function pointerToImage(event: ReactPointerEvent): { x: number; y: number } {
    const bounds = surfaceRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / displayScale,
      y: (event.clientY - bounds.top) / displayScale,
    };
  }

  function startNew(event: ReactPointerEvent) {
    if (!image) return;
    const point = pointerToImage(event);
    dragRef.current = { kind: 'new', originX: point.x, originY: point.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setRect({ x: point.x, y: point.y, width: 1, height: 1 });
  }

  function startMove(event: ReactPointerEvent) {
    if (!rect) return;
    event.stopPropagation();
    const point = pointerToImage(event);
    dragRef.current = { kind: 'move', offsetX: point.x - rect.x, offsetY: point.y - rect.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startResize(event: ReactPointerEvent, corner: Corner) {
    if (!rect) return;
    event.stopPropagation();
    // The opposite corner stays fixed while the dragged one moves.
    dragRef.current = {
      kind: 'resize',
      corner,
      anchorX: corner === 'nw' || corner === 'sw' ? rect.x + rect.width : rect.x,
      anchorY: corner === 'nw' || corner === 'ne' ? rect.y + rect.height : rect.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleMove(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (drag.kind === 'none' || !image) return;

    const point = pointerToImage(event);

    setRect((current) => {
      if (!current) return current;

      if (drag.kind === 'move') {
        return clamp(
          { ...current, x: point.x - drag.offsetX, y: point.y - drag.offsetY },
          image.width,
          image.height,
        );
      }

      const anchorX = drag.kind === 'new' ? drag.originX : drag.anchorX;
      const anchorY = drag.kind === 'new' ? drag.originY : drag.anchorY;

      let width = Math.abs(point.x - anchorX);
      let height = Math.abs(point.y - anchorY);
      if (ratio) {
        // Follow whichever axis the pointer moved further along, so a locked
        // ratio still feels like it is tracking the drag.
        if (width / ratio > height) height = width / ratio;
        else width = height * ratio;
      }

      const x = point.x < anchorX ? anchorX - width : anchorX;
      const y = point.y < anchorY ? anchorY - height : anchorY;

      return clamp({ x, y, width, height }, image.width, image.height, ratio);
    });
  }

  function endDrag(event: ReactPointerEvent) {
    if (dragRef.current.kind === 'none') return;
    dragRef.current = { kind: 'none' };
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function setRectField(field: keyof CropRect, value: string) {
    if (!image) return;
    const parsed = Number(value.replace(/\D/g, ''));
    setRect((current) =>
      current
        ? clamp({ ...current, [field]: Number.isFinite(parsed) ? parsed : 0 }, image.width, image.height)
        : current,
    );
  }

  function outputFormat(): ImageFormat {
    if (format !== 'keep') return format;
    const type = image?.file.type as ImageFormat | undefined;
    return type && imageFormats.some((entry) => entry.value === type) ? type : 'image/png';
  }

  async function save() {
    if (!image || !rect) return;
    setError(null);
    setIsSaving(true);
    try {
      const chosen = outputFormat();
      const cropped = await cropImage(image.file, {
        rect,
        format: chosen,
        quality,
        background: hasAlpha(chosen) ? 'transparent' : background,
      });
      setResult(cropped);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not crop the image.');
    } finally {
      setIsSaving(false);
    }
  }

  function reset() {
    clear();
    setResult(null);
    setRect(null);
  }

  if (result && image) {
    const filename = `${stripExtension(image.name)}-cropped.${extensionFor(outputFormat())}`;
    return (
      <ResultPanel
        filename={filename}
        size={result.blob.size}
        detail={`${result.width} × ${result.height}`}
        target={{ blob: result.blob, filename }}
        onReset={reset}
      />
    );
  }

  if (!image) {
    return (
      <ToolSurface>
        <Dropzone
          onFiles={add}
          accept={IMAGE_ACCEPT}
          label="Drop an image here, or click to choose one"
          hint="Cropped on your device at full resolution — nothing is uploaded."
          disabled={isReading}
        />
        <ErrorMessage>{error}</ErrorMessage>
      </ToolSurface>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <ToolSurface>
        <div
          ref={surfaceRef}
          onPointerDown={startNew}
          onPointerMove={handleMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative w-full touch-none select-none overflow-hidden rounded-xl bg-sunken"
          style={{ aspectRatio: `${image.width} / ${image.height}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
          <img
            src={image.url}
            alt={image.name}
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full object-contain"
            onLoad={measure}
          />

          {rect ? (
            <>
              {/* Everything outside the box is dimmed by four panels rather than
                  one big overlay, so the crop area itself takes no filter. */}
              <div className="pointer-events-none absolute inset-0">
                <Shade style={{ left: 0, top: 0, right: 0, height: pct(rect.y, image.height) }} />
                <Shade
                  style={{
                    left: 0,
                    top: pct(rect.y + rect.height, image.height),
                    right: 0,
                    bottom: 0,
                  }}
                />
                <Shade
                  style={{
                    left: 0,
                    top: pct(rect.y, image.height),
                    width: pct(rect.x, image.width),
                    height: pct(rect.height, image.height),
                  }}
                />
                <Shade
                  style={{
                    left: pct(rect.x + rect.width, image.width),
                    top: pct(rect.y, image.height),
                    right: 0,
                    height: pct(rect.height, image.height),
                  }}
                />
              </div>

              <div
                onPointerDown={startMove}
                className="absolute cursor-move border-2 border-accent"
                style={{
                  left: pct(rect.x, image.width),
                  top: pct(rect.y, image.height),
                  width: pct(rect.width, image.width),
                  height: pct(rect.height, image.height),
                }}
              >
                {HANDLES.map((handle) => (
                  <span
                    key={handle.corner}
                    onPointerDown={(event) => startResize(event, handle.corner)}
                    style={{ cursor: handle.cursor }}
                    className={`absolute size-3 rounded-full border-2 border-accent bg-surface ${handle.className}`}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>

        <p className="mt-3 text-xs text-muted">
          Drag inside the box to move it, the corners to resize, or anywhere on the image to start a
          new crop.
        </p>
      </ToolSurface>

      <ToolSurface className="flex flex-col gap-5">
        <ToolSectionHeading>Crop</ToolSectionHeading>

        <Dropdown
          label="Aspect ratio"
          value={ratioKey}
          onChange={(value) => setRatioKey(value ?? 'free')}
          options={aspectRatios.map((entry) => ({ value: entry.value, label: entry.label }))}
        />

        {rect ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="X">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="numeric"
                  value={String(Math.round(rect.x))}
                  onChange={(event) => setRectField('x', event.target.value)}
                />
              )}
            </Field>
            <Field label="Y">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="numeric"
                  value={String(Math.round(rect.y))}
                  onChange={(event) => setRectField('y', event.target.value)}
                />
              )}
            </Field>
            <Field label="Width">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="numeric"
                  value={String(Math.round(rect.width))}
                  onChange={(event) => setRectField('width', event.target.value)}
                />
              )}
            </Field>
            <Field label="Height">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="numeric"
                  value={String(Math.round(rect.height))}
                  onChange={(event) => setRectField('height', event.target.value)}
                />
              )}
            </Field>
          </div>
        ) : null}

        <div className="rounded-xl border border-line bg-sunken px-3 py-2.5 text-xs text-muted">
          Source {image.width} × {image.height} · Crop{' '}
          {rect ? `${Math.round(rect.width)} × ${Math.round(rect.height)}` : '—'}
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setRect({ x: 0, y: 0, width: image.width, height: image.height })}
        >
          Select the whole image
        </Button>

        <div className="border-t border-line pt-4">
          <Dropdown
            label="Output format"
            value={format}
            onChange={(value) => value && setFormat(value as ImageFormat | 'keep')}
            options={[
              { value: 'keep', label: 'Keep the original format' },
              ...imageFormats.map((entry) => ({ value: entry.value, label: entry.label })),
            ]}
          />
        </div>

        {outputFormat() !== 'image/png' ? (
          <Field label={`Quality — ${Math.round(quality * 100)}%`}>
            {({ id }) => (
              <RangeInput
                id={id}
                min={30}
                max={100}
                step={1}
                value={quality * 100}
                onChange={(event) => setQuality(Number(event.target.value) / 100)}
              />
            )}
          </Field>
        ) : null}

        {!hasAlpha(outputFormat()) ? (
          <Field label="Background" hint="Behind any transparent pixels.">
            {({ id }) => (
              <input
                id={id}
                type="color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                className="h-11 w-16 cursor-pointer rounded-xl border border-line bg-surface p-1"
              />
            )}
          </Field>
        ) : null}

        <ErrorMessage>{error}</ErrorMessage>

        <Button onClick={save} disabled={!rect || isSaving} size="lg">
          {isSaving ? 'Cropping…' : 'Crop image'}
        </Button>
        <Button variant="ghost" onClick={reset}>
          Choose a different image
        </Button>
      </ToolSurface>
    </div>
  );
}

function Shade({ style }: { style: React.CSSProperties }) {
  return <span className="absolute bg-canvas/65" style={style} />;
}

function pct(value: number, total: number): string {
  return `${(value / total) * 100}%`;
}

/** Keeps the box inside the image, preserving the ratio if one is locked. */
function clamp(rect: CropRect, imageWidth: number, imageHeight: number, ratio?: number | null): CropRect {
  let width = Math.max(1, Math.min(rect.width, imageWidth));
  let height = Math.max(1, Math.min(rect.height, imageHeight));

  if (ratio) {
    if (width / ratio > imageHeight) width = imageHeight * ratio;
    height = width / ratio;
    if (height > imageHeight) {
      height = imageHeight;
      width = height * ratio;
    }
  }

  const x = Math.max(0, Math.min(rect.x, imageWidth - width));
  const y = Math.max(0, Math.min(rect.y, imageHeight - height));

  return { x, y, width, height };
}
