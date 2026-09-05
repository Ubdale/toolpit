'use client';

import { Slider as PrimeSlider } from 'primereact/slider';
import { useEffect, useId, useMemo, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * The one slider, in the same visual language as the Dropdown and on the same
 * headless foundation - PrimeReact's unstyled primitives.
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

  /** The machine reports one number or a pair; both arrive here as a list. */
  const asPositions = (next: number | number[] | undefined): number[] => {
    if (Array.isArray(next)) return next;
    if (typeof next === 'number') return [next];
    return positions;
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
      <PrimeSlider.Root
        id={fieldId}
        name={name}
        value={isRange ? positions : positions[0]!}
        min={mapper.posMin}
        max={mapper.posMax}
        // In log space the step is a ratio, so it is derived rather than passed
        // through — otherwise the low end would move in giant jumps.
        step={scale === 'log' ? (mapper.posMax - mapper.posMin) / 100 : step}
        disabled={disabled}
        readOnly={readOnly}
        invalid={invalid || Boolean(error)}
        orientation={orientation}
        onValueChange={(event: { value?: number | number[] }) => {
          setDragging(true);
          onInput?.(fromPositions(asPositions(event.value)));
        }}
        onValueChangeEnd={(event: { value?: number | number[] }) => {
          setDragging(false);
          onChange(fromPositions(asPositions(event.value)));
        }}
        className={cn(
          'flex gap-2',
          orientation === 'vertical' ? 'h-48 flex-row items-stretch' : 'flex-col',
        )}
      >
        {label || showLabel ? (
          <div className="flex items-baseline justify-between gap-3">
            {label ? (
              <label htmlFor={fieldId} className="text-sm font-medium">{label}</label>
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
            // Reserve space for the label row under the track.
            marks?.some((mark) => mark.label) && orientation === 'horizontal' && 'mb-6',
          )}
        >
          <div
            className={cn(
              'group relative flex flex-1 touch-none select-none items-center',
              orientation === 'vertical' ? 'h-full w-6 flex-col justify-center' : 'h-6 w-full',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <PrimeSlider.Track
              className={cn(
                'overflow-hidden rounded-full bg-sunken',
                orientation === 'vertical' ? 'h-full w-1.5' : 'h-1.5 w-full',
              )}
            >
              <PrimeSlider.Range
                className={cn('rounded-full', invalid || error ? 'bg-danger' : 'bg-accent')}
              />
            </PrimeSlider.Track>

            {positions.map((_, index) => (
              <PrimeSlider.Handle
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
              />
            ))}

            {marks && marks.length > 0 ? (
              // Marks are positioned by us rather than by the library.
              //
              // The percentage each mark sits at is resolved against this
              // container, so it must span the track - a zero-width parent
              // collapses 0%, 50% and 100% onto the same pixel and stacks
              // every label. Owning the container makes that impossible.
              <div
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute',
                  orientation === 'vertical' ? 'inset-y-0 left-full ml-2' : 'inset-x-0 top-full',
                )}
              >
                {marks.map((mark, index) => {
                  const span = mapper.posMax - mapper.posMin;
                  const percent =
                    span === 0 ? 0 : ((mapper.toPosition(mark.value) - mapper.posMin) / span) * 100;
                  const reached = (positions[0] ?? 0) >= mapper.toPosition(mark.value);

                  return (
                    <span
                      key={mark.value}
                      style={{ left: `${percent}%` }}
                      className={cn(
                        'absolute top-0 flex -translate-x-1/2 flex-col items-center text-[11px]',
                        reached ? 'text-accent' : 'text-muted',
                      )}
                    >
                      <span className="mt-3 h-1 w-px bg-line-strong" />
                      {mark.label ? (
                        // Each label is centred on its tick, so the outermost
                        // two would hang off the ends of the track. They are
                        // pulled inward and kept on one line.
                        <span
                          className={cn(
                            'mt-1 whitespace-nowrap',
                            index === 0 && 'translate-x-[40%]',
                            index === marks.length - 1 && '-translate-x-[40%]',
                          )}
                        >
                          {mark.label}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>

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
      </PrimeSlider.Root>

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
