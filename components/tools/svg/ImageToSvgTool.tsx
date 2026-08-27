'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { BeforeAfter } from '@/components/ui/BeforeAfter';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RangeInput } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { downloadBlob } from '@/lib/download';
import { formatBytes, stripExtension } from '@/lib/format';
import { byteLength } from '@/lib/svg/optimize';
import { VECTOR_FORMATS, exportVector, parseSvg, type VectorFormat } from '@/lib/vector/export';
import {
  MAX_COLOR_PRECISION,
  TRACE_PRESETS,
  canvasFromFile,
  traceImage,
  type TraceResult,
  type TraceSettings,
} from '@/lib/vector/trace';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/bmp'];
const MAX_EDGE = 1400;

export default function ImageToSvgTool() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(TRACE_PRESETS[1]!.id);
  const [settings, setSettings] = useState<TraceSettings>(TRACE_PRESETS[1]!.settings);
  const [advanced, setAdvanced] = useState(false);
  const [result, setResult] = useState<TraceResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [format, setFormat] = useState<VectorFormat>('svg');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);

  const urlsRef = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const track = useCallback((url: string) => {
    urlsRef.current.push(url);
    return url;
  }, []);

  function applyPreset(id: string) {
    const preset = TRACE_PRESETS.find((entry) => entry.id === id);
    if (!preset) return;
    setPresetId(id);
    setSettings(preset.settings);
  }

  function update<K extends keyof TraceSettings>(key: K, value: TraceSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function addFile(files: File[]) {
    const picked = files[0];
    if (!picked) return;
    if (!ACCEPTED.includes(picked.type)) {
      setError(`${picked.name} was skipped — use a PNG, JPG, WebP, AVIF, GIF or BMP.`);
      return;
    }
    setError(null);
    setResult(null);
    setResultUrl(null);
    setFile(picked);
    setPreview(track(URL.createObjectURL(picked)));
  }

  async function run() {
    if (!file) return;
    setError(null);
    setProgress(0);

    try {
      const canvas = await canvasFromFile(file, MAX_EDGE);
      const traced = await traceImage(canvas, settings, setProgress);
      setResult(traced);
      setResultUrl(
        track(URL.createObjectURL(new Blob([traced.svg], { type: 'image/svg+xml' }))),
      );
      setSkipped(parseSvg(traced.svg).skipped);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not trace this image.');
    } finally {
      setProgress(null);
    }
  }

  async function save() {
    if (!result || !file) return;
    const meta = VECTOR_FORMATS.find((entry) => entry.id === format)!;
    const name = stripExtension(file.name);
    try {
      const blob = await exportVector(result.svg, format, name);
      downloadBlob(blob, `${name}.${meta.extension}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not export as ${meta.label}: ${cause.message}`
          : `Could not export as ${meta.label}.`,
      );
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setResultUrl(null);
    setError(null);
  }

  const isBusy = progress !== null;

  return (
    <div className="flex flex-col gap-6">
      <ToolSurface className="flex flex-col gap-6">
        {!file ? (
          <Dropzone
            onFiles={addFile}
            accept={ACCEPTED.join(',')}
            label="Add an image to trace"
            hint="Logos and flat graphics vectorise best, but photographs work too."
          />
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-sunken">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- object URL
                <img src={preview} alt={file.name} className="size-full object-contain" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-sm text-muted">{formatBytes(file.size)}</p>
            </div>
            <Button variant="ghost" onClick={reset} disabled={isBusy}>
              Clear
            </Button>
          </div>
        )}

        <ErrorMessage>{error}</ErrorMessage>

        {file ? (
          <>
            <div className="flex flex-col gap-3">
              <ToolSectionHeading>What are you tracing?</ToolSectionHeading>
              <div className="grid gap-2 sm:grid-cols-2">
                {TRACE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={presetId === preset.id}
                    onClick={() => applyPreset(preset.id)}
                    className={`rounded-xl border px-3.5 py-3 text-left transition-colors ${
                      presetId === preset.id
                        ? 'border-accent bg-accent-soft'
                        : 'border-line bg-surface hover:border-line-strong'
                    }`}
                  >
                    <span className="block text-sm font-medium">{preset.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{preset.note}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setAdvanced((value) => !value)}
                aria-expanded={advanced}
                className="text-sm font-medium text-accent hover:text-accent-hover"
              >
                {advanced ? 'Hide' : 'Show'} advanced controls
              </button>
            </div>

            {advanced ? (
              <div className="flex flex-col gap-4 rounded-xl border border-line bg-sunken p-4">
                <Field
                  label={`Colour detail: ${settings.colorPrecision} bits`}
                  hint="How many distinct colours survive. Lower posterises; higher keeps subtle shading."
                >
                  {({ id, describedBy }) => (
                    <RangeInput
                      id={id}
                      aria-describedby={describedBy}
                      min={1}
                      max={MAX_COLOR_PRECISION}
                      step={1}
                      value={settings.colorPrecision}
                      onChange={(event) => update('colorPrecision', Number(event.target.value))}
                    />
                  )}
                </Field>

                <Field
                  label={`Layer separation: ${settings.layerDifference}`}
                  hint="How different two shades must be to become separate layers. Higher means fewer, flatter layers."
                >
                  {({ id, describedBy }) => (
                    <RangeInput
                      id={id}
                      aria-describedby={describedBy}
                      min={0}
                      max={64}
                      step={2}
                      value={settings.layerDifference}
                      onChange={(event) => update('layerDifference', Number(event.target.value))}
                    />
                  )}
                </Field>

                <Field
                  label={`Speckle removal: ${settings.filterSpeckle}px`}
                  hint="Drops regions smaller than this. Clears JPEG noise and stray dots."
                >
                  {({ id, describedBy }) => (
                    <RangeInput
                      id={id}
                      aria-describedby={describedBy}
                      min={0}
                      max={32}
                      step={1}
                      value={settings.filterSpeckle}
                      onChange={(event) => update('filterSpeckle', Number(event.target.value))}
                    />
                  )}
                </Field>

                <Field
                  label={`Corner threshold: ${settings.cornerThreshold}°`}
                  hint="Angles sharper than this stay as corners. Lower rounds everything off."
                >
                  {({ id, describedBy }) => (
                    <RangeInput
                      id={id}
                      aria-describedby={describedBy}
                      min={0}
                      max={180}
                      step={5}
                      value={settings.cornerThreshold}
                      onChange={(event) => update('cornerThreshold', Number(event.target.value))}
                    />
                  )}
                </Field>

                <div className="flex flex-wrap gap-2">
                  {(['spline', 'polygon', 'pixel'] as const).map((curve) => (
                    <button
                      key={curve}
                      type="button"
                      aria-pressed={settings.curve === curve}
                      onClick={() => update('curve', curve)}
                      className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                        settings.curve === curve
                          ? 'border-accent bg-accent-soft font-medium'
                          : 'border-line bg-surface'
                      }`}
                    >
                      {curve === 'spline' ? 'Smooth curves' : curve === 'polygon' ? 'Straight edges' : 'Pixel exact'}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {isBusy ? <ProgressBar value={progress} label="Tracing on your device…" /> : null}

            <Button size="lg" onClick={run} disabled={isBusy}>
              {isBusy ? 'Tracing…' : result ? 'Trace again' : 'Trace to vector'}
            </Button>
          </>
        ) : null}
      </ToolSurface>

      {result && resultUrl && preview && file ? (
        <section
          aria-label="Result"
          className="rounded-2xl border border-vault-line bg-vault-soft p-5 sm:p-6"
        >
          <p className="text-sm font-medium text-vault">
            Done — and your file never left your device. Download it below.
          </p>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-heading">{stripExtension(file.name)}</p>
              <p className="text-sm text-muted">
                {formatBytes(byteLength(result.svg))} as SVG · {result.paths} paths ·{' '}
                {result.width}×{result.height} source
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={save}>
                Download {VECTOR_FORMATS.find((entry) => entry.id === format)!.label}
              </Button>
              <CopyButton text={result.svg} label="Copy SVG" />
            </div>
          </div>

          {skipped > 0 ? (
            <p className="mt-3 text-xs text-muted">
              {skipped} element{skipped === 1 ? '' : 's'} could not be converted to paths and will
              be missing from PDF, AI and EPS exports. The SVG download is unaffected.
            </p>
          ) : null}

          <div className="mt-6">
            <ToolSectionHeading>Drag to compare</ToolSectionHeading>
            <div className="mt-3">
              <BeforeAfter
                beforeSrc={preview}
                afterSrc={resultUrl}
                beforeLabel="Original"
                afterLabel="Traced vector"
              />
            </div>
          </div>

          <div className="mt-6">
            <ToolSectionHeading>Export format</ToolSectionHeading>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {VECTOR_FORMATS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={format === entry.id}
                  onClick={() => setFormat(entry.id)}
                  className={`rounded-xl border px-3.5 py-3 text-left transition-colors ${
                    format === entry.id
                      ? 'border-accent bg-accent-soft'
                      : 'border-line bg-surface hover:border-line-strong'
                  }`}
                >
                  <span className="block text-sm font-medium">{entry.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{entry.note}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
