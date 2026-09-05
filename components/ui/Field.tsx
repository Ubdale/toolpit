'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Slider } from './Slider';

type FieldProps = {
  label: string;
  hint?: string;
  children: (props: { id: string; describedBy?: string }) => ReactNode;
};

/** Label + control + hint, wired up with matching ids. */
export function Field({ label, hint, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({ id, describedBy: hintId })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const controlClasses =
  'h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-text ' +
  'transition-colors hover:border-line-strong focus:border-accent';

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return <input type="text" className={cn(controlClasses, className)} {...props} />;
}

/**
 * RadioCards moved to ./Choice when the control set was rebuilt on
 * PrimeReact's primitives. Re-exported here so the ten call sites that import
 * it from this module keep working.
 */
export { RadioCards, type RadioCardsProps, type RadioOption } from './Choice';

/**
 * Compatibility shim over {@link Slider}.
 *
 * The call sites that use this render their own value into the surrounding
 * `Field` label ("Text size — 10pt"), so the slider's own read-out is turned
 * off here to avoid printing the number twice. New code should use `Slider`
 * directly, which additionally offers marks, ranges, a typed input and
 * separate live/committed events.
 */
export function RangeInput({
  className,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
  id,
}: ComponentProps<'input'>) {
  const emit = (next: number) => {
    // The existing call sites read `event.target.value`, so the shim hands
    // them the shape they already expect rather than changing sixty signatures.
    onChange?.({ target: { value: String(next) } } as never);
  };

  return (
    <Slider
      id={id}
      className={cn('w-full', className)}
      value={Number(value ?? 0)}
      min={Number(min ?? 0)}
      max={Number(max ?? 100)}
      step={Number(step ?? 1)}
      disabled={disabled}
      valueLabel="none"
      onInput={(next) => emit(next as number)}
      onChange={(next) => emit(next as number)}
    />
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}
