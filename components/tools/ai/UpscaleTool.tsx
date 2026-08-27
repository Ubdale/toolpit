'use client';

import { useEffect, useRef, useState } from 'react';

import { ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, RadioCards } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { downloadBlob } from '@/lib/download';
import { formatBytes, stripExtension } from '@/lib/format';
import { loadUpscaler } from '@/lib/ai/runtime';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

/** Beyond this the tile count — and the wait — stops being reasonable. */
const MAX_SOURCE_PIXELS = 1_400_000;

type Scale = '2' | '3' | '4';

export default function UpscaleTool() {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<{ url: string; width: number; height: number } | null>(null);
  const [scale, setScale] = useState<Scale>('2');
  const [result, setResult] = useState<{ blob: Blob; url: string; width: number; height: number } | null>(
    null,
  );
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const urlsRef = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  function track(url: string) {
    urlsRef.current.push(url);
    return url;
  }

  async function addFile(files: File[]) {
    const picked = files[0];
    if (!picked) return;
    if (!ACCEPTED.includes(picked.type)) {
      setError(`${picked.name} was skipped — use a PNG, JPG, WebP or AVIF.`);
      return;
    }

    const bitmap = await createImageBitmap(picked);
    const pixels = bitmap.width * bitmap.height;
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();

    if (pixels > MAX_SOURCE_PIXELS) {
      setError(
        `That image is ${dimensions.width}×${dimensions.height}. Upscaling works on sources up to about 1.4 megapixels — larger ones would take many minutes in a browser tab.`,
      );
      return;
    }

    setError(null);
    setResult(null);
    setFile(picked);
    setSource({ url: track(URL.createObjectURL(picked)), ...dimensions });
  }

  async function run() {
    if (!file || !source) return;
    setError(null);
    setResult(null);
    setProgress(0);

    let upscaler: Awaited<ReturnType<typeof loadUpscaler>> | null = null;
    try {
      upscaler = await loadUpscaler(Number(scale) as 2 | 3 | 4);

      const dataUrl = await upscaler.upscale(source.url, {
        output: 'base64',
        // Tiling keeps peak memory flat: without it a 1.4MP source at 4x would
        // try to allocate the whole 22MP output as one tensor.
        patchSize: 64,
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
        cause instanceof Error ? `Could not upscale this image: ${cause.message}` : 'Could not upscale this image.',
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
            hint="Works best on small images — icons, avatars, old photos, game art."
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
              name="upscale-factor"
              legend="Enlarge by"
              value={scale}
              onChange={setScale}
              options={(['2', '3', '4'] as Scale[]).map((value) => ({
                value,
                label: `${value}×`,
                description: `${source.width * Number(value)}×${source.height * Number(value)}`,
              }))}
            />

            <p className="rounded-xl border border-line bg-sunken px-3.5 py-3 text-xs text-muted">
              The ESRGAN model ships with the page and runs on your own GPU through WebGL. Larger
              images and higher factors take longer — the progress bar below is real work, not a
              queue position.
            </p>

            {isBusy ? <ProgressBar value={progress} label="Upscaling on your device…" /> : null}

            <Button size="lg" onClick={run} disabled={isBusy}>
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
                {formatBytes(result.blob.size)} · {source.width}×{source.height} →{' '}
                {result.width}×{result.height}
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

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <figure className="rounded-xl border border-line bg-surface p-3">
              <figcaption className="mb-2 text-xs font-medium text-muted">
                Original, scaled up by the browser
              </figcaption>
              <div className="grid h-64 place-items-center overflow-hidden rounded-lg bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
                <img
                  src={source.url}
                  alt="Original, enlarged by the browser for comparison"
                  className="max-h-full max-w-full object-contain"
                  // Nearest-neighbour makes the comparison honest: this is what
                  // a plain resize actually loses.
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </figure>
            <figure className="rounded-xl border border-line bg-surface p-3">
              <figcaption className="mb-2 text-xs font-medium text-muted">Upscaled</figcaption>
              <div className="grid h-64 place-items-center overflow-hidden rounded-lg bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
                <img
                  src={result.url}
                  alt="AI upscaled result"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </figure>
          </div>
        </section>
      ) : null}
    </div>
  );
}
