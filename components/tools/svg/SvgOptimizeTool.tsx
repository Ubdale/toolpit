'use client';

import { useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RangeInput } from '@/components/ui/Field';
import { downloadBlob } from '@/lib/download';
import { formatBytes, stripExtension } from '@/lib/format';
import {
  byteLength,
  defaultOptimizeSettings,
  looksLikeSvg,
  optimizeSvg,
  type OptimizeResult,
  type OptimizeSettings,
} from '@/lib/svg/optimize';

export default function SvgOptimizeTool() {
  const [source, setSource] = useState('');
  const [filename, setFilename] = useState('icon');
  const [settings, setSettings] = useState<OptimizeSettings>(defaultOptimizeSettings);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  function update<K extends keyof OptimizeSettings>(key: K, value: OptimizeSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  async function addFile(files: File[]) {
    const file = files[0];
    if (!file) return;
    setError(null);
    setResult(null);
    const text = await file.text();
    if (!looksLikeSvg(text)) {
      setError(`${file.name} does not look like an SVG.`);
      return;
    }
    setFilename(stripExtension(file.name));
    setSource(text);
  }

  async function run() {
    setError(null);
    setIsRunning(true);
    try {
      if (!looksLikeSvg(source)) throw new Error('That does not look like SVG markup.');
      setResult(await optimizeSvg(source, settings));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Could not optimize this SVG: ${cause.message}`
          : 'Could not optimize this SVG.',
      );
    } finally {
      setIsRunning(false);
    }
  }

  function reset() {
    setSource('');
    setResult(null);
    setError(null);
    setFilename('icon');
  }

  const saved = result ? result.originalBytes - result.optimizedBytes : 0;
  const percent = result && result.originalBytes > 0
    ? Math.round((saved / result.originalBytes) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <ToolSurface className="flex flex-col gap-6">
        <Dropzone
          onFiles={addFile}
          accept="image/svg+xml,.svg"
          label={source ? 'Replace the SVG' : 'Add an SVG'}
          hint="Or paste the markup below. Either way it is read into this tab only."
        />

        <Field label="SVG markup" hint={source ? `${formatBytes(byteLength(source))} in` : undefined}>
          {({ id, describedBy }) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              value={source}
              spellCheck={false}
              onChange={(event) => {
                setSource(event.target.value);
                setResult(null);
              }}
              placeholder={'<svg xmlns="http://www.w3.org/2000/svg" …>'}
              className="h-44 w-full resize-y rounded-xl border border-line bg-surface p-3 font-mono text-xs leading-relaxed hover:border-line-strong focus:border-accent"
            />
          )}
        </Field>

        <ErrorMessage>{error}</ErrorMessage>

        <div className="flex flex-col gap-4">
          <ToolSectionHeading>Options</ToolSectionHeading>

          <Field
            label={`Coordinate precision: ${settings.precision} decimal place${settings.precision === 1 ? '' : 's'}`}
            hint="Fewer decimals means smaller paths. Drop too far and curves start to visibly shift."
          >
            {({ id, describedBy }) => (
              <RangeInput
                id={id}
                aria-describedby={describedBy}
                min={0}
                max={5}
                step={1}
                value={settings.precision}
                onChange={(event) => update('precision', Number(event.target.value))}
              />
            )}
          </Field>

          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle
              label="Multipass"
              hint="Repeat until it stops shrinking."
              checked={settings.multipass}
              onChange={(value) => update('multipass', value)}
            />
            <Toggle
              label="Pretty output"
              hint="Keep it indented instead of minified."
              checked={settings.prettify}
              onChange={(value) => update('prettify', value)}
            />
            <Toggle
              label="Remove IDs"
              hint="Unsafe if CSS or JS targets them."
              checked={settings.removeIds}
              onChange={(value) => update('removeIds', value)}
            />
            <Toggle
              label="Remove width/height"
              hint="Lets the SVG scale to its container."
              checked={settings.removeDimensions}
              onChange={(value) => update('removeDimensions', value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button size="lg" onClick={run} disabled={!source.trim() || isRunning}>
            {isRunning ? 'Optimizing…' : 'Optimize SVG'}
          </Button>
          {source ? (
            <Button variant="ghost" onClick={reset} disabled={isRunning}>
              Clear
            </Button>
          ) : null}
        </div>
      </ToolSurface>

      {result ? (
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
                {saved > 0 ? `${percent}% smaller` : 'Already minimal'}
              </p>
              <p className="text-sm text-muted">
                {formatBytes(result.originalBytes)} → {formatBytes(result.optimizedBytes)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  downloadBlob(
                    new Blob([result.svg], { type: 'image/svg+xml' }),
                    `${filename}.min.svg`,
                  )
                }
              >
                Download
              </Button>
              <CopyButton text={result.svg} label="Copy SVG" />
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Preview title="Before" svg={source} />
            <Preview title="After" svg={result.svg} />
          </div>

          <label className="mt-5 block">
            <span className="text-sm font-medium">Optimized markup</span>
            <textarea
              readOnly
              value={result.svg}
              spellCheck={false}
              className="mt-1.5 h-40 w-full resize-y rounded-xl border border-line bg-surface p-3 font-mono text-xs leading-relaxed"
            />
          </label>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Renders the markup in an <img> via a data URL rather than injecting it into
 * the DOM: an uploaded SVG is untrusted markup and could carry a script.
 */
function Preview({ title, svg }: { title: string; svg: string }) {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return (
    <figure className="rounded-xl border border-line bg-surface p-3">
      <figcaption className="mb-2 text-xs font-medium text-muted">{title}</figcaption>
      <div className="grid h-40 place-items-center overflow-hidden rounded-lg bg-sunken">
        {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL */}
        <img src={src} alt={`${title} optimization`} className="max-h-full max-w-full" />
      </div>
    </figure>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-accent"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}
