'use client';

import { useEffect, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage } from '@/components/ui/Field';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ResultPanel } from '@/components/ui/ResultPanel';
import { stripExtension } from '@/lib/format';
import {
  applyPageEdits,
  renderThumbnails,
  toPdfBlob,
  type Thumbnail,
} from '@/lib/pdf/operations';

import { usePdfFiles } from './usePdfFiles';
import { Icon, type IconName } from '@/components/ui/Icon';

type Page = {
  /** Index in the original document. */
  sourceIndex: number;
  rotation: number;
};

export default function OrganizeTool() {
  const { files, error, setError, isReading, add, clear } = usePdfFiles(false);
  const file = files[0];

  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [renderProgress, setRenderProgress] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<Blob | null>(null);

  // Render previews as soon as a file lands. Cancelled on unmount / replacement
  // so a slow 300-page render can't write over a newer document's state.
  useEffect(() => {
    if (!file) {
      setThumbnails([]);
      setPages([]);
      return;
    }

    let cancelled = false;
    setRenderProgress(0);
    setPages(
      Array.from({ length: file.pageCount }, (_, index) => ({
        sourceIndex: index,
        rotation: 0,
      })),
    );

    renderThumbnails(file.bytes, 200, (done, total) => {
      if (!cancelled) setRenderProgress(done / total);
    })
      .then((rendered) => {
        if (!cancelled) setThumbnails(rendered);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : 'Could not render page previews.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setRenderProgress(null);
      });

    return () => {
      cancelled = true;
    };
  }, [file, setError]);

  function movePage(position: number, direction: -1 | 1) {
    setPages((current) => {
      const target = position + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(position, 1);
      next.splice(target, 0, moved!);
      return next;
    });
  }

  function rotatePage(position: number) {
    setPages((current) =>
      current.map((page, index) =>
        index === position ? { ...page, rotation: (page.rotation + 90) % 360 } : page,
      ),
    );
  }

  function deletePage(position: number) {
    setPages((current) => current.filter((_, index) => index !== position));
  }

  function rotateAll() {
    setPages((current) => current.map((page) => ({ ...page, rotation: (page.rotation + 90) % 360 })));
  }

  function resetEdits() {
    if (!file) return;
    setPages(
      Array.from({ length: file.pageCount }, (_, index) => ({ sourceIndex: index, rotation: 0 })),
    );
  }

  async function save() {
    if (!file) return;
    setError(null);
    setIsSaving(true);
    try {
      const bytes = await applyPageEdits(file.bytes, pages);
      setResult(toPdfBlob(bytes));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the PDF.');
    } finally {
      setIsSaving(false);
    }
  }

  function reset() {
    clear();
    setResult(null);
    setThumbnails([]);
    setPages([]);
  }

  if (result && file) {
    const filename = `${stripExtension(file.name)}-organized.pdf`;
    return (
      <ResultPanel
        filename={filename}
        size={result.size}
        detail={`${pages.length} page${pages.length === 1 ? '' : 's'}`}
        target={{ blob: result, filename }}
        onReset={reset}
      />
    );
  }

  const isDirty =
    !!file &&
    (pages.length !== file.pageCount ||
      pages.some((page, index) => page.sourceIndex !== index || page.rotation !== 0));

  return (
    <ToolSurface className="flex flex-col gap-6">
      {!file ? (
        <Dropzone
          onFiles={add}
          accept="application/pdf,.pdf"
          label="Add a PDF to organize"
          hint="Pages are rendered for preview inside this tab — nothing is uploaded."
        />
      ) : null}

      <ErrorMessage>{error}</ErrorMessage>
      {isReading ? <p className="text-sm text-muted">Reading file…</p> : null}
      {renderProgress !== null ? (
        <ProgressBar value={renderProgress} label="Rendering page previews…" />
      ) : null}

      {file && pages.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <ToolSectionHeading>{file.name}</ToolSectionHeading>
              <p className="text-sm text-muted">
                {pages.length} of {file.pageCount} pages kept
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={rotateAll}>
                Rotate all
              </Button>
              <Button size="sm" variant="ghost" onClick={resetEdits} disabled={!isDirty}>
                Reset changes
              </Button>
            </div>
          </div>

          <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {pages.map((page, position) => {
              const thumbnail = thumbnails.find((item) => item.pageIndex === page.sourceIndex);
              return (
                <li
                  key={`${page.sourceIndex}-${position}`}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-2"
                >
                  <div className="grid aspect-3/4 place-items-center overflow-hidden rounded-lg bg-sunken">
                    {thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a
                      // data URL rendered in-tab; next/image would only add a
                      // loader round-trip for something already in memory.
                      <img
                        src={thumbnail.dataUrl}
                        alt={`Page ${page.sourceIndex + 1} of ${file.name}`}
                        className="max-h-full max-w-full object-contain transition-transform"
                        style={{ transform: `rotate(${page.rotation}deg)` }}
                      />
                    ) : (
                      <span className="text-xs text-muted">Page {page.sourceIndex + 1}</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <span className="pl-1 text-xs text-muted tabular-nums">
                      {position + 1}
                      <span className="sr-only"> (originally page {page.sourceIndex + 1})</span>
                    </span>
                    <span className="flex items-center">
                      <PageAction
                        label={`Move page ${position + 1} earlier`}
                        icon="chevronLeft"
                        onClick={() => movePage(position, -1)}
                        disabled={position === 0}
                      />
                      <PageAction
                        label={`Move page ${position + 1} later`}
                        icon="chevronRight"
                        onClick={() => movePage(position, 1)}
                        disabled={position === pages.length - 1}
                      />
                      <PageAction
                        label={`Rotate page ${position + 1}`}
                        icon="refresh"
                        onClick={() => rotatePage(position)}
                      />
                      <PageAction
                        label={`Delete page ${position + 1}`}
                        icon="delete"
                        onClick={() => deletePage(position)}
                        danger
                      />
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={save} disabled={isSaving || pages.length === 0}>
              {isSaving ? 'Saving…' : 'Save PDF'}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={isSaving}>
              Clear
            </Button>
          </div>
        </>
      ) : null}

      {file && pages.length === 0 && renderProgress === null ? (
        <p className="text-sm text-muted">
          You have removed every page. Reset the changes or start over.
        </p>
      ) : null}
    </ToolSurface>
  );
}

function PageAction({
  label,
  onClick,
  disabled,
  danger,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon: IconName;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-7 place-items-center rounded-md transition-colors hover:bg-sunken disabled:pointer-events-none disabled:opacity-30 ${
        danger ? 'text-danger' : 'text-muted hover:text-text'
      }`}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}
