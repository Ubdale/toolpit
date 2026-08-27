'use client';

import { useId, useState, type DragEvent } from 'react';

import { cn } from '@/lib/cn';
import { site } from '@/lib/site';

type DropzoneProps = {
  onFiles: (files: File[]) => void;
  /** `accept` attribute, e.g. "application/pdf" */
  accept: string;
  multiple?: boolean;
  label: string;
  hint?: string;
  disabled?: boolean;
};

/**
 * The file entry point for every tool.
 *
 * The <input> is visually hidden but never removed from the tab order, so the
 * whole zone is operable from the keyboard with no `role="button"` faking; the
 * label lights up via `peer-focus-visible`.
 */
export function Dropzone({
  onFiles,
  accept,
  multiple = false,
  label,
  hint,
  disabled = false,
}: DropzoneProps) {
  const inputId = useId();
  const [isOver, setIsOver] = useState(false);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsOver(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  }

  return (
    <div>
      <input
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="peer sr-only"
        aria-describedby={hint ? `${inputId}-hint` : undefined}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onFiles(files);
          // Reset so choosing the same file twice still fires onChange.
          event.target.value = '';
        }}
      />
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={handleDrop}
        className={cn(
          'flex min-h-52 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl',
          'border-2 border-dashed px-6 py-10 text-center transition-colors',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
          'peer-focus-visible:outline-accent',
          disabled && 'cursor-not-allowed opacity-60',
          isOver
            ? 'border-accent bg-accent-soft'
            : 'border-line-strong bg-surface hover:border-accent hover:bg-sunken',
        )}
      >
        <UploadGlyph />
        <span className="text-base font-medium">{label}</span>
        <span className="text-sm text-muted">{site.emptyState}</span>
        {hint ? (
          <span id={`${inputId}-hint`} className="text-xs text-muted">
            {hint}
          </span>
        ) : null}
      </label>
    </div>
  );
}

function UploadGlyph() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="size-8 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
