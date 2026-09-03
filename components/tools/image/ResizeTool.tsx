'use client';

import { useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RadioCards, RangeInput, Select, TextInput } from '@/components/ui/Field';
import { FileList } from '@/components/ui/FileList';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { stripExtension } from '@/lib/format';
import {
  extensionFor,
  fitModes,
  imageFormats,
  resizeImage,
  type FitMode,
  type ImageFormat,
} from '@/lib/image/transform';

import { BatchResultPanel, type BatchOutput } from './BatchResultPanel';
import { IMAGE_ACCEPT, useImageFiles } from './useImageFiles';

type Target = 'width' | 'height' | 'both' | 'percent';

export default function ResizeTool() {
  const { files, error, setError, isReading, add, remove, clear } = useImageFiles(true);

  const [target, setTarget] = useState<Target>('width');
  const [width, setWidth] = useState('1600');
  const [height, setHeight] = useState('1200');
  const [percent, setPercent] = useState(50);
  const [fit, setFit] = useState<FitMode>('contain');
  const [format, setFormat] = useState<ImageFormat | 'keep'>('keep');
  const [quality, setQuality] = useState(0.86);
  const [noUpscale, setNoUpscale] = useState(true);
  const [background, setBackground] = useState('#ffffff');

  const [progress, setProgress] = useState<number | null>(null);
  const [outputs, setOutputs] = useState<BatchOutput[] | null>(null);

  const first = files[0];

  function formatFor(file: File): ImageFormat {
    if (format !== 'keep') return format;
    const type = file.type as ImageFormat;
    return imageFormats.some((entry) => entry.value === type) ? type : 'image/png';
  }

  async function run() {
    if (files.length === 0) return;
    setError(null);
    setProgress(0);

    const results: BatchOutput[] = [];
    const failed: string[] = [];

    for (const [index, entry] of files.entries()) {
      try {
        const outputFormat = formatFor(entry.file);

        // Percent is resolved per file, so a mixed batch scales each image by
        // the same proportion rather than to one shared size.
        const targetWidth =
          target === 'percent'
            ? Math.round((entry.width * percent) / 100)
            : target === 'height'
              ? null
              : Number(width) || null;
        const targetHeight =
          target === 'percent'
            ? Math.round((entry.height * percent) / 100)
            : target === 'width'
              ? null
              : Number(height) || null;

        const result = await resizeImage(entry.file, {
          width: targetWidth,
          height: targetHeight,
          keepRatio: target !== 'both',
          fit,
          format: outputFormat,
          quality,
          background,
          noUpscale,
        });

        results.push({
          id: entry.id,
          name: `${stripExtension(entry.name)}-${result.width}x${result.height}.${extensionFor(outputFormat)}`,
          blob: result.blob,
          originalSize: entry.size,
          detail: `${entry.width}×${entry.height} → ${result.width}×${result.height}`,
        });
      } catch (cause) {
        failed.push(entry.name);
        void cause;
      }
      setProgress((index + 1) / files.length);
    }

    setProgress(null);

    if (results.length === 0) {
      setError('None of those images could be resized.');
      return;
    }
    if (failed.length > 0) {
      setError(`${failed.length} image${failed.length === 1 ? '' : 's'} could not be resized.`);
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
        zipName="toolpit-resized-images.zip"
        onReset={reset}
        note="Every image was resized by your own browser. None of them were uploaded."
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
          hint="JPG, PNG, WebP, AVIF, GIF or BMP. Add as many as you like — there is no limit."
          disabled={isReading}
        />

        {files.length > 0 ? (
          <>
            <ToolSectionHeading>
              {files.length} image{files.length === 1 ? '' : 's'}
            </ToolSectionHeading>
            <FileList
              label="Images to resize"
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
        {progress !== null ? <ProgressBar value={progress} label="Resizing" /> : null}
      </ToolSurface>

      <ToolSurface className="flex flex-col gap-5">
        <ToolSectionHeading>Size</ToolSectionHeading>

        <RadioCards
          name="target"
          legend="Resize by"
          value={target}
          onChange={setTarget}
          options={[
            { value: 'width', label: 'Width', description: 'Height follows the ratio.' },
            { value: 'height', label: 'Height', description: 'Width follows the ratio.' },
            { value: 'both', label: 'Exact box', description: 'Both edges, with a fit rule.' },
            { value: 'percent', label: 'Percentage', description: 'Scale each image the same.' },
          ]}
        />

        {target === 'percent' ? (
          <Field
            label={`Scale — ${percent}%`}
            hint={first ? `${first.name} becomes about ${Math.round((first.width * percent) / 100)} × ${Math.round((first.height * percent) / 100)}.` : undefined}
          >
            {({ id }) => (
              <RangeInput
                id={id}
                min={5}
                max={200}
                step={5}
                value={percent}
                onChange={(event) => setPercent(Number(event.target.value))}
              />
            )}
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {target !== 'height' ? (
              <Field label="Width (px)">
                {({ id }) => (
                  <TextInput
                    id={id}
                    inputMode="numeric"
                    value={width}
                    onChange={(event) => setWidth(event.target.value.replace(/\D/g, ''))}
                  />
                )}
              </Field>
            ) : null}
            {target !== 'width' ? (
              <Field label="Height (px)">
                {({ id }) => (
                  <TextInput
                    id={id}
                    inputMode="numeric"
                    value={height}
                    onChange={(event) => setHeight(event.target.value.replace(/\D/g, ''))}
                  />
                )}
              </Field>
            ) : null}
          </div>
        )}

        {target === 'both' ? (
          <Field label="When the ratio does not match">
            {({ id }) => (
              <Select
                id={id}
                value={fit}
                onChange={(event) => setFit(event.target.value as FitMode)}
              >
                {fitModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label} — {mode.description}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={noUpscale}
            onChange={(event) => setNoUpscale(event.target.checked)}
            className="mt-0.5 size-4 accent-accent"
          />
          <span>
            Never enlarge
            <span className="mt-0.5 block text-xs text-muted">
              Blowing a small image up adds pixels without adding detail.
            </span>
          </span>
        </label>

        <div className="border-t border-line pt-4">
          <Field label="Output format">
            {({ id }) => (
              <Select
                id={id}
                value={format}
                onChange={(event) => setFormat(event.target.value as ImageFormat | 'keep')}
              >
                <option value="keep">Keep each file&rsquo;s format</option>
                {imageFormats.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {format !== 'image/png' ? (
          <Field label={`Quality — ${Math.round(quality * 100)}%`}>
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

        {target === 'both' && fit === 'contain' ? (
          <Field label="Padding colour" hint="Fills the space when the ratios differ.">
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

        <Button onClick={run} disabled={files.length === 0 || progress !== null} size="lg">
          {progress !== null
            ? 'Resizing…'
            : `Resize ${files.length || ''} image${files.length === 1 ? '' : 's'}`.trim()}
        </Button>
      </ToolSurface>
    </div>
  );
}
