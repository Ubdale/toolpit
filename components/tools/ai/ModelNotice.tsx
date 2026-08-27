'use client';

import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatBytes } from '@/lib/format';

/**
 * Sets expectations before the first run of an on-device model, and explains
 * the one thing that does cross the network — the weights, not the image.
 */
export function ModelNotice({
  bytes,
  cached,
  label,
}: {
  bytes: number;
  cached: boolean | null;
  label: string;
}) {
  return (
    <p className="rounded-xl border border-line bg-sunken px-3.5 py-3 text-xs text-muted">
      {cached
        ? `The ${label} is already cached in this browser — runs start immediately.`
        : `First run downloads the ${label} (about ${formatBytes(bytes)}). It is cached afterwards, so this happens once. Your image is not part of that download — it never leaves this tab.`}
    </p>
  );
}

export function ModelProgress({
  stage,
  value,
}: {
  stage: 'download' | 'run';
  value: number | null;
}) {
  return (
    <ProgressBar
      value={value}
      label={stage === 'download' ? 'Downloading the model…' : 'Running on your device…'}
    />
  );
}
