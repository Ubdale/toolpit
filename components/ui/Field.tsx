'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { RadioGroup } from '@ark-ui/react';

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

type RadioOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

type RadioCardsProps<T extends string> = {
  legend: string;
  value: T;
  options: RadioOption<T>[];
  onChange: (value: T) => void;
  name: string;
};

/**
 * Segmented choice, rendered on Ark's RadioGroup.
 *
 * The card is the radio: the whole row is the hit target and the selected
 * styling sits on the same element as the state. The real input stays in the
 * accessibility tree but out of sight, because a native radio cannot be
 * styled to match anything - `accent-color` sets the dot and leaves the rest
 * as whatever the browser draws.
 */
export function RadioCards<T extends string>({
  legend,
  value,
  options,
  onChange,
  name,
}: RadioCardsProps<T>) {
  return (
    <RadioGroup.Root
      value={value}
      name={name}
      onValueChange={(details) => onChange(details.value as T)}
      className="flex flex-col gap-1.5"
    >
      <RadioGroup.Label className="mb-1.5 text-sm font-medium">{legend}</RadioGroup.Label>

      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <RadioGroup.Item
              key={option.value}
              value={option.value}
              className={cn(
                'flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition-colors',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2',
                'has-focus-visible:outline-accent',
                selected
                  ? 'border-accent bg-accent-soft'
                  : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <RadioGroup.ItemControl
                className={cn(
                  'mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border transition-colors',
                  selected
                    ? 'border-accent bg-accent text-accent-contrast'
                    : 'border-line-strong bg-surface',
                )}
              >
                {selected ? (
                  <span aria-hidden="true" className="block size-1.5 rounded-full bg-current" />
                ) : null}
              </RadioGroup.ItemControl>

              <RadioGroup.ItemText asChild>
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  {option.description ? (
                    <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
                  ) : null}
                </span>
              </RadioGroup.ItemText>

              <RadioGroup.ItemHiddenInput />
            </RadioGroup.Item>
          );
        })}
      </div>
    </RadioGroup.Root>
  );
}

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
