'use client';

import { useCallback, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RadioCards, RangeInput, TextInput } from '@/components/ui/Field';
import { ResultPanel } from '@/components/ui/ResultPanel';
import { stripExtension } from '@/lib/format';
import { toPdfBlob } from '@/lib/pdf/operations';
import {
  addWatermark,
  defaultWatermarkOptions,
  type WatermarkOptions,
  type WatermarkPlacement,
} from '@/lib/pdf/stamp';

import { StampPreview } from './StampPreview';
import { usePdfFiles } from './usePdfFiles';

const PRESETS = ['CONFIDENTIAL', 'DRAFT', 'COPY', 'DO NOT COPY', 'SAMPLE'];

export default function WatermarkTool() {
  const { files, error, setError, isReading, add, clear } = usePdfFiles(false);
  const file = files[0];

  const [options, setOptions] = useState<WatermarkOptions>(defaultWatermarkOptions);
  const [imageName, setImageName] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; substitutions: number } | null>(null);

  function update<K extends keyof WatermarkOptions>(key: K, value: WatermarkOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  // The preview calls this with a one-page document, so the options it renders
  // are the same object the download uses. Memoised on the values it reads so
  // the preview re-renders when they change and not on every keystroke elsewhere.
  const applyToPreview = useCallback(
    async (single: Uint8Array) => {
      const { bytes } = await addWatermark(single, { ...options, pageIndices: [] });
      return bytes;
    },
    [options],
  );

  async function chooseImage(incoming: File[]) {
    const image = incoming[0];
    if (!image) return;

    const isPng = image.type === 'image/png' || /\.png$/i.test(image.name);
    const isJpg = image.type === 'image/jpeg' || /\.jpe?g$/i.test(image.name);
    if (!isPng && !isJpg) {
      setError('Watermark images have to be a PNG or a JPG.');
      return;
    }

    setError(null);
    update('image', { bytes: new Uint8Array(await image.arrayBuffer()), isPng });
    setImageName(image.name);
  }

  async function save() {
    if (!file) return;
    setError(null);
    setIsSaving(true);
    try {
      const { bytes, substitutions } = await addWatermark(file.bytes, options);
      setResult({ blob: toPdfBlob(bytes), substitutions });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not watermark the PDF.');
    } finally {
      setIsSaving(false);
    }
  }

  function reset() {
    clear();
    setResult(null);
    setPreviewPage(0);
  }

  if (result && file) {
    const filename = `${stripExtension(file.name)}-watermarked.pdf`;
    return (
      <ResultPanel
        filename={filename}
        size={result.blob.size}
        detail={`${file.pageCount} page${file.pageCount === 1 ? '' : 's'} stamped`}
        target={{ blob: result.blob, filename }}
        onReset={reset}
      >
        {result.substitutions > 0 ? (
          <p className="text-sm text-muted">
            {result.substitutions} character{result.substitutions === 1 ? '' : 's'} in your
            watermark text had to be approximated to fit the PDF font.
          </p>
        ) : null}
      </ResultPanel>
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
        <ToolSectionHeading>Watermark</ToolSectionHeading>

        {options.image ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-sunken px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm" title={imageName ?? undefined}>
              {imageName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                update('image', null);
                setImageName(null);
              }}
            >
              Use text
            </Button>
          </div>
        ) : (
          <>
            <Field label="Watermark text">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={options.text}
                  maxLength={60}
                  onChange={(event) => update('text', event.target.value)}
                />
              )}
            </Field>

            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => update('text', preset)}
                  className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-text"
                >
                  {preset}
                </button>
              ))}
            </div>
          </>
        )}

        <RadioCards
          name="placement"
          legend="Placement"
          value={options.placement}
          onChange={(value) => update('placement', value as WatermarkPlacement)}
          options={[
            { value: 'diagonal', label: 'Diagonal', description: 'Across the middle at an angle.' },
            { value: 'center', label: 'Centred', description: 'Level, in the middle of the page.' },
            { value: 'tile', label: 'Tiled', description: 'Repeated across the whole page.' },
          ]}
        />

        {!options.image ? (
          <Field label={`Size — ${Math.round(options.fontSize)}pt`}>
            {({ id }) => (
              <RangeInput
                id={id}
                min={12}
                max={140}
                step={2}
                value={options.fontSize}
                onChange={(event) => update('fontSize', Number(event.target.value))}
              />
            )}
          </Field>
        ) : (
          <Field label={`Logo width — ${Math.round(options.imageScale * 100)}% of the page`}>
            {({ id }) => (
              <RangeInput
                id={id}
                min={10}
                max={100}
                step={5}
                value={options.imageScale * 100}
                onChange={(event) => update('imageScale', Number(event.target.value) / 100)}
              />
            )}
          </Field>
        )}

        <Field
          label={`Opacity — ${Math.round(options.opacity * 100)}%`}
          hint="Low enough to read the page through, high enough to see it on a photocopy."
        >
          {({ id }) => (
            <RangeInput
              id={id}
              min={5}
              max={100}
              step={5}
              value={options.opacity * 100}
              onChange={(event) => update('opacity', Number(event.target.value) / 100)}
            />
          )}
        </Field>

        {options.placement === 'diagonal' ? (
          <Field label={`Angle — ${options.rotation}°`}>
            {({ id }) => (
              <RangeInput
                id={id}
                min={0}
                max={90}
                step={5}
                value={options.rotation}
                onChange={(event) => update('rotation', Number(event.target.value))}
              />
            )}
          </Field>
        ) : null}

        {!options.image ? (
          <Field label="Colour">
            {({ id }) => (
              <div className="flex items-center gap-3">
                <input
                  id={id}
                  type="color"
                  value={options.color}
                  onChange={(event) => update('color', event.target.value)}
                  className="h-11 w-16 cursor-pointer rounded-xl border border-line bg-surface p-1"
                />
                <Dropdown
                  className="flex-1"
                  placeholder="Pick a preset…"
                  value={null}
                  onChange={(value) => value && update('color', value)}
                  options={[
                    { value: '#d1541f', label: 'Ember', icon: <Swatch color="#d1541f" /> },
                    { value: '#b4291f', label: 'Red', icon: <Swatch color="#b4291f" /> },
                    { value: '#6a6355', label: 'Grey', icon: <Swatch color="#6a6355" /> },
                    { value: '#191712', label: 'Black', icon: <Swatch color="#191712" /> },
                    { value: '#2a78d6', label: 'Blue', icon: <Swatch color="#2a78d6" /> },
                  ]}
                />
              </div>
            )}
          </Field>
        ) : null}

        <div className="border-t border-line pt-4">
          <Dropzone
            onFiles={chooseImage}
            accept="image/png,image/jpeg"
            label={options.image ? 'Replace the logo' : 'Or stamp a logo instead'}
            hint="PNG or JPG. A PNG with transparency looks best."
          />
        </div>

        <ErrorMessage>{error}</ErrorMessage>

        <Button onClick={save} disabled={isSaving} size="lg">
          {isSaving ? 'Stamping…' : 'Apply watermark'}
        </Button>
        <Button variant="ghost" onClick={reset}>
          Choose a different PDF
        </Button>
      </ToolSurface>
    </div>
  );
}

/** The colour chip beside a preset name in the dropdown. */
function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="block size-3.5 rounded-full border border-line"
      style={{ background: color }}
    />
  );
}
