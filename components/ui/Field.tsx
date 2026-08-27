'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

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

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(controlClasses, 'pr-8', className)} {...props}>
      {children}
    </select>
  );
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

/** Segmented choice rendered as real radios, so arrow keys work. */
export function RadioCards<T extends string>({
  legend,
  value,
  options,
  onChange,
  name,
}: RadioCardsProps<T>) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition-colors',
                'has-focus-visible:outline-2',
                'has-focus-visible:outline-offset-2 has-focus-visible:outline-accent',
                selected
                  ? 'border-accent bg-accent-soft'
                  : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="mt-0.5 size-4 shrink-0 accent-accent"
              />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function RangeInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type="range"
      className={cn('w-full accent-accent', className)}
      {...props}
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
