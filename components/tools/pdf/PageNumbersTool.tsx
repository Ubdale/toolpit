'use client';

import { useCallback, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RangeInput, Select, TextInput } from '@/components/ui/Field';
import { ResultPanel } from '@/components/ui/ResultPanel';
import { parsePageRanges, stripExtension } from '@/lib/format';
import { toPdfBlob } from '@/lib/pdf/operations';
import {
  addPageNumbers,
  corners,
  defaultPageNumberOptions,
  numberFormats,
  type Corner,
  type NumberFormat,
  type PageNumberOptions,
} from '@/lib/pdf/stamp';

import { StampPreview } from './StampPreview';
import { usePdfFiles } from './usePdfFiles';

export default function PageNumbersTool() {
  const { files, error, setError, isReading, add, clear } = usePdfFiles(false);
  const file = files[0];

  const [options, setOptions] = useState<PageNumberOptions>(defaultPageNumberOptions);
  const [rangeText, setRangeText] = useState('');
  const [previewPage, setPreviewPage] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<Blob | null>(null);

  function update<K extends keyof PageNumberOptions>(key: K, value: PageNumberOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  /** The single page in the preview stands in for whatever page is on screen. */
  const applyToPreview = useCallback(
    async (single: Uint8Array) =>
      addPageNumbers(single, {
        ...options,
        pageIndices: [],
        startAt: options.startAt + previewPage,
      }),
    [options, previewPage],
  );

  function resolvePages(): number[] {
    if (!rangeText.trim() || !file) return [];
    return parsePageRanges(rangeText, file.pageCount);
  }

  async function save() {
    if (!file) return;
    setError(null);
    setIsSaving(true);
    try {
      const bytes = await addPageNumbers(file.bytes, { ...options, pageIndices: resolvePages() });
      setResult(toPdfBlob(bytes));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add page numbers.');
    } finally {
      setIsSaving(false);
    }
  }

  function reset() {
    clear();
    setResult(null);
    setPreviewPage(0);
    setRangeText('');
  }

  if (result && file) {
    const filename = `${stripExtension(file.name)}-numbered.pdf`;
    return (
      <ResultPanel
        filename={filename}
        size={result.size}
        detail={`${file.pageCount} page${file.pageCount === 1 ? '' : 's'}`}
        target={{ blob: result, filename }}
        onReset={reset}
      />
    );
  }

  if (!file) {
    return (
      <ToolSurface>
        <Dropzone
          onFiles={add}
          accept="application/pdf"
          label="Drop a PDF here, or click to choose one"
          hint="Your document is opened in this tab and never uploaded."
          disabled={isReading}
        />
        <ErrorMessage>{error}</ErrorMessage>
      </ToolSurface>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
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
        <ToolSectionHeading>Numbering</ToolSectionHeading>

        <Field label="Format">
          {({ id }) => (
            <Select
              id={id}
              value={options.format}
              onChange={(event) => update('format', event.target.value as NumberFormat)}
            >
              {numberFormats.map((format) => (
                <option key={format.value} value={format.value}>
                  {format.label} — {format.example}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Position">
          {({ id }) => (
            <Select
              id={id}
              value={options.position}
              onChange={(event) => update('position', event.target.value as Corner)}
            >
              {corners.map((corner) => (
                <option key={corner.value} value={corner.value}>
                  {corner.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start at" hint="The number printed on the first numbered page.">
            {({ id }) => (
              <TextInput
                id={id}
                inputMode="numeric"
                value={String(options.startAt)}
                onChange={(event) => {
                  const value = Number(event.target.value.replace(/\D/g, ''));
                  update('startAt', Number.isFinite(value) && value > 0 ? value : 1);
                }}
              />
            )}
          </Field>

          <Field label="Prefix" hint="Optional, e.g. a document reference.">
            {({ id }) => (
              <TextInput
                id={id}
                value={options.prefix}
                maxLength={30}
                placeholder="ACME-2026"
                onChange={(event) => update('prefix', event.target.value)}
              />
            )}
          </Field>
        </div>

        <Field
          label="Pages to number"
          hint={`Leave blank for every page. Ranges like "2-" skip a cover. This PDF has ${file.pageCount}.`}
        >
          {({ id }) => (
            <TextInput
              id={id}
              value={rangeText}
              placeholder="e.g. 2-"
              onChange={(event) => setRangeText(event.target.value)}
            />
          )}
        </Field>

        <Field label={`Text size — ${options.fontSize}pt`}>
          {({ id }) => (
            <RangeInput
              id={id}
              min={6}
              max={20}
              step={1}
              value={options.fontSize}
              onChange={(event) => update('fontSize', Number(event.target.value))}
            />
          )}
        </Field>

        <Field label={`Margin — ${options.margin}pt from the edge`}>
          {({ id }) => (
            <RangeInput
              id={id}
              min={12}
              max={72}
              step={2}
              value={options.margin}
              onChange={(event) => update('margin', Number(event.target.value))}
            />
          )}
        </Field>

        <Field label="Colour">
          {({ id }) => (
            <input
              id={id}
              type="color"
              value={options.color}
              onChange={(event) => update('color', event.target.value)}
              className="h-11 w-16 cursor-pointer rounded-xl border border-line bg-surface p-1"
            />
          )}
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <Button onClick={save} disabled={isSaving} size="lg">
          {isSaving ? 'Numbering…' : 'Add page numbers'}
        </Button>
        <Button variant="ghost" onClick={reset}>
          Choose a different PDF
        </Button>
      </ToolSurface>
    </div>
  );
}
