'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, RadioCards } from '@/components/ui/Field';
import { FileList } from '@/components/ui/FileList';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultPanel } from '@/components/ui/ResultPanel';
import { imagesToPdf, toPdfBlob, type PageSize } from '@/lib/pdf/operations';

type Picked = {
  id: string;
  file: File;
  /** Object URL for the thumbnail; revoked when the entry goes away. */
  preview: string;
};

/**
 * Raster formats only. SVG is deliberately excluded: it is a vector document,
 * not a bitmap, and neither pdf-lib nor createImageBitmap can embed one, so
 * accepting it would only produce a confusing failure at conversion time.
 */
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];

let counter = 0;

export default function ImagesToPdfTool() {
  const [images, setImages] = useState<Picked[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>('fit');
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isBusy = progress !== null;

  // Object URLs are the one browser resource this tool leaks if ignored. The
  // ref lets the unmount cleanup see the *current* list rather than the empty
  // one captured on first render.
  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(
    () => () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.preview);
    },
    [],
  );

  const add = useCallback((incoming: File[]) => {
    const accepted = incoming.filter((file) => ACCEPTED.includes(file.type));
    const skipped = incoming.filter((file) => !ACCEPTED.includes(file.type));

    setError(
      skipped.length === 0
        ? null
        : skipped.length === 1
          ? `${skipped[0]!.name} was skipped — use a PNG, JPG, WebP, AVIF or GIF.`
          : `${skipped.length} files were skipped — use PNG, JPG, WebP, AVIF or GIF.`,
    );

    setImages((current) => [
      ...current,
      ...accepted.map((file) => ({
        id: `img-${(counter += 1)}`,
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
  }, []);

  function remove(id: string) {
    setImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((image) => image.id !== id);
    });
  }

  function move(id: string, direction: -1 | 1) {
    setImages((current) => {
      const index = current.findIndex((image) => image.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  }

  async function run() {
    setError(null);
    setResult(null);
    setProgress(0);

    try {
      const bytes = await imagesToPdf(
        images.map((image) => image.file),
        { pageSize, margin: pageSize === 'fit' ? 0 : 36 },
        (done, total) => setProgress(done / total),
      );
      setResult(toPdfBlob(bytes));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not build the PDF.');
    } finally {
      setProgress(null);
    }
  }

  function reset() {
    for (const image of images) URL.revokeObjectURL(image.preview);
    setImages([]);
    setResult(null);
    setError(null);
  }

  if (result) {
    return (
      <ResultPanel
        filename="images.pdf"
        size={result.size}
        detail={`${images.length} page${images.length === 1 ? '' : 's'}`}
        target={{ blob: result, filename: 'images.pdf' }}
        onReset={reset}
      />
    );
  }

  return (
    <ToolSurface className="flex flex-col gap-6">
      <Dropzone
        onFiles={add}
        accept={ACCEPTED.join(',')}
        multiple
        label={images.length === 0 ? 'Add your images' : 'Add more images'}
        hint="JPG, PNG, WebP, AVIF and GIF. One image per page, in the order below."
        disabled={isBusy}
      />

      <ErrorMessage>{error}</ErrorMessage>

      {images.length > 0 ? (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <ToolSectionHeading>Page order</ToolSectionHeading>
              <p className="text-sm text-muted">
                {images.length} image{images.length === 1 ? '' : 's'}
              </p>
            </div>

            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {images.map((image, index) => (
                <li key={image.id} className="overflow-hidden rounded-xl border border-line">
                  <div className="grid aspect-square place-items-center bg-sunken">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local
                        object URL; there is nothing for next/image to optimise. */}
                    <img
                      src={image.preview}
                      alt={image.file.name}
                      className="size-full object-cover"
                    />
                  </div>
                  <p className="px-2 py-1 text-center text-xs text-muted tabular-nums">
                    {index + 1}
                  </p>
                </li>
              ))}
            </ul>

            <FileList
              label="Images to convert, in order"
              files={images.map((image) => ({
                id: image.id,
                name: image.file.name,
                size: image.file.size,
              }))}
              onRemove={remove}
              onMove={move}
            />
          </div>

          <RadioCards
            name="page-size"
            legend="Page size"
            value={pageSize}
            onChange={setPageSize}
            options={[
              {
                value: 'fit',
                label: 'Fit to image',
                description: 'Each page takes the exact size of its image. No margins, no cropping.',
              },
              { value: 'a4', label: 'A4', description: 'Centred with a 0.5in margin.' },
              { value: 'letter', label: 'US Letter', description: 'Centred with a 0.5in margin.' },
            ]}
          />

          {isBusy ? <ProgressBar value={progress} label="Building your PDF…" /> : null}

          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={run} disabled={isBusy}>
              Create PDF
            </Button>
            <Button variant="ghost" onClick={reset} disabled={isBusy}>
              Clear
            </Button>
          </div>
        </>
      ) : null}
    </ToolSurface>
  );
}
