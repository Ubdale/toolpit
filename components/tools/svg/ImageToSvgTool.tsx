'use client';

import { useEffect, useRef, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RangeInput } from '@/components/ui/Field';
import { downloadBlob } from '@/lib/download';
import { formatBytes, stripExtension } from '@/lib/format';
import { byteLength } from '@/lib/svg/optimize';
import {
  defaultTraceSettings,
  readImageData,
  traceToSvg,
  type TraceResult,
  type TraceSettings,
} from '@/lib/svg/trace';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
const MAX_EDGE = 900;

export default function ImageToSvgTool() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [settings, setSettings] = useState<TraceSettings>(defaultTraceSettings);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTracing, setIsTracing] = useState(false);

  const previewRef = useRef<string | null>(null);
  previewRef.current = preview;
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  function update<K extends keyof TraceSettings>(key: K, value: TraceSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function addFile(files: File[]) {
    const picked = files[0];
    if (!picked) return;
    if (!ACCEPTED.includes(picked.type)) {
      setError(`${picked.name} was skipped — use a PNG, JPG, WebP, AVIF or GIF.`);
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setError(null);
    setResult(null);
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  }

  async function run() {
    if (!file) return;
    setError(null);
    setIsTracing(true);
    try {
      // Yield a frame so the button reaches its busy state before the tracer
      // takes over the main thread.
      await new Promise((resolve) => setTimeout(resolve, 16));
      const imageData = await readImageData(file, MAX_EDGE);
      setResult(await traceToSvg(imageData, settings));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not trace this image.');
    } finally {
      setIsTracing(false);
    }
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <ToolSurface className="flex flex-col gap-6">
        {!file ? (
          <Dropzone
            onFiles={addFile}
            accept={ACCEPTED.join(',')}
            label="Add an image to trace"
            hint="Logos, icons and flat graphics trace best. Photographs turn into thousands of paths."
          />
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-sunken">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- object URL
                <img src={preview} alt={file.name} className="max-h-full max-w-full object-contain" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-sm text-muted">{formatBytes(file.size)}</p>
            </div>
            <Button variant="ghost" onClick={reset} disabled={isTracing}>
              Clear
            </Button>
          </div>
        )}

        <ErrorMessage>{error}</ErrorMessage>

        {file ? (
          <>
            <div className="flex flex-col gap-4">
              <ToolSectionHeading>Tracing</ToolSectionHeading>

              <Field
                label={`Colours: ${settings.colors}`}
                hint="The palette the image is reduced to before tracing. Two gives you a clean silhouette."
              >
                {({ id, describedBy }) => (
                  <RangeInput
                    id={id}
                    aria-describedby={describedBy}
                    min={2}
                    max={32}
                    step={1}
                    value={settings.colors}
                    onChange={(event) => update('colors', Number(event.target.value))}
                  />
                )}
              </Field>

              <Field
                label={`Smoothing: ${settings.detail.toFixed(1)}`}
                hint="Higher smooths the outlines into fewer, looser curves. Lower hugs the pixels."
              >
                {({ id, describedBy }) => (
                  <RangeInput
                    id={id}
                    aria-describedby={describedBy}
                    min={0.1}
                    max={4}
                    step={0.1}
                    value={settings.detail}
                    onChange={(event) => update('detail', Number(event.target.value))}
                  />
                )}
              </Field>

              <Field
                label={`Speckle removal: ${settings.despeckle}`}
                hint="Discards traced shapes smaller than this, clearing up noise and JPEG artefacts."
              >
                {({ id, describedBy }) => (
                  <RangeInput
                    id={id}
                    aria-describedby={describedBy}
                    min={0}
                    max={40}
                    step={1}
                    value={settings.despeckle}
                    onChange={(event) => update('despeckle', Number(event.target.value))}
                  />
                )}
              </Field>

              <Field
                label={`Pre-blur: ${settings.blur}`}
                hint="Softens the source first. Helps on photographs; leave at 0 for crisp logos."
              >
                {({ id, describedBy }) => (
                  <RangeInput
                    id={id}
                    aria-describedby={describedBy}
                    min={0}
                    max={5}
                    step={1}
                    value={settings.blur}
                    onChange={(event) => update('blur', Number(event.target.value))}
                  />
                )}
              </Field>
            </div>

            <Button size="lg" onClick={run} disabled={isTracing}>
              {isTracing ? 'Tracing…' : result ? 'Trace again' : 'Trace to SVG'}
            </Button>
          </>
        ) : null}
      </ToolSurface>

      {result && file ? (
        <section
          aria-label="Result"
          className="rounded-2xl border border-vault-line bg-vault-soft p-5 sm:p-6"
        >
          <p className="text-sm font-medium text-vault">
            Done — and your file never left your device. Download it below.
          </p>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-heading">{stripExtension(file.name)}.svg</p>
              <p className="text-sm text-muted">
                {formatBytes(byteLength(result.svg))} · {result.paths} paths ·{' '}
                {result.width}×{result.height} source
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  downloadBlob(
                    new Blob([result.svg], { type: 'image/svg+xml' }),
                    `${stripExtension(file.name)}.svg`,
                  )
                }
              >
                Download SVG
              </Button>
              <CopyButton text={result.svg} label="Copy SVG" />
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <figure className="rounded-xl border border-line bg-surface p-3">
              <figcaption className="mb-2 text-xs font-medium text-muted">Original</figcaption>
              <div className="grid h-56 place-items-center overflow-hidden rounded-lg bg-sunken">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- object URL
                  <img src={preview} alt="Source image" className="max-h-full max-w-full object-contain" />
                ) : null}
              </div>
            </figure>
            <figure className="rounded-xl border border-line bg-surface p-3">
              <figcaption className="mb-2 text-xs font-medium text-muted">Traced SVG</figcaption>
              <div className="grid h-56 place-items-center overflow-hidden rounded-lg bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
                <img
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`}
                  alt="Traced vector result"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </figure>
          </div>

          <p className="mt-4 text-sm text-muted">
            Not sharp enough? Raise the colours and lower the smoothing, then trace again. Too
            heavy? Fewer colours and more speckle removal will cut the path count down.
          </p>
        </section>
      ) : null}
    </div>
  );
}
