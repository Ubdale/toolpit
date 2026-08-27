'use client';

type ProgressBarProps = {
  /** 0-1, or null for an indeterminate step. */
  value: number | null;
  label: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  const percent = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        {percent === null ? null : <span className="text-muted tabular-nums">{percent}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="h-2 overflow-hidden rounded-full bg-sunken"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200"
          style={{ width: percent === null ? '100%' : `${percent}%` }}
        />
      </div>
    </div>
  );
}
