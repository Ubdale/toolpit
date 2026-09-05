'use client';

import { Checkbox as ArkCheckbox, Switch } from '@ark-ui/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';

/**
 * The binary controls: checkbox and switch.
 *
 * These were bare `<input type="checkbox">` elements repeated across the
 * tools - a `Toggle` defined three separate times, once each in
 * ChartBuilderTool, ChartTool and ReportBuilderTool, plus loose checkboxes
 * elsewhere. That is how a control ends up rendering as an unstyled browser
 * default on one page and a themed box on another.
 *
 * Both hide the real input rather than restyling it, because a native
 * checkbox cannot be styled consistently across browsers - `accent-color`
 * gets you the fill and nothing else. Ark keeps the hidden input in the
 * accessibility tree and in any surrounding form.
 */

const focusRing =
  'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent';

const boxBase = 'grid size-[18px] shrink-0 place-items-center border transition-colors';

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
  const state = indeterminate ? 'indeterminate' : checked;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <ArkCheckbox.Root
        checked={state}
        disabled={disabled}
        name={name}
        onCheckedChange={(details) => onChange(details.checked === true)}
        className={cn(
          'flex items-start gap-2.5 rounded-lg text-sm',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          focusRing,
        )}
      >
        <ArkCheckbox.Control
          className={cn(
            boxBase,
            'mt-px rounded-[5px]',
            checked || indeterminate
              ? 'border-accent bg-accent text-accent-contrast'
              : 'border-line-strong bg-surface',
          )}
        >
          <ArkCheckbox.Indicator indeterminate={indeterminate}>
            <span aria-hidden="true" className="block h-0.5 w-2.5 rounded-full bg-current" />
          </ArkCheckbox.Indicator>
          <ArkCheckbox.Indicator>
            <Icon name="check" size={13} />
          </ArkCheckbox.Indicator>
        </ArkCheckbox.Control>

        {label ? <ArkCheckbox.Label className="min-w-0">{label}</ArkCheckbox.Label> : null}
        <ArkCheckbox.HiddenInput />
      </ArkCheckbox.Root>

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
 * will submit later, a switch flips something now. Every "show gridlines" and
 * "grand total" in the builders is the latter.
 */
export function Toggle({ label, checked, onChange, disabled, hint, className }: ToggleProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Switch.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={(details) => onChange(details.checked)}
        className={cn(
          'flex items-center gap-3 rounded-lg text-sm',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
          focusRing,
        )}
      >
        <Switch.Control
          className={cn(
            'flex h-5 w-9 shrink-0 items-center rounded-full border px-0.5 transition-colors',
            checked ? 'border-accent bg-accent' : 'border-line-strong bg-sunken',
          )}
        >
          <Switch.Thumb
            className={cn(
              'size-4 rounded-full bg-surface shadow-sm transition-transform',
              checked ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </Switch.Control>

        {label ? <Switch.Label className="min-w-0">{label}</Switch.Label> : null}
        <Switch.HiddenInput />
      </Switch.Root>

      {hint ? <p className="pl-12 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
