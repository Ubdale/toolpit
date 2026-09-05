'use client';

import Link from 'next/link';
import { Checkbox as ArkCheckbox } from '@ark-ui/react';
import { useCallback, useEffect, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage } from '@/components/ui/Field';
import { ResultPanel } from '@/components/ui/ResultPanel';
import { stripExtension } from '@/lib/format';
import { toPdfBlob } from '@/lib/pdf/operations';
import {
  removeWatermarks,
  scanForWatermarks,
  type Finding,
  type ScanResult,
} from '@/lib/pdf/watermark-remove';

import { StampPreview } from './StampPreview';
import { usePdfFiles } from './usePdfFiles';

const CONFIDENCE_LABEL: Record<Finding['confidence'], string> = {
  high: 'Almost certainly a watermark',
  medium: 'Probably a watermark',
  low: 'Repeats, but may be real content',
};

const KIND_LABEL: Record<Finding['kind'], string> = {
  annotation: 'Annotation',
  layer: 'Layer',
  text: 'Text',
  image: 'Image',
};

export default function RemoveWatermarkTool() {
  const { files, error, setError, isReading, add, clear } = usePdfFiles(false);
  const file = files[0];

  const [scan, setScan] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewPage, setPreviewPage] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; removed: number } | null>(null);

  // Scan as soon as a document lands — there is nothing to configure first, and
  // the findings are the entire interface.
  useEffect(() => {
    if (!file) {
      setScan(null);
      setSelected(new Set());
      return;
    }

    let cancelled = false;
    setIsScanning(true);

    scanForWatermarks(file.bytes)
      .then((found) => {
        if (cancelled) return;
        setScan(found);
        // Only the confident findings are ticked. A running footer repeats on
        // every page too, and silently deleting one would be much worse than
        // making someone tick a box.
        setSelected(
          new Set(found.findings.filter((f) => f.confidence === 'high').map((f) => f.id)),
        );
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not read that PDF.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsScanning(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file, setError]);

  const ids = [...selected];
  const key = ids.join('|');

  const applyToPreview = useCallback(
    async (single: Uint8Array) => (await removeWatermarks(single, key ? key.split('|') : [])).bytes,
    [key],
  );

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!file) return;
    setError(null);
    setIsSaving(true);
    try {
      const { bytes, removed } = await removeWatermarks(file.bytes, ids);
      setResult({ blob: toPdfBlob(bytes), removed });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rewrite the PDF.');
    } finally {
      setIsSaving(false);
    }
  }

  function reset() {
    clear();
    setResult(null);
    setScan(null);
    setSelected(new Set());
    setPreviewPage(0);
  }

  if (result && file) {
    const filename = `${stripExtension(file.name)}-clean.pdf`;
    return (
      <ResultPanel
        filename={filename}
        size={result.blob.size}
        detail={`${result.removed} object${result.removed === 1 ? '' : 's'} removed`}
        target={{ blob: result.blob, filename }}
        onReset={reset}
      >
        <p className="text-sm text-muted">
          The watermark was deleted from the file rather than painted over, so the text of your
          document is still text — selectable, searchable and unchanged.
        </p>
      </ResultPanel>
    );
  }

  if (!file) {
    return (
      <ToolSurface>
        <Dropzone
          onFiles={add}
          accept="application/pdf"
          label="Drop a watermarked PDF here, or click to choose one"
          hint="Scanned in this tab. Nothing is uploaded."
          disabled={isReading}
        />
        <ErrorMessage>{error}</ErrorMessage>
      </ToolSurface>
    );
  }

  const findings = scan?.findings ?? [];
  const confident = findings.filter((f) => f.confidence !== 'low');
  const uncertain = findings.filter((f) => f.confidence === 'low');

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <ToolSurface>
        <StampPreview
          bytes={file.bytes}
          pageIndex={Math.min(previewPage, file.pageCount - 1)}
          pageCount={file.pageCount}
          apply={applyToPreview}
          onPageChange={setPreviewPage}
        />
      </ToolSurface>

      <ToolSurface className="flex flex-col gap-5">
        <ToolSectionHeading>What the scan found</ToolSectionHeading>

        {isScanning ? (
          <p className="text-sm text-muted">Reading the document&rsquo;s objects…</p>
        ) : findings.length === 0 ? (
          <NothingFound rasterized={scan?.looksRasterized ?? false} />
        ) : (
          <>
            {confident.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {confident.map((finding) => (
                  <FindingRow
                    key={finding.id}
                    finding={finding}
                    checked={selected.has(finding.id)}
                    onToggle={() => toggle(finding.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                Nothing here looks obviously like a watermark. The repeated content below might be
                one — or might be a running header your document is supposed to have.
              </p>
            )}

            {uncertain.length > 0 ? (
              <details className="rounded-xl border border-line">
                <summary className="cursor-pointer px-3.5 py-2.5 text-sm font-medium">
                  {uncertain.length} more repeated {uncertain.length === 1 ? 'thing' : 'things'} —
                  probably real content
                </summary>
                <ul className="flex flex-col gap-2 border-t border-line p-3">
                  {uncertain.map((finding) => (
                    <FindingRow
                      key={finding.id}
                      finding={finding}
                      checked={selected.has(finding.id)}
                      onToggle={() => toggle(finding.id)}
                    />
                  ))}
                </ul>
              </details>
            ) : null}

            <p className="text-xs text-muted">
              Tick something and the preview updates. Nothing is written to a file until you press
              the button.
            </p>
          </>
        )}

        <ErrorMessage>{error}</ErrorMessage>

        <Button onClick={save} disabled={isSaving || selected.size === 0} size="lg">
          {isSaving
            ? 'Rewriting…'
            : selected.size === 0
              ? 'Select something to remove'
              : `Remove ${selected.size} ${selected.size === 1 ? 'item' : 'items'}`}
        </Button>
        <Button variant="ghost" onClick={reset}>
          Choose a different PDF
        </Button>
      </ToolSurface>
    </div>
  );
}

function FindingRow({
  finding,
  checked,
  onToggle,
}: {
  finding: Finding;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      {/* The card itself is the checkbox, so the whole row is the hit target
          and the selected styling lives on the same element as the state. */}
      <ArkCheckbox.Root
        checked={checked}
        onCheckedChange={onToggle}
        className={`flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${
          checked ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'
        }`}
      >
        <ArkCheckbox.Control
          className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors ${
            checked ? 'border-accent bg-accent text-accent-contrast' : 'border-line-strong bg-surface'
          }`}
        >
          <ArkCheckbox.Indicator>
            <Icon name="check" size={13} />
          </ArkCheckbox.Indicator>
        </ArkCheckbox.Control>
        <ArkCheckbox.HiddenInput />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{finding.label}</span>
            <span className="rounded-full border border-line bg-sunken px-2 py-0.5 text-[11px] text-muted">
              {KIND_LABEL[finding.kind]}
            </span>
          </span>
          <span className="mt-1 block text-xs text-muted">{finding.detail}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {CONFIDENCE_LABEL[finding.confidence]}
          </span>
        </span>
      </ArkCheckbox.Root>
    </li>
  );
}

/**
 * The honest answer when there is nothing to delete, which is a real and common
 * outcome. Pretending otherwise — or quietly doing nothing — is how these tools
 * usually waste people's time.
 */
function NothingFound({ rasterized }: { rasterized: boolean }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-sunken p-4">
      <p className="text-sm">
        {rasterized
          ? 'These pages have no text layer at all — they are images, most likely scans or a document that was flattened.'
          : 'No separate watermark object is in this file.'}
      </p>
      <p className="text-sm text-muted">
        That means the mark is not a removable object: it was baked into the page picture before you
        got the file. Nothing can delete it cleanly, because there is no longer anything to delete —
        the only honest options are to paint over it or to leave it.
      </p>
      <p className="text-sm text-muted">
        To paint it out: turn the pages into images with{' '}
        <Link href="/pdf/to-images" className="text-accent underline underline-offset-2">
          PDF to images
        </Link>
        , erase the mark with the{' '}
        <Link href="/image/remove-watermark" className="text-accent underline underline-offset-2">
          image watermark remover
        </Link>
        , then rebuild the document with{' '}
        <Link href="/pdf/images-to-pdf" className="text-accent underline underline-offset-2">
          images to PDF
        </Link>
        . The text becomes part of the picture that way, so only do it if you have to.
      </p>
    </div>
  );
}
