'use client';

import { formatBytes } from '@/lib/format';

export type ListedFile = {
  id: string;
  name: string;
  size: number;
  /** Optional secondary line, e.g. "12 pages". */
  detail?: string;
};

type FileListProps = {
  files: ListedFile[];
  onRemove: (id: string) => void;
  /** Omit to hide the reorder controls. */
  onMove?: (id: string, direction: -1 | 1) => void;
  label: string;
};

/**
 * Ordered file list with keyboard-operable reorder controls. Buttons rather
 * than HTML5 drag-and-drop: reordering has to work for keyboard and touch
 * users, and this is the accessible path that needs no extra library.
 */
export function FileList({ files, onRemove, onMove, label }: FileListProps) {
  if (files.length === 0) return null;

  return (
    <ol aria-label={label} className="flex flex-col gap-2">
      {files.map((file, index) => (
        <li
          key={file.id}
          className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
        >
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-sunken font-display text-sm text-muted"
          >
            {index + 1}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium" title={file.name}>
              {file.name}
            </span>
            <span className="block text-xs text-muted">
              {formatBytes(file.size)}
              {file.detail ? ` · ${file.detail}` : ''}
            </span>
          </span>

          {onMove ? (
            <span className="flex shrink-0 items-center gap-1">
              <IconButton
                label={`Move ${file.name} up`}
                disabled={index === 0}
                onClick={() => onMove(file.id, -1)}
              >
                <path d="m6 14 6-6 6 6" />
              </IconButton>
              <IconButton
                label={`Move ${file.name} down`}
                disabled={index === files.length - 1}
                onClick={() => onMove(file.id, 1)}
              >
                <path d="m6 10 6 6 6-6" />
              </IconButton>
            </span>
          ) : null}

          <IconButton label={`Remove ${file.name}`} onClick={() => onRemove(file.id)}>
            <path d="M6 6 18 18M18 6 6 18" />
          </IconButton>
        </li>
      ))}
    </ol>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-text disabled:pointer-events-none disabled:opacity-30"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}
