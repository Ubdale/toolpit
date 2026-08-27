'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { BeforeAfter } from '@/components/ui/BeforeAfter';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, RadioCards } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { downloadBlob } from '@/lib/download';
import { formatBytes, stripExtension } from '@/lib/format';
import { loadUpscaler, type UpscaleFactor, type UpscaleFamily } from '@/lib/ai/runtime';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

/**
 * Per-model source limits.
 *
 * Cost scales with output pixels, and the heavier networks do far more work per
 * tile. A cap that is generous for `slim` would leave `thick` grinding for ten
 * minutes, so each model states its own honest ceiling.
 */
const FAMILIES: Record<
  UpscaleFamily,
  { label: string; note: string; maxPixels: number; patchSize: number }
> = {
  slim: {
    label: 'Fast',
    note: 'Lightest network. Good on flat art and icons, quickest by far.',
    maxPixels: 1_400_000,
    patchSize: 64,
  },
  medium: {
    label: 'Balanced',
    note: 'Noticeably better on photographs and texture. A few times slower.',
    maxPixels: 700_000,
    patchSize: 48,
  },
  thick: {
    label: 'Best',
    note: 'The sharpest result this runs. Slow — best on small sources.',
    maxPixels: 350_000,
    patchSize: 32,
  },
};

export default function UpscaleTool() {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<{ url: string; width: number; height: number } | null>(null);
  const [family, setFamily] = useState<UpscaleFamily>('medium');
  const [scale, setScale] = useState<UpscaleFactor>(2);
  const [result, setResult] = useState<
    { blob: Blob; url: string; width: number; height: number } | null
  >(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

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

  const limit = FAMILIES[family];
  const sourcePixels = source ? source.width * source.height : 0;
  const overLimit = sourcePixels > limit.maxPixels;

  async function addFile(files: File[]) {
    const picked = files[0];
    if (!picked) return;
    if (!ACCEPTED.includes(picked.type)) {
      setError(`${picked.name} was skipped — use a PNG, JPG, WebP or AVIF.`);
      return;
    }

    const bitmap = await createImageBitmap(picked);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();

    setError(null);
    setResult(null);
    setFile(picked);
    setSource({ url: track(URL.createObjectURL(picked)), ...dimensions });
  }

  useEffect(() => {
    if (progress === null) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [progress === null]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    if (!file || !source) return;
    setError(null);
    setResult(null);
    setProgress(0);
    setElapsed(0);

    let upscaler: Awaited<ReturnType<typeof loadUpscaler>> | null = null;
    try {
      upscaler = await loadUpscaler(family, scale);

      const dataUrl = await upscaler.upscale(source.url, {
        output: 'base64',
        // Tiling keeps peak memory flat: without it a large source at 4x would
        // try to allocate the whole output as one tensor.
        patchSize: limit.patchSize,
        padding: 4,
        progress: ((rate: number) => setProgress(rate)) as never,
      });

      const blob = await (await fetch(dataUrl)).blob();
      const bitmap = await createImageBitmap(blob);
      setResult({
        blob,
        url: track(URL.createObjectURL(blob)),
        width: bitmap.width,
        height: bitmap.height,
      });
      bitmap.close();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not upscale this image: ${cause.message}`
          : 'Could not upscale this image.',
      );
    } finally {
      upscaler?.dispose();
      setProgress(null);
    }
  }

  function reset() {
    setFile(null);
    setSource(null);
    setResult(null);
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
            label="Add an image to enlarge"
            hint="Works best on small sources — icons, avatars, old photos, game art."
          />
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-sunken">
              {source ? (
                // eslint-disable-next-line @next/next/no-img-element -- object URL
                <img src={source.url} alt={file.name} className="size-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-sm text-muted">
                {formatBytes(file.size)} · {source?.width}×{source?.height}
              </p>
            </div>
            <Button variant="ghost" onClick={reset} disabled={isBusy}>
              Clear
            </Button>
          </div>
        )}

        <ErrorMessage>{error}</ErrorMessage>

        {file && source ? (
          <>
            <RadioCards
              name="upscale-model"
              legend="Model"
              value={family}
              onChange={setFamily}
              options={(Object.keys(FAMILIES) as UpscaleFamily[]).map((key) => ({
                value: key,
                label: FAMILIES[key].label,
                description: FAMILIES[key].note,
              }))}
            />

            <RadioCards
              name="upscale-factor"
              legend="Enlarge by"
              value={String(scale)}
              onChange={(value) => setScale(Number(value) as UpscaleFactor)}
              options={([2, 3, 4] as const).map((value) => ({
                value: String(value),
                label: `${value}×`,
                description: `${source.width * value}×${source.height * value}`,
              }))}
            />

            {overLimit ? (
              <p role="alert" className="rounded-xl border border-line bg-sunken px-3.5 py-3 text-xs text-danger">
                This source is {source.width}×{source.height}, above the{' '}
                {Math.round(limit.maxPixels / 100_000) / 10} megapixel ceiling for the{' '}
                {limit.label.toLowerCase()} model. Pick a lighter model, or start from a smaller
                image — anything more would grind for many minutes in a browser tab.
              </p>
            ) : (
              <p className="rounded-xl border border-line bg-sunken px-3.5 py-3 text-xs text-muted">
                The model ships with the page and runs on your own GPU through WebGL. Nothing is
                uploaded, there is no queue, and the progress below is real work.
              </p>
            )}

            {isBusy ? (
              <ProgressBar
                value={progress}
                label={`Upscaling on your device… ${elapsed}s elapsed`}
              />
            ) : null}

            <Button size="lg" onClick={run} disabled={isBusy || overLimit}>
              {isBusy ? 'Upscaling…' : result ? 'Upscale again' : `Upscale ${scale}×`}
            </Button>
          </>
        ) : null}
      </ToolSurface>

      {result && file && source ? (
        <section
          aria-label="Result"
          className="rounded-2xl border border-vault-line bg-vault-soft p-5 sm:p-6"
        >
          <p className="text-sm font-medium text-vault">
            Done — and your file never left your device. Download it below.
          </p>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-heading">
                {stripExtension(file.name)}-{scale}x.png
              </p>
              <p className="text-sm text-muted">
                {formatBytes(result.blob.size)} · {source.width}×{source.height} → {result.width}×
                {result.height} · {FAMILIES[family].label} model
              </p>
            </div>
            <Button
              onClick={() =>
                downloadBlob(result.blob, `${stripExtension(file.name)}-${scale}x.png`)
              }
            >
              Download PNG
            </Button>
          </div>

          <div className="mt-6">
            <ToolSectionHeading>Drag to compare</ToolSectionHeading>
            <p className="mt-1 mb-3 text-xs text-muted">
              The left side is the original blown up by the browser, so you are comparing against
              a plain resize rather than against nothing.
            </p>
            <BeforeAfter
              beforeSrc={source.url}
              afterSrc={result.url}
              beforeLabel="Plain resize"
              afterLabel={`${FAMILIES[family].label} ${scale}×`}
              pixelateBefore
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
