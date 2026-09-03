'use client';

import type { ReactNode } from 'react';

import { downloadBlob } from '@/lib/download';
import { formatBytes } from '@/lib/format';
import { site } from '@/lib/site';

import { Button } from './Button';
import { useToast } from './Toast';
import { Icon } from './Icon';

export type DownloadTarget = { blob: Blob; filename: string };

type ResultPanelProps = {
  /** Headline stat, e.g. "merged-3-files.pdf" */
  filename: string;
  size: number;
  /** Optional extra line, e.g. "18 pages · 42% smaller". */
  detail?: string;
  target: DownloadTarget;
  onReset: () => void;
  children?: ReactNode;
};

export function ResultPanel({
  filename,
  size,
  detail,
  target,
  onReset,
  children,
}: ResultPanelProps) {
  const toast = useToast();

  return (
    <section
      aria-label="Result"
      className="rounded-2xl border border-vault-line bg-vault-soft p-5 sm:p-6"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-vault">
        <Icon name="check" size={16} />
        {site.resultReady}
      </p>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-display text-heading" title={filename}>
            {filename}
          </p>
          <p className="text-sm text-muted">
            {formatBytes(size)}
            {detail ? ` · ${detail}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              downloadBlob(target.blob, target.filename);
              toast.show('Saved — and it never left your device.', 'vault');
            }}
          >
            <Icon name="download" size={16} />
            Download
          </Button>
          <Button variant="secondary" onClick={onReset}>
            Start over
          </Button>
        </div>
      </div>

      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}


