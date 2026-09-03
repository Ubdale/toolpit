'use client';

import { Button } from '@/components/ui/Button';
import { createZip, downloadBlob } from '@/lib/download';
import { formatBytes } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import { site } from '@/lib/site';

export type BatchOutput = {
  id: string;
  name: string;
  blob: Blob;
  /** Size of the file that went in, for an honest before/after. */
  originalSize: number;
  detail: string;
};

/**
 * The result view for the tools that process a whole folder at once: download
 * them one at a time, or take the lot as a ZIP.
 *
 * The ZIP is built in memory with the same store-only writer the rest of
 * Toolpit uses — images are already compressed, so deflating them again buys
 * nothing and would cost a dependency.
 */
export function BatchResultPanel({
  outputs,
  zipName,
  onReset,
  note,
}: {
  outputs: BatchOutput[];
  zipName: string;
  onReset: () => void;
  note?: string;
}) {
  const toast = useToast();
  const totalBefore = outputs.reduce((sum, output) => sum + output.originalSize, 0);
  const totalAfter = outputs.reduce((sum, output) => sum + output.blob.size, 0);
  const change = totalBefore > 0 ? Math.round((1 - totalAfter / totalBefore) * 100) : 0;

  async function downloadZip() {
    const entries = await Promise.all(
      outputs.map(async (output) => ({
        name: output.name,
        data: new Uint8Array(await output.blob.arrayBuffer()) as Uint8Array<ArrayBuffer>,
      })),
    );
    downloadBlob(createZip(entries), zipName);
    toast.show(`Saved ${outputs.length} files — none of them left your device.`, 'vault');
  }

  return (
    <section
      aria-label="Result"
      className="rounded-2xl border border-vault-line bg-vault-soft p-5 sm:p-6"
    >
      <p className="text-sm font-medium text-vault">{site.resultReady}</p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-heading">
            {outputs.length} file{outputs.length === 1 ? '' : 's'} ready
          </p>
          <p className="text-sm text-muted">
            {formatBytes(totalBefore)} → {formatBytes(totalAfter)}
            {change > 0 ? ` · ${change}% smaller` : change < 0 ? ` · ${Math.abs(change)}% larger` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {outputs.length > 1 ? (
            <Button onClick={downloadZip}>Download all as ZIP</Button>
          ) : (
            <Button onClick={() => downloadBlob(outputs[0]!.blob, outputs[0]!.name)}>
              Download
            </Button>
          )}
          <Button variant="secondary" onClick={onReset}>
            Start over
          </Button>
        </div>
      </div>

      {note ? <p className="mt-4 text-sm text-muted">{note}</p> : null}

      {outputs.length > 1 ? (
        <ul className="mt-5 flex max-h-80 flex-col gap-2 overflow-y-auto">
          {outputs.map((output) => (
            <li
              key={output.id}
              className="flex items-center gap-3 rounded-xl border border-vault-line bg-surface px-3 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" title={output.name}>
                  {output.name}
                </span>
                <span className="block text-xs text-muted">
                  {formatBytes(output.blob.size)} · {output.detail}
                </span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadBlob(output.blob, output.name)}
              >
                Download
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
