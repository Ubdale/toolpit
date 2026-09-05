'use client';

import { Field, NumberInput } from '@ark-ui/react';
import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';

/**
 * The text, number and multiline inputs.
 *
 * Built on Ark's Field and NumberInput machines for the same reason Dropdown
 * is: the wiring nobody gets right by hand - label/description/error ids,
 * `aria-invalid`, `aria-describedby` pointing at whichever of hint or error is
 * actually rendered, and a number field that clamps, steps and holds-to-repeat
 * - is what a machine already solves. The markup and styling are ours, and
 * deliberately identical to Dropdown's so a form reads as one control set.
 *
 * NumberInput matters more than it looks. Most inputs in the tools are numeric
 * (widths, quality, page numbers, margins), and a native `type="number"`
 * silently accepts "12e4", scrolls the value when the wheel passes over it,
 * and reports an empty string for anything it cannot parse. This does none of
 * those things.
 */

const controlClasses =
  'flex min-h-11 w-full items-center gap-2 rounded-xl border bg-surface px-3 text-left text-sm ' +
  'transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';

function tone(invalid?: boolean) {
  return invalid
    ? 'border-danger hover:border-danger focus-within:border-danger'
    : 'border-line hover:border-line-strong focus-within:border-accent';
}

const inputClasses =
  'min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-muted ' +
  'disabled:cursor-not-allowed';

type BaseProps = {
  label?: string;
  hint?: string;
  error?: string;
  invalid?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  /** Sits inside the control, before the text. */
  prefix?: ReactNode;
  /** Sits inside the control, after the text - a unit, usually. */
  suffix?: ReactNode;
  /** For controls whose meaning is clear on screen but needs naming for AT. */
  'aria-label'?: string;
};

/**
 * Label, control, then hint or error.
 *
 * Ark renders the hint and error itself so the ids line up, but it renders an
 * empty <span> for an absent error, which would still take up the gap. Each is
 * therefore mounted only when it has something to say.
 */
function Shell({
  label,
  hint,
  error,
  required,
  className,
  children,
}: BaseProps & { children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <Field.Label className="w-fit text-sm font-medium">
          {label}
          {required ? (
            <Field.RequiredIndicator className="ml-0.5 text-danger">*</Field.RequiredIndicator>
          ) : null}
        </Field.Label>
      ) : null}

      {children}

      {error ? (
        <Field.ErrorText className="text-xs text-danger">{error}</Field.ErrorText>
      ) : hint ? (
        <Field.HelperText className="text-xs text-muted">{hint}</Field.HelperText>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------------- text

export type InputProps = BaseProps & {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'url' | 'search' | 'tel' | 'password';
  maxLength?: number;
  autoComplete?: string;
  /** Adds an X that clears the value. */
  clearable?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
};

export function Input({
  value,
  onChange,
  type = 'text',
  maxLength,
  autoComplete,
  clearable,
  onKeyDown,
  prefix,
  suffix,
  ...base
}: InputProps) {
  const generated = useId();
  const id = base.id ?? generated;
  const invalid = base.invalid || Boolean(base.error);

  return (
    <Field.Root
      id={id}
      invalid={invalid}
      disabled={base.disabled}
      readOnly={base.readOnly}
      required={base.required}
      asChild
    >
      <Shell {...base} invalid={invalid}>
        <div className={cn(controlClasses, tone(invalid))}>
          {prefix ? <span className="shrink-0 text-muted">{prefix}</span> : null}

          <Field.Input
            type={type}
            aria-label={base['aria-label']}
            name={base.name}
            value={value}
            maxLength={maxLength}
            autoComplete={autoComplete}
            placeholder={base.placeholder}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            className={inputClasses}
          />

          {clearable && value ? (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => onChange('')}
              className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-text"
            >
              <Icon name="close" size={16} />
            </button>
          ) : null}

          {suffix ? <span className="shrink-0 text-xs text-muted">{suffix}</span> : null}
        </div>
      </Shell>
    </Field.Root>
  );
}

// --------------------------------------------------------------- multiline

export type TextareaProps = BaseProps & {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
};

export function Textarea({ value, onChange, rows = 4, maxLength, ...base }: TextareaProps) {
  const generated = useId();
  const id = base.id ?? generated;
  const invalid = base.invalid || Boolean(base.error);

  return (
    <Field.Root
      id={id}
      invalid={invalid}
      disabled={base.disabled}
      readOnly={base.readOnly}
      required={base.required}
      asChild
    >
      <Shell {...base} invalid={invalid}>
        <Field.Textarea
          aria-label={base['aria-label']}
          name={base.name}
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={base.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'w-full resize-y rounded-xl border bg-surface px-3 py-2.5 text-sm outline-none',
            'transition-colors placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50',
            tone(invalid),
          )}
        />
      </Shell>
    </Field.Root>
  );
}

// ------------------------------------------------------------------ number

export type NumberFieldProps = BaseProps & {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Decimal places to display and round to. */
  precision?: number;
  /** Hides the stepper buttons where the value is typed rather than nudged. */
  hideSteppers?: boolean;
};

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision,
  hideSteppers,
  suffix,
  prefix,
  ...base
}: NumberFieldProps) {
  const generated = useId();
  const id = base.id ?? generated;
  const invalid = base.invalid || Boolean(base.error);

  return (
    <Field.Root
      id={id}
      invalid={invalid}
      disabled={base.disabled}
      readOnly={base.readOnly}
      required={base.required}
      asChild
    >
      <Shell {...base} invalid={invalid}>
        <NumberInput.Root
          value={Number.isFinite(value) ? String(value) : ''}
          min={min}
          max={max}
          step={step}
          formatOptions={
            precision === undefined
              ? undefined
              : { maximumFractionDigits: precision, minimumFractionDigits: 0 }
          }
          // Clamp on blur rather than on every keystroke, so typing "1" on the
          // way to "100" in a field with a minimum of 10 is not fought.
          clampValueOnBlur
          // A number that changes because the pointer happened to pass over it
          // is a value nobody chose.
          allowMouseWheel={false}
          disabled={base.disabled}
          readOnly={base.readOnly}
          invalid={invalid}
          onValueChange={(details) => {
            if (Number.isFinite(details.valueAsNumber)) onChange(details.valueAsNumber);
          }}
          className="w-full"
        >
          <NumberInput.Control className={cn(controlClasses, tone(invalid), 'pr-1')}>
            {prefix ? <span className="shrink-0 text-muted">{prefix}</span> : null}

            <NumberInput.Input
              aria-label={base['aria-label']}
              name={base.name}
              placeholder={base.placeholder}
              className={cn(inputClasses, 'tabular-nums')}
            />

            {suffix ? <span className="shrink-0 text-xs text-muted">{suffix}</span> : null}

            {hideSteppers ? null : (
              <span className="flex shrink-0 flex-col">
                <NumberInput.IncrementTrigger
                  aria-label="Increase"
                  className="grid h-4 w-6 place-items-center rounded text-muted transition-colors hover:bg-sunken hover:text-text data-[disabled]:opacity-30"
                >
                  <Icon name="chevronUp" size={14} />
                </NumberInput.IncrementTrigger>
                <NumberInput.DecrementTrigger
                  aria-label="Decrease"
                  className="grid h-4 w-6 place-items-center rounded text-muted transition-colors hover:bg-sunken hover:text-text data-[disabled]:opacity-30"
                >
                  <Icon name="chevronDown" size={14} />
                </NumberInput.DecrementTrigger>
              </span>
            )}
          </NumberInput.Control>
        </NumberInput.Root>
      </Shell>
    </Field.Root>
  );
}
