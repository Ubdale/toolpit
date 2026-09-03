'use client';

import { Slider as ArkSlider } from '@ark-ui/react';
import { useEffect, useId, useMemo, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * The one slider, in the same visual language as the Dropdown and on the same
 * headless foundation.
 *
 * Two things here are not cosmetic:
 *
 * **Live vs committed.** Dragging emits `onInput` on every movement and
 * `onChange` only when the handle is released. A preview can follow the drag
 * continuously while anything expensive — re-rendering a hundred-page PDF,
 * re-running a model — waits for the value to settle.
 *
 * **Non-linear scales.** A quality control from 1 to 100 and a zoom from 0.1x
 * to 10x want different feels. With `scale="log"` the handle position maps
 * logarithmically, so the low end gets the travel it needs instead of being
 * squeezed into the first few pixels.
 */

export type SliderMark = {
  value: number;
  /** Shown under the tick. Omit for an unlabelled tick. */
  label?: string;
};

export type SliderProps = {
  label?: string;
  /** Single value, or a pair for a range slider. */
  value: number | [number, number];
  /** Fires continuously while dragging. */
  onInput?: (value: number | [number, number]) => void;
  /** Fires once the handle is released, or immediately on keyboard/typed input. */
  onChange: (value: number | [number, number]) => void;

  min?: number;
  max?: number;
  step?: number;
  /** Decimal places kept when reading a value back. */
  precision?: number;
  /** Linear travel, or logarithmic for wide ranges. */
  scale?: 'linear' | 'log';

  marks?: SliderMark[];
  /** Snap to the nearest mark rather than the nearest step. */
  snapToMarks?: boolean;

  /** When the numeric read-out appears. */
  valueLabel?: 'always' | 'hover' | 'drag' | 'none';
  /** A typed number input beside the track. */
  editable?: boolean;

  prefix?: string;
  suffix?: string;
  /** Overrides prefix/suffix entirely. */
  format?: (value: number) => string;

  orientation?: 'horizontal' | 'vertical';
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  id?: string;
  name?: string;
};

/**
 * The machine always works in linear "position" space; a log scale converts at
 * the boundary so everything inside — steps, marks, keyboard travel — stays
 * evenly spaced.
 */
function makeScale(min: number, max: number, scale: 'linear' | 'log') {
  if (scale === 'linear' || min <= 0) {
    return { toPosition: (v: number) => v, toValue: (p: number) => p, posMin: min, posMax: max };
  }
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  return {
    toPosition: (v: number) => Math.log(Math.max(min, v)),
    toValue: (p: number) => Math.exp(p),
    posMin: logMin,
    posMax: logMax,
  };
}

export function Slider({
  label,
  value,
  onInput,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  precision = 2,
  scale = 'linear',
  marks,
  snapToMarks = false,
  valueLabel = 'always',
  editable = false,
  prefix = '',
  suffix = '',
  format,
  orientation = 'horizontal',
  disabled,
  readOnly,
  invalid,
  hint,
  error,
  className,
  id,
  name,
}: SliderProps) {
  const isRange = Array.isArray(value);
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  const mapper = useMemo(() => makeScale(min, max, scale), [min, max, scale]);
  const [dragging, setDragging] = useState(false);

  const round = (n: number) => Number(n.toFixed(precision));

  const positions = useMemo(
    () => (isRange ? value.map(mapper.toPosition) : [mapper.toPosition(value)]),
    [value, isRange, mapper],
  );

  // Snapping to named stops is a different rule from stepping, so it is applied
  // after the machine has produced a value rather than by faking the step.
  const applySnap = (next: number) => {
    if (!snapToMarks || !marks || marks.length === 0) return round(next);
    let closest = marks[0]!.value;
    for (const mark of marks) {
      if (Math.abs(mark.value - next) < Math.abs(closest - next)) closest = mark.value;
    }
    return closest;
  };

  const fromPositions = (next: number[]) => {
    const values = next.map((p) => applySnap(mapper.toValue(p)));
    return (isRange ? [values[0]!, values[1]!] : values[0]!) as number | [number, number];
  };

  const display = (n: number) => (format ? format(n) : `${prefix}${round(n)}${suffix}`);

  const showLabel =
    valueLabel === 'always' || (valueLabel === 'drag' && dragging) || valueLabel === 'hover';

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <ArkSlider.Root
        id={fieldId}
        name={name}
        value={positions}
        min={mapper.posMin}
        max={mapper.posMax}
        // In log space the step is a ratio, so it is derived rather than passed
        // through — otherwise the low end would move in giant jumps.
        step={scale === 'log' ? (mapper.posMax - mapper.posMin) / 100 : step}
        disabled={disabled}
        readOnly={readOnly}
        invalid={invalid || Boolean(error)}
        orientation={orientation}
        thumbAlignment="contain"
        onValueChange={(details) => {
          setDragging(true);
          onInput?.(fromPositions(details.value));
        }}
        onValueChangeEnd={(details) => {
          setDragging(false);
          onChange(fromPositions(details.value));
        }}
        className={cn(
          'flex gap-2',
          orientation === 'vertical' ? 'h-48 flex-row items-stretch' : 'flex-col',
        )}
      >
        {label || showLabel ? (
          <div className="flex items-baseline justify-between gap-3">
            {label ? (
              <ArkSlider.Label className="text-sm font-medium">{label}</ArkSlider.Label>
            ) : (
              <span />
            )}
            {showLabel ? (
              <span
                className={cn(
                  'text-sm tabular-nums',
                  valueLabel === 'hover' && !dragging ? 'text-muted' : 'text-text',
                )}
              >
                {isRange
                  ? `${display(value[0])} – ${display(value[1])}`
                  : display(value as number)}
              </span>
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            'flex items-center gap-3',
            orientation === 'vertical' && 'h-full flex-col',
          )}
        >
          <ArkSlider.Control
            className={cn(
              'group relative flex flex-1 touch-none select-none items-center',
              orientation === 'vertical' ? 'h-full w-6 flex-col justify-center' : 'h-6 w-full',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <ArkSlider.Track
              className={cn(
                'overflow-hidden rounded-full bg-sunken',
                orientation === 'vertical' ? 'h-full w-1.5' : 'h-1.5 w-full',
              )}
            >
              <ArkSlider.Range
                className={cn('rounded-full', invalid || error ? 'bg-danger' : 'bg-accent')}
              />
            </ArkSlider.Track>

            {positions.map((_, index) => (
              <ArkSlider.Thumb
                key={index}
                index={index}
                // 20px keeps the handle above the ~44px touch guidance once the
                // control's own padding is counted, without looking clumsy.
                className={cn(
                  'size-5 rounded-full border-2 bg-surface shadow-sm transition-[transform,border-color]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  'active:scale-110',
                  invalid || error ? 'border-danger' : 'border-accent',
                  readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
                )}
              >
                <ArkSlider.HiddenInput />
              </ArkSlider.Thumb>
            ))}

            {marks && marks.length > 0 ? (
              <ArkSlider.MarkerGroup>
                {marks.map((mark) => (
                  <ArkSlider.Marker
                    key={mark.value}
                    value={mapper.toPosition(mark.value)}
                    className="mt-3 text-[11px] text-muted data-[state=under-value]:text-accent"
                  >
                    {mark.label ?? ''}
                  </ArkSlider.Marker>
                ))}
              </ArkSlider.MarkerGroup>
            ) : null}
          </ArkSlider.Control>

          {editable && !isRange ? (
            <NumberBox
              value={value as number}
              min={min}
              max={max}
              step={step}
              precision={precision}
              disabled={disabled || readOnly}
              suffix={suffix}
              onCommit={(next) => onChange(applySnap(next))}
            />
          ) : null}
        </div>
      </ArkSlider.Root>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * The typed companion to the track.
 *
 * It keeps its own draft string so a half-typed number is not clamped
 * mid-keystroke — "1" on its way to "150" would otherwise be forced to the
 * minimum the moment it was typed.
 */
function NumberBox({
  value,
  min,
  max,
  step,
  precision,
  disabled,
  suffix,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  precision: number;
  disabled?: boolean;
  suffix?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(Number(value.toFixed(precision))));
  }, [value, precision]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    onCommit(Math.min(max, Math.max(min, Number(parsed.toFixed(precision)))));
  };

  return (
    <span className="flex shrink-0 items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label="Value"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
        }}
        className={cn(
          'h-9 w-20 rounded-lg border border-line bg-surface px-2 text-sm tabular-nums',
          'transition-colors hover:border-line-strong focus:border-accent disabled:opacity-50',
        )}
      />
      {suffix ? <span className="text-xs text-muted">{suffix}</span> : null}
    </span>
  );
}
