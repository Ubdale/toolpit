'use client';

import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { Textarea as PrimeTextarea } from 'primereact/textarea';
import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';

/**
 * The text, number and multiline inputs.
 *
 * Built on PrimeReact's unstyled primitives, like the Dropdown: they carry the
 * behaviour and ARIA wiring and ship no CSS, so every class here is ours and
 * the controls match the rest of the set exactly.
 *
 * InputNumber matters more than it looks. Most inputs in the tools are numeric
 * (widths, quality, page numbers, margins), and a native `type="number"`
 * silently accepts "12e4", changes value when the wheel passes over it, and
 * reports an empty string for anything it cannot parse. This does none of
 * those things, and it clamps to the range on blur rather than fighting you
 * mid-keystroke.
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

/** Label, control, then hint or error - the same shell the Dropdown uses. */
function Shell({
  label,
  hint,
  error,
  invalid,
  required,
  className,
  controlId,
  children,
}: BaseProps & { controlId: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={controlId} className="w-fit text-sm font-medium">
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </label>
      ) : null}

      {children}

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className={cn('text-xs', invalid ? 'text-danger' : 'text-muted')}>{hint}</p>
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
    <Shell {...base} controlId={id} invalid={invalid}>
      <div className={cn(controlClasses, tone(invalid))}>
        {prefix ? <span className="shrink-0 text-muted">{prefix}</span> : null}

        <InputText
          id={id}
          type={type}
          aria-label={base['aria-label']}
          aria-invalid={invalid || undefined}
          name={base.name}
          value={value}
          maxLength={maxLength}
          autoComplete={autoComplete}
          placeholder={base.placeholder}
          disabled={base.disabled}
          readOnly={base.readOnly}
          required={base.required}
          invalid={invalid}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
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
    <Shell {...base} controlId={id} invalid={invalid}>
      <PrimeTextarea
        id={id}
        aria-label={base['aria-label']}
        aria-invalid={invalid || undefined}
        name={base.name}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={base.placeholder}
        disabled={base.disabled}
        readOnly={base.readOnly}
        required={base.required}
        invalid={invalid}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        className={cn(
          'w-full resize-y rounded-xl border bg-surface px-3 py-2.5 text-sm outline-none',
          'transition-colors placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50',
          tone(invalid),
        )}
      />
    </Shell>
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
    <Shell {...base} controlId={id} invalid={invalid}>
      <InputNumber.Root
        value={Number.isFinite(value) ? value : null}
        min={min}
        max={max}
        step={step}
        maxFractionDigits={precision}
        disabled={base.disabled}
        readOnly={base.readOnly}
        invalid={invalid}
        onValueChange={(event: { value: number | null | undefined }) => {
          if (typeof event.value === 'number' && Number.isFinite(event.value)) onChange(event.value);
        }}
        className="w-full"
      >
        <InputNumber.Group className={cn(controlClasses, tone(invalid), 'pr-1')}>
          {prefix ? <span className="shrink-0 text-muted">{prefix}</span> : null}

          <InputNumber.Input
            id={id}
            aria-label={base['aria-label']}
            name={base.name}
            placeholder={base.placeholder}
            className={cn(inputClasses, 'tabular-nums')}
          />

          {suffix ? <span className="shrink-0 text-xs text-muted">{suffix}</span> : null}

          {hideSteppers ? null : (
            <span className="flex shrink-0 flex-col">
              <InputNumber.Increment
                aria-label="Increase"
                className="grid h-4 w-6 cursor-pointer place-items-center rounded text-muted transition-colors hover:bg-sunken hover:text-text data-[disabled]:opacity-30"
              >
                <Icon name="chevronUp" size={14} />
              </InputNumber.Increment>
              <InputNumber.Decrement
                aria-label="Decrease"
                className="grid h-4 w-6 cursor-pointer place-items-center rounded text-muted transition-colors hover:bg-sunken hover:text-text data-[disabled]:opacity-30"
              >
                <Icon name="chevronDown" size={14} />
              </InputNumber.Decrement>
            </span>
          )}
        </InputNumber.Group>
      </InputNumber.Root>
    </Shell>
  );
}
