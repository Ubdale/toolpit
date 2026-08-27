'use client';

import { useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RangeInput } from '@/components/ui/Field';
import { createZip, downloadBlob, type ZipEntry } from '@/lib/download';
import {
  buildIco,
  defaultFaviconSettings,
  generateIcons,
  headSnippet,
  loadSourceImage,
  manifestJson,
  type FaviconSettings,
  type GeneratedIcon,
} from '@/lib/favicon';
import { formatBytes } from '@/lib/format';

const ACCEPTED = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
];

const BACKGROUNDS = [
  { value: 'transparent', label: 'Transparent' },
  { value: '#ffffff', label: 'White' },
  { value: '#000000', label: 'Black' },
];

type Output = { icons: GeneratedIcon[]; ico: Blob; zip: Blob; previews: string[] };

export default function FaviconTool() {
  const [file, setFile] = useState<File | null>(null);
  const [settings, setSettings] = useState<FaviconSettings>(defaultFaviconSettings);
  const [custom, setCustom] = useState('#d1541f');
  const [output, setOutput] = useState<Output | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  function addFile(files: File[]) {
    const picked = files[0];
    if (!picked) return;
    if (!ACCEPTED.includes(picked.type) && !/\.svg$/i.test(picked.name)) {
      setError(`${picked.name} was skipped — use a PNG, JPG, WebP, GIF or SVG.`);
      return;
    }
    setError(null);
    releaseOutput();
    setFile(picked);
  }

  function releaseOutput() {
    if (output) for (const url of output.previews) URL.revokeObjectURL(url);
    setOutput(null);
  }

  async function run() {
    if (!file) return;
    setError(null);
    setIsRunning(true);
    releaseOutput();

    let source;
    try {
      source = await loadSourceImage(file);
      const icons = await generateIcons(source, settings);
      const ico = await buildIco(icons);

      const entries: ZipEntry[] = [];
      for (const icon of icons) {
        entries.push({
          name: icon.filename,
          data: new Uint8Array(await icon.blob.arrayBuffer()),
        });
      }
      entries.push({ name: 'favicon.ico', data: new Uint8Array(await ico.arrayBuffer()) });

      const encoder = new TextEncoder();
      entries.push({ name: 'site.webmanifest', data: encoder.encode(manifestJson(settings.background)) });
      entries.push({ name: 'head-snippet.html', data: encoder.encode(headSnippet()) });

      setOutput({
        icons,
        ico,
        zip: createZip(entries),
        previews: icons.map((icon) => URL.createObjectURL(icon.blob)),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate the favicon set.');
    } finally {
      source?.release();
      setIsRunning(false);
    }
  }

  function reset() {
    releaseOutput();
    setFile(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <ToolSurface className="flex flex-col gap-6">
        {!file ? (
          <Dropzone
            onFiles={addFile}
            accept={ACCEPTED.join(',')}
            label="Add your logo or icon"
            hint="A square source at 512px or larger gives the sharpest result. SVG works too."
          />
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-sm text-muted">{formatBytes(file.size)}</p>
            </div>
            <Button variant="ghost" onClick={reset} disabled={isRunning}>
              Clear
            </Button>
          </div>
        )}

        <ErrorMessage>{error}</ErrorMessage>

        {file ? (
          <>
            <div className="flex flex-col gap-4">
              <ToolSectionHeading>Appearance</ToolSectionHeading>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">Background</legend>
                <div className="flex flex-wrap gap-2">
                  {BACKGROUNDS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={settings.background === option.value}
                      onClick={() => setSettings((c) => ({ ...c, background: option.value }))}
                      className={`rounded-xl border px-3.5 py-2 text-sm transition-colors ${
                        settings.background === option.value
                          ? 'border-accent bg-accent-soft font-medium'
                          : 'border-line bg-surface hover:border-line-strong'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                  <label
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      settings.background === custom
                        ? 'border-accent bg-accent-soft font-medium'
                        : 'border-line bg-surface'
                    }`}
                  >
                    <input
                      type="color"
                      value={custom}
                      aria-label="Custom background colour"
                      onChange={(event) => {
                        setCustom(event.target.value);
                        setSettings((c) => ({ ...c, background: event.target.value }));
                      }}
                      className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    Custom
                  </label>
                </div>
                <p className="mt-2 text-xs text-muted">
                  The Apple touch icon always gets a solid colour — iOS composites transparent
                  icons onto black.
                </p>
              </fieldset>

              <Field
                label={`Padding: ${Math.round(settings.padding * 100)}%`}
                hint="Breathing room around the artwork. A tight logo usually wants 5–10%."
              >
                {({ id, describedBy }) => (
                  <RangeInput
                    id={id}
                    aria-describedby={describedBy}
                    min={0}
                    max={0.25}
                    step={0.01}
                    value={settings.padding}
                    onChange={(event) =>
                      setSettings((c) => ({ ...c, padding: Number(event.target.value) }))
                    }
                  />
                )}
              </Field>
            </div>

            <Button size="lg" onClick={run} disabled={isRunning}>
              {isRunning ? 'Generating…' : output ? 'Generate again' : 'Generate favicon set'}
            </Button>
          </>
        ) : null}
      </ToolSurface>

      {output ? (
        <section
          aria-label="Result"
          className="rounded-2xl border border-vault-line bg-vault-soft p-5 sm:p-6"
        >
          <p className="text-sm font-medium text-vault">
            Done — and your file never left your device. Download it below.
          </p>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-heading">favicons.zip</p>
              <p className="text-sm text-muted">
                {formatBytes(output.zip.size)} · {output.icons.length + 1} icons, manifest and
                HTML snippet
              </p>
            </div>
            <Button onClick={() => downloadBlob(output.zip, 'favicons.zip')}>
              Download the set
            </Button>
          </div>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {output.icons.map((icon, index) => (
              <li
                key={icon.filename}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-sunken">
                  {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
                  <img
                    src={output.previews[index]}
                    alt={`${icon.size}×${icon.size} preview`}
                    className="max-h-full max-w-full"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{icon.filename}</p>
                  <p className="text-xs text-muted">{icon.purpose}</p>
                </div>
              </li>
            ))}
            <li className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-sunken text-xs font-medium text-muted">
                ICO
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">favicon.ico</p>
                <p className="text-xs text-muted">16, 32 and 48px in one file</p>
              </div>
            </li>
          </ul>

          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold">Paste this into your &lt;head&gt;</h2>
              <CopyButton text={headSnippet()} size="sm" label="Copy HTML" />
            </div>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-surface p-3 font-mono text-xs leading-relaxed">
              {headSnippet()}
            </pre>
          </div>
        </section>
      ) : null}
    </div>
  );
}
