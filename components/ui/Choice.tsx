'use client';

import { Checkbox as PrimeCheckbox } from 'primereact/checkbox';
import { RadioButton } from 'primereact/radiobutton';
import { ToggleSwitch } from 'primereact/toggleswitch';
import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';

/**
 * The binary and one-of-many controls: checkbox, switch, radio.
 *
 * These were previously bare `<input type="checkbox">` elements repeated in
 * each tool - three separate local `Toggle` components alone - which is how a
 * control ends up looking slightly different on every page and skipping the
 * focus ring on some of them. PrimeReact's primitives supply the state and
 * keyboard behaviour; the boxes below are ours, and they hide the real input
 * rather than restyling it, because a native checkbox cannot be styled
 * consistently across browsers.
 */

const boxBase =
  'grid size-[18px] shrink-0 place-items-center border transition-colors ' +
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';

const boxTone = (checked: boolean) =>
  checked ? 'border-accent bg-accent text-accent-contrast' : 'border-line-strong bg-surface';

const focusRing =
  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent';

// ---------------------------------------------------------------- checkbox

export type CheckboxProps = {
  label?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Neither on nor off - for a "select all" over a partial selection. */
  indeterminate?: boolean;
  disabled?: boolean;
  hint?: string;
  name?: string;
  className?: string;
};

export function Checkbox({
  label,
  checked,
  onChange,
  indeterminate,
  disabled,
  hint,
  name,
  className,
}: CheckboxProps) {
  const id = useId();

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        htmlFor={id}
        className={cn(
          'flex items-start gap-2.5 text-sm',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          focusRing,
          'rounded-lg',
        )}
      >
        <PrimeCheckbox.Root
          inputId={id}
          name={name}
          checked={checked}
          indeterminate={indeterminate}
          disabled={disabled}
          onCheckedChange={(event: { checked: boolean }) => onChange(event.checked)}
          className="mt-px"
        >
          <PrimeCheckbox.Box
            className={cn(boxBase, 'rounded-[5px]', boxTone(checked || Boolean(indeterminate)))}
          >
            <PrimeCheckbox.Indicator>
              {indeterminate ? (
                <span aria-hidden="true" className="h-0.5 w-2.5 rounded-full bg-current" />
              ) : checked ? (
                <Icon name="check" size={13} />
              ) : null}
            </PrimeCheckbox.Indicator>
          </PrimeCheckbox.Box>
        </PrimeCheckbox.Root>

        {label ? <span className="min-w-0">{label}</span> : null}
      </label>

      {hint ? <p className="pl-[28px] text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------ switch

export type ToggleProps = {
  label?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: string;
  className?: string;
};

/**
 * A switch, for settings that take effect immediately.
 *
 * Distinct from a checkbox on purpose: a checkbox states a fact that a form
 * will later submit, a switch flips something now. Every "show gridlines" and
 * "grand total" in the builders is the latter.
 */
export function Toggle({ label, checked, onChange, disabled, hint, className }: ToggleProps) {
  const id = useId();

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        htmlFor={id}
        className={cn(
          'flex items-center gap-3 text-sm',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          focusRing,
          'rounded-lg',
        )}
      >
        <ToggleSwitch.Root
          inputId={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(event: { checked: boolean }) => onChange(event.checked)}
        >
          <ToggleSwitch.Control
            className={cn(
              'flex h-5 w-9 shrink-0 items-center rounded-full border px-0.5 transition-colors',
              checked ? 'border-accent bg-accent' : 'border-line-strong bg-sunken',
            )}
          >
            <ToggleSwitch.Handle
              className={cn(
                'size-4 rounded-full bg-surface shadow-sm transition-transform',
                checked ? 'translate-x-4' : 'translate-x-0',
              )}
            />
          </ToggleSwitch.Control>
        </ToggleSwitch.Root>

        {label ? <span className="min-w-0">{label}</span> : null}
      </label>

      {hint ? <p className="pl-12 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------- radio

export type RadioOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type RadioCardsProps<T extends string> = {
  legend: string;
  value: T;
  options: RadioOption<T>[];
  onChange: (value: T) => void;
  name: string;
  /** One column instead of two, for long labels. */
  columns?: 1 | 2;
  className?: string;
};

/** Segmented choice rendered as real radios, so arrow keys move between them. */
export function RadioCards<T extends string>({
  legend,
  value,
  options,
  onChange,
  name,
  columns = 2,
  className,
}: RadioCardsProps<T>) {
  const group = useId();

  return (
    <fieldset className={cn('flex flex-col gap-1.5', className)}>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>

      <div className={cn('grid gap-2', columns === 2 && 'sm:grid-cols-2')}>
        {options.map((option) => {
          const selected = option.value === value;
          const id = `${group}-${option.value}`;

          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                'flex gap-3 rounded-xl border px-3.5 py-3 transition-colors',
                focusRing,
                option.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                selected
                  ? 'border-accent bg-accent-soft'
                  : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <RadioButton.Root
                inputId={id}
                name={name}
                value={option.value}
                checked={selected}
                disabled={option.disabled}
                onCheckedChange={() => onChange(option.value)}
                className="mt-0.5"
              >
                <RadioButton.Box className={cn(boxBase, 'rounded-full', boxTone(selected))}>
                  <RadioButton.Indicator>
                    {selected ? (
                      <span aria-hidden="true" className="block size-1.5 rounded-full bg-current" />
                    ) : null}
                  </RadioButton.Indicator>
                </RadioButton.Box>
              </RadioButton.Root>

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
