'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { Select } from 'primereact/select';
import { useId, useMemo, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';

/**
 * The one dropdown. Every list-of-choices control in the app is this component.
 *
 * Built on PrimeReact's Select primitive, which ships behaviour without CSS:
 * the combobox ARIA wiring, roving focus, type-ahead, filtering and the
 * floating-element positioning are handled, and every class below is ours.
 *
 * The public API is unchanged from the version this replaced, so no caller had
 * to be touched. That is deliberate - a component library swap should be
 * invisible above this file, and if it is not, the abstraction was not doing
 * its job.
 */

export type DropdownOption<T extends string = string> = {
  value: T;
  label: string;
  /** Second line under the label. */
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Options sharing a group are rendered together under its heading. */
  group?: string;
};

type Common<T extends string> = {
  options: DropdownOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  /** Shown under the control; replaced by `error` when that is set. */
  hint?: string;
  error?: string;
  label?: string;
  /** Adds an X that resets the value. */
  clearable?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  /** Filter box inside the menu. Forced on when `onSearch` is given. */
  searchable?: boolean;
  /** Called as the filter text changes, for loading options remotely. */
  onSearch?: (query: string) => void;
  /** Render slot for an option row. */
  renderOption?: (option: DropdownOption<T>) => ReactNode;
  /** Render slot for the closed control's content. */
  renderValue?: (selected: DropdownOption<T>[]) => ReactNode;
  className?: string;
  id?: string;
  name?: string;
};

type SingleProps<T extends string> = Common<T> & {
  multiple?: false;
  value: T | null;
  onChange: (value: T | null) => void;
};

type MultiProps<T extends string> = Common<T> & {
  multiple: true;
  value: T[];
  onChange: (value: T[]) => void;
};

export type DropdownProps<T extends string = string> = SingleProps<T> | MultiProps<T>;

/** Above this many options the list is windowed rather than fully rendered. */
const VIRTUALIZE_ABOVE = 100;
const ROW_HEIGHT = 40;
const ROW_HEIGHT_WITH_DESCRIPTION = 56;

const controlClasses =
  'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border bg-surface px-3 ' +
  'text-left text-sm transition-colors outline-none ' +
  'focus-visible:border-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';

function controlTone(invalid?: boolean) {
  return invalid
    ? 'border-danger hover:border-danger'
    : 'border-line hover:border-line-strong data-[state=open]:border-accent';
}

/**
 * The floating menu.
 *
 * Fades rather than slides. The positioner places this element with a
 * `transform`, so an entrance animation that also drives `transform` competes
 * with the thing deciding where the menu goes - which is exactly how a menu
 * ends up in the corner of the viewport.
 */
const menuClasses =
  'z-[80] overflow-hidden rounded-xl border border-line bg-surface shadow-card ' +
  'motion-safe:transition-opacity motion-safe:duration-150';

const itemClasses =
  'flex cursor-pointer items-center rounded-lg px-2.5 py-2 text-sm outline-none ' +
  'data-[focused]:bg-sunken data-[selected]:text-text ' +
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40';

// --------------------------------------------------------------------- bits

function Row({
  option,
  selected,
  multiple,
  renderOption,
}: {
  option: DropdownOption<string>;
  selected: boolean;
  multiple?: boolean;
  renderOption?: (option: DropdownOption<never>) => ReactNode;
}) {
  if (renderOption) return <>{renderOption(option as DropdownOption<never>)}</>;

  return (
    <span className="flex w-full items-center gap-2.5">
      {multiple ? (
        <span
          aria-hidden="true"
          className={cn(
            'grid size-4 shrink-0 place-items-center rounded border',
            selected ? 'border-accent bg-accent text-accent-contrast' : 'border-line-strong',
          )}
        >
          {selected ? <Icon name="check" size={12} /> : null}
        </span>
      ) : null}

      {option.icon ? <span className="shrink-0 text-muted">{option.icon}</span> : null}

      <span className="min-w-0 flex-1">
        <span className="block truncate">{option.label}</span>
        {option.description ? (
          <span className="mt-0.5 block truncate text-xs text-muted">{option.description}</span>
        ) : null}
      </span>

      {!multiple && selected ? (
        <Icon name="check" size={16} className="shrink-0 text-accent" />
      ) : null}
    </span>
  );
}

function FieldShell({
  label,
  hint,
  error,
  invalid,
  children,
  className,
  controlId,
}: {
  label?: string;
  hint?: string;
  error?: string;
  invalid?: boolean;
  children: ReactNode;
  className?: string;
  controlId: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={controlId} className="w-fit text-sm font-medium">
          {label}
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

function Status({ loading, empty }: { loading?: boolean; empty: string }) {
  return (
    <p className="px-3 py-6 text-center text-sm text-muted">
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <Icon name="refresh" size={16} className="motion-safe:animate-spin" />
          Loading…
        </span>
      ) : (
        empty
      )}
    </p>
  );
}

/**
 * The scrolling list, windowed above a threshold so a thousand-option field
 * stays responsive. Below it, plain rendering keeps group headings and variable
 * row heights simple.
 */
function OptionList({
  options,
  selectedValues,
  multiple,
  renderOption,
}: {
  options: DropdownOption<string>[];
  selectedValues: string[];
  multiple?: boolean;
  renderOption?: (option: DropdownOption<never>) => ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const hasDescriptions = options.some((option) => option.description);
  const virtualize = options.length > VIRTUALIZE_ABOVE;

  const virtualizer = useVirtualizer({
    count: options.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (hasDescriptions ? ROW_HEIGHT_WITH_DESCRIPTION : ROW_HEIGHT),
    overscan: 8,
    enabled: virtualize,
  });

  const item = (option: DropdownOption<string>, index: number) => (
    <Select.Option key={option.value} option={option} index={index} className={itemClasses}>
      <Row
        option={option}
        selected={selectedValues.includes(option.value)}
        multiple={multiple}
        renderOption={renderOption}
      />
    </Select.Option>
  );

  if (!virtualize) {
    return (
      <div ref={parentRef} className="max-h-72 overflow-y-auto p-1.5">
        {options.map(item)}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="max-h-72 overflow-y-auto p-1.5">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)` }}
          >
            {item(options[row.index]!, row.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- component

export function Dropdown<T extends string = string>(props: DropdownProps<T>) {
  const generatedId = useId();
  const controlId = props.id ?? generatedId;
  const invalid = props.invalid || Boolean(props.error);

  const values = props.multiple ? props.value : props.value === null ? [] : [props.value];
  const selected = props.options.filter((option) => values.includes(option.value));

  // Options are grouped only when a group is actually set, so the common
  // ungrouped case never pays for a nested structure.
  const grouped = useMemo(() => {
    if (!props.options.some((option) => option.group)) return null;
    const order: string[] = [];
    const buckets = new Map<string, DropdownOption<T>[]>();
    for (const option of props.options) {
      const key = option.group ?? '';
      if (!buckets.has(key)) {
        buckets.set(key, []);
        order.push(key);
      }
      buckets.get(key)!.push(option);
    }
    return order.map((key) => ({ label: key, items: buckets.get(key)! }));
  }, [props.options]);

  const searchable = props.searchable || Boolean(props.onSearch);

  return (
    <FieldShell
      label={props.label}
      hint={props.hint}
      error={props.error}
      invalid={invalid}
      className={props.className}
      controlId={controlId}
    >
      <Select.Root
        options={grouped ?? props.options}
        optionLabel="label"
        optionValue="value"
        optionDisabled="disabled"
        {...(grouped ? { optionGroupLabel: 'label', optionGroupChildren: 'items' } : {})}
        value={props.multiple ? props.value : props.value}
        multiple={props.multiple}
        disabled={props.disabled || props.readOnly}
        invalid={invalid}
        onValueChange={(event: { value: unknown }) => {
          if (props.multiple) props.onChange((event.value ?? []) as T[]);
          else props.onChange((event.value ?? null) as T | null);
        }}
        onFilterValueChange={(event: { query: string }) => props.onSearch?.(event.query)}
      >
        <Select.Trigger
          id={controlId}
          className={cn(controlClasses, controlTone(invalid))}
        >
          {props.renderValue ? (
            <span className="min-w-0 flex-1 truncate">{props.renderValue(selected)}</span>
          ) : props.multiple && selected.length > 0 ? (
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {selected.slice(0, 2).map((option) => (
                <span
                  key={option.value}
                  className="rounded-md border border-line bg-sunken px-1.5 py-0.5 text-xs"
                >
                  {option.label}
                </span>
              ))}
              {selected.length > 2 ? (
                <span className="text-xs text-muted">+{selected.length - 2}</span>
              ) : null}
            </span>
          ) : (
            <Select.Value
              placeholder={props.placeholder ?? 'Select…'}
              className="min-w-0 flex-1 truncate data-[placeholder]:text-muted"
            />
          )}

          {props.clearable && selected.length > 0 ? (
            <Select.Clear
              aria-label="Clear selection"
              className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-text"
            >
              <Icon name="close" size={16} />
            </Select.Clear>
          ) : null}

          <Select.Indicator className="shrink-0 text-muted transition-transform data-[state=open]:rotate-180">
            <Icon name="chevronDown" size={18} />
          </Select.Indicator>
        </Select.Trigger>

        <Select.Portal>
          <Select.Positioner sideOffset={6} flip shift strategy="fixed">
            {/* The positioner has no same-width option, but it does publish
                the trigger's width as a custom property, and the popup
                inherits it. Setting width rather than relying on the
                min-width it already applies keeps a long option label from
                making the menu wider than the control. */}
            <Select.Popup
              className={cn(menuClasses, 'w-(--px-positioner-anchor-width)')}
            >
              {searchable ? (
                <div className="border-b border-line px-3">
                  <Select.Filter
                    placeholder="Search…"
                    className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted"
                  />
                </div>
              ) : null}

              {props.loading || props.options.length === 0 ? (
                <Status loading={props.loading} empty={props.emptyMessage ?? 'No matches'} />
              ) : (
                <Select.List>
                  <OptionList
                    options={props.options as DropdownOption<string>[]}
                    selectedValues={values as string[]}
                    multiple={props.multiple}
                    renderOption={
                      props.renderOption as ((option: DropdownOption<never>) => ReactNode) | undefined
                    }
                  />
                </Select.List>
              )}

              <Select.Empty className="px-3 py-6 text-center text-sm text-muted">
                {props.emptyMessage ?? 'No matches'}
              </Select.Empty>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </FieldShell>
  );
}
