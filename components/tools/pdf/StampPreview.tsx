'use client';

import { useEffect, useRef, useState } from 'react';

import { extractPages, renderThumbnails } from '@/lib/pdf/operations';

/**
 * A live preview that runs the real pipeline.
 *
 * It would be quicker to fake the stamp with a rotated <div> over a page
 * thumbnail, and it would also be a lie — the preview would drift from the
 * output the moment either changed. Instead one page is pulled out, put through
 * the exact function the download uses, and rendered. It costs a couple of
 * hundred milliseconds behind a debounce, and what you see is what you get.
 */
export function StampPreview({
  bytes,
  pageIndex,
  pageCount,
  apply,
  onPageChange,
}: {
  bytes: Uint8Array;
  pageIndex: number;
  pageCount: number;
  /** Runs the tool's real transform over a single-page document. */
  apply: (single: Uint8Array) => Promise<Uint8Array>;
  onPageChange: (index: number) => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Identifies the newest request, so a slow render can never overwrite the
  // result of a newer one that finished first.
  const requestRef = useRef(0);

  useEffect(() => {
    const request = (requestRef.current += 1);
    let cancelled = false;

    const timer = setTimeout(async () => {
      setIsRendering(true);
      try {
        const single = await extractPages(bytes, [pageIndex]);
        const stamped = await apply(single);
        const [thumbnail] = await renderThumbnails(stamped, 900);
        if (!cancelled && request === requestRef.current) {
          setDataUrl(thumbnail?.dataUrl ?? null);
          setError(null);
        }
      } catch (cause) {
        if (!cancelled && request === requestRef.current) {
          setError(cause instanceof Error ? cause.message : 'Could not render the preview.');
        }
      } finally {
        if (!cancelled && request === requestRef.current) setIsRendering(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bytes, pageIndex, apply]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-semibold">Preview</h3>
        {pageCount > 1 ? (
          <div className="flex items-center gap-1">
            <PagerButton
              label="Previous page"
              disabled={pageIndex === 0}
              onClick={() => onPageChange(pageIndex - 1)}
            >
              <path d="m14 6-6 6 6 6" />
            </PagerButton>
            <span className="min-w-20 text-center text-xs text-muted tabular-nums">
              Page {pageIndex + 1} of {pageCount}
            </span>
            <PagerButton
              label="Next page"
              disabled={pageIndex >= pageCount - 1}
              onClick={() => onPageChange(pageIndex + 1)}
            >
              <path d="m10 6 6 6-6 6" />
            </PagerButton>
          </div>
        ) : null}
      </div>

      <div className="relative grid min-h-72 place-items-center rounded-xl border border-line bg-sunken p-4">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a canvas data URL, not an asset
          <img
            src={dataUrl}
            alt={`Page ${pageIndex + 1} with your changes applied`}
            className="max-h-[32rem] w-auto rounded-md shadow-card"
          />
        ) : (
          <p className="text-sm text-muted">{error ?? 'Rendering the page…'}</p>
        )}

        {isRendering && dataUrl ? (
          <span className="absolute right-3 top-3 rounded-full bg-surface/90 px-2.5 py-1 text-xs text-muted">
            Updating…
          </span>
        ) : null}
      </div>

      {error && dataUrl ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

function PagerButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-text disabled:pointer-events-none disabled:opacity-30"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}
