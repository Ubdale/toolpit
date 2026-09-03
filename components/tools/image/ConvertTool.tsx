'use client';

import { useEffect, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RangeInput, TextInput } from '@/components/ui/Field';
import { FileList } from '@/components/ui/FileList';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { stripExtension } from '@/lib/format';
import {
  canEncode,
  convertImage,
  extensionFor,
  hasAlpha,
  imageFormats,
  type ImageFormat,
} from '@/lib/image/transform';

import { BatchResultPanel, type BatchOutput } from './BatchResultPanel';
import { IMAGE_ACCEPT, useImageFiles } from './useImageFiles';

export default function ConvertTool() {
  const { files, error, setError, isReading, add, remove, clear } = useImageFiles(true);

  const [format, setFormat] = useState<ImageFormat>('image/webp');
  const [quality, setQuality] = useState(0.85);
  const [background, setBackground] = useState('#ffffff');
  const [limitEdge, setLimitEdge] = useState(false);
  const [maxEdge, setMaxEdge] = useState('2000');

  const [supported, setSupported] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [outputs, setOutputs] = useState<BatchOutput[] | null>(null);

  // Encoder support is per browser, so the list is checked rather than assumed —
  // an unsupported type silently produces a PNG with the wrong extension.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      imageFormats.map(async (entry) => [entry.value, await canEncode(entry.value)] as const),
    ).then((entries) => {
      if (!cancelled) setSupported(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const lossy = imageFormats.find((entry) => entry.value === format)?.lossy ?? true;
  const anyTransparent = files.some((entry) => /\.(png|webp|avif|gif)$/i.test(entry.name));

  async function run() {
    if (files.length === 0) return;
    setError(null);
    setProgress(0);

    const results: BatchOutput[] = [];
    const failed: string[] = [];

    for (const [index, entry] of files.entries()) {
      try {
        const result = await convertImage(entry.file, {
          format,
          quality,
          background: hasAlpha(format) ? 'transparent' : background,
          maxEdge: limitEdge ? Number(maxEdge) || null : null,
        });

        results.push({
          id: entry.id,
          name: `${stripExtension(entry.name)}.${extensionFor(format)}`,
          blob: result.blob,
          originalSize: entry.size,
          detail: `${result.width}×${result.height}`,
        });
      } catch {
        failed.push(entry.name);
      }
      setProgress((index + 1) / files.length);
    }

    setProgress(null);

    if (results.length === 0) {
      setError('None of those images could be converted.');
      return;
    }
    if (failed.length > 0) {
      setError(`${failed.length} image${failed.length === 1 ? '' : 's'} could not be converted.`);
    }
    setOutputs(results);
  }

  function reset() {
    clear();
    setOutputs(null);
    setError(null);
  }

  if (outputs) {
    return (
      <BatchResultPanel
        outputs={outputs}
        zipName="toolpit-converted-images.zip"
        onReset={reset}
        note="Encoded by your own browser — nothing was uploaded to convert it."
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <ToolSurface className="flex flex-col gap-5">
        <Dropzone
          onFiles={add}
          accept={IMAGE_ACCEPT}
          multiple
          label="Drop images here, or click to choose them"
          hint="JPG, PNG, WebP, AVIF, GIF or BMP in — any of the four formats out."
          disabled={isReading}
        />

        {files.length > 0 ? (
          <>
            <ToolSectionHeading>
              {files.length} image{files.length === 1 ? '' : 's'}
            </ToolSectionHeading>
            <FileList
              label="Images to convert"
              files={files.map((entry) => ({
                id: entry.id,
                name: entry.name,
                size: entry.size,
                detail: `${entry.width} × ${entry.height}`,
              }))}
              onRemove={remove}
            />
          </>
        ) : null}

        <ErrorMessage>{error}</ErrorMessage>
        {progress !== null ? <ProgressBar value={progress} label="Converting" /> : null}
      </ToolSurface>

      <ToolSurface className="flex flex-col gap-5">
        <ToolSectionHeading>Convert to</ToolSectionHeading>

        <Dropdown
          label="Format"
          value={format}
          onChange={(value) => value && setFormat(value as ImageFormat)}
          options={imageFormats.map((entry) => ({
            value: entry.value,
            label: entry.label,
            disabled: supported[entry.value] === false,
            description:
              supported[entry.value] === false ? 'Not supported by this browser' : undefined,
          }))}
        />

        {lossy ? (
          <Field
            label={`Quality — ${Math.round(quality * 100)}%`}
            hint="Around 80% is where most people stop being able to tell."
          >
            {({ id }) => (
              <RangeInput
                id={id}
                min={30}
                max={100}
                step={1}
                value={quality * 100}
                onChange={(event) => setQuality(Number(event.target.value) / 100)}
              />
            )}
          </Field>
        ) : null}

        {!hasAlpha(format) && anyTransparent ? (
          <Field
            label="Background for transparent areas"
            hint="JPG has no transparency, so see-through pixels need a colour behind them."
          >
            {({ id }) => (
              <input
                id={id}
                type="color"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
                className="h-11 w-16 cursor-pointer rounded-xl border border-line bg-surface p-1"
              />
            )}
          </Field>
        ) : null}

        <div className="border-t border-line pt-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={limitEdge}
              onChange={(event) => setLimitEdge(event.target.checked)}
              className="mt-0.5 size-4 accent-accent"
            />
            <span>
              Also cap the longest edge
              <span className="mt-0.5 block text-xs text-muted">
                Converting and shrinking in one pass, for the web.
              </span>
            </span>
          </label>
        </div>

        {limitEdge ? (
          <Field label="Longest edge (px)">
            {({ id }) => (
              <TextInput
                id={id}
                inputMode="numeric"
                value={maxEdge}
                onChange={(event) => setMaxEdge(event.target.value.replace(/\D/g, ''))}
              />
            )}
          </Field>
        ) : null}

        <Button onClick={run} disabled={files.length === 0 || progress !== null} size="lg">
          {progress !== null
            ? 'Converting…'
            : `Convert ${files.length || ''} image${files.length === 1 ? '' : 's'}`.trim()}
        </Button>
      </ToolSurface>
    </div>
  );
}
