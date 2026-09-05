'use client';

import { Combobox, createListCollection, Portal } from '@ark-ui/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useId, useMemo, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Icon } from './Icon';

/**
 * The one dropdown. Every list-of-choices control in the app is this component.
 *
 * It is built on Ark UI's headless machines rather than hand-rolled, because
 * the parts that are easy to get wrong — combobox ARIA wiring, focus
 * management, type-ahead, and keeping a menu inside the viewport when it opens
 * near the bottom edge or inside a scroll container — are exactly the parts a
 * state machine already solves. All the markup and styling below is ours.
 *
 * Every instance is Ark's Combobox machine. The Select machine would suit the
 * short fixed lists better, but it does not position its menu: its positioner
 * carries `transform: translate3d(var(--x), var(--y), 0)` while the machine
 * never defines those variables, so the menu lands at the top-left of the
 * viewport at content width instead of under its trigger. Combobox sets them
 * correctly through an otherwise identical portal/positioner/content
 * structure, and typing in a short list simply filters it.
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

export function Dropdown<T extends string = string>(props: DropdownProps<T>) {
  // Everything routes through the Combobox machine.
  //
  // The Select machine does not position its menu: its positioner is rendered
  // with `transform: translate3d(var(--x), var(--y), 0)` but the machine never
  // defines --x/--y (nor --reference-width), so the transform is invalid and
  // the menu lands at the top-left of the viewport at content width instead of
  // under its trigger. The Combobox machine sets those variables correctly with
  // an otherwise identical portal/positioner/content structure.
  //
  // Typing in a short list simply filters it, which is no worse than the
  // type-ahead a select would have given.
  return <ComboboxDropdown {...props} />;
}

// ------------------------------------------------------------------- shared

function useCollection<T extends string>(options: DropdownOption<T>[]) {
  return useMemo(
    () =>
      createListCollection({
        items: options,
        itemToValue: (item) => item.value,
        itemToString: (item) => item.label,
        isItemDisabled: (item) => Boolean(item.disabled),
      }),
    [options],
  );
}

/** Options in declaration order, with group headings inserted. */
function useGrouped<T extends string>(options: DropdownOption<T>[]) {
  return useMemo(() => {
    const rows: ({ kind: 'group'; label: string } | { kind: 'option'; option: DropdownOption<T> })[] =
      [];
    let current: string | undefined;

    for (const option of options) {
      if (option.group && option.group !== current) {
        rows.push({ kind: 'group', label: option.group });
        current = option.group;
      }
      rows.push({ kind: 'option', option });
    }
    return rows;
  }, [options]);
}

const controlClasses =
  'flex min-h-11 w-full items-center gap-2 rounded-xl border bg-surface px-3 text-left text-sm ' +
  'transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';

function controlTone(invalid?: boolean) {
  return invalid
    ? 'border-danger hover:border-danger'
    : 'border-line hover:border-line-strong data-[state=open]:border-accent';
}

/**
 * The floating menu.
 *
 * The entrance animation is opacity-only, deliberately. The positioning engine
 * places this element with a `transform`, so an entrance animation that also
 * animates `transform` — especially with a fill mode that persists the final
 * keyframe — is competing for the same property as the thing deciding where the
 * menu goes. Fading in cannot collide with that.
 */
const menuClasses =
  'z-[80] overflow-hidden rounded-xl border border-line bg-surface shadow-card ' +
  'motion-safe:transition-opacity motion-safe:duration-150 ' +
  'data-[state=open]:opacity-100 data-[state=closed]:opacity-0';

function Row({
  option,
  selected,
  active,
  renderOption,
  multiple,
}: {
  option: DropdownOption<string>;
  selected: boolean;
  active: boolean;
  renderOption?: (option: DropdownOption<never>) => ReactNode;
  multiple?: boolean;
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
      {active ? <span className="sr-only">(highlighted)</span> : null}
    </span>
  );
}

const itemClasses =
  'flex cursor-pointer items-center rounded-lg px-2.5 py-2 text-sm outline-none ' +
  'data-[highlighted]:bg-sunken data-[state=checked]:text-text ' +
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40';

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
  /** The id of the control the label names. */
  controlId: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* A real label, associated with the control — clicking it focuses the
          dropdown, and a screen reader announces the two together. */}
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

/**
 * The scrolling list. Windowed above a threshold so a thousand-option field
 * stays responsive — below it, plain rendering keeps group headings and
 * variable row heights simple.
 */
function OptionList<T extends string>({
  rows,
  renderRow,
  hasDescriptions,
}: {
  rows: ReturnType<typeof useGrouped<T>>;
  renderRow: (row: ReturnType<typeof useGrouped<T>>[number], index: number) => ReactNode;
  hasDescriptions: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualize = rows.length > VIRTUALIZE_ABOVE;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (hasDescriptions ? ROW_HEIGHT_WITH_DESCRIPTION : ROW_HEIGHT),
    overscan: 8,
    enabled: virtualize,
  });

  if (!virtualize) {
    return (
      <div ref={parentRef} className="max-h-72 overflow-y-auto p-1.5">
        {rows.map(renderRow)}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="max-h-72 overflow-y-auto p-1.5">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${item.start}px)`,
            }}
          >
            {renderRow(rows[item.index]!, item.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupHeading({ label }: { label: string }) {
  return (
    <div className="border-b border-line px-2.5 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted first:pt-1">
      {label}
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

// ------------------------------------------------------------------- select

function ComboboxDropdown<T extends string>(props: DropdownProps<T>) {
  const generatedId = useId();
  const controlId = props.id ?? generatedId;
  const collection = useCollection(props.options);
  const rows = useGrouped(props.options);
  const hasDescriptions = props.options.some((option) => option.description);

  const values = props.multiple ? props.value : props.value === null ? [] : [props.value];
  const selected = props.options.filter((option) => values.includes(option.value));

  return (
    <FieldShell
      label={props.label}
      hint={props.hint}
      error={props.error}
      invalid={props.invalid}
      className={props.className}
      controlId={controlId}
    >
      <Combobox.Root
        collection={collection}
        value={values}
        multiple={props.multiple}
        disabled={props.disabled}
        readOnly={props.readOnly}
        invalid={props.invalid || Boolean(props.error)}
        openOnClick
        loopFocus
        // Keep the query when picking from a multi-select, so a visitor can
        // tick several matches of one search without retyping it.
        selectionBehavior={props.multiple ? 'preserve' : 'replace'}
        closeOnSelect={!props.multiple}
        positioning={{ sameWidth: true, gutter: 6, flip: true, strategy: 'fixed' }}
        onValueChange={(details) => {
          if (props.multiple) props.onChange(details.value as T[]);
          else props.onChange((details.value[0] as T) ?? null);
        }}
        onInputValueChange={(details) => props.onSearch?.(details.inputValue)}
      >
        <Combobox.Control
          className={cn(controlClasses, controlTone(props.invalid || Boolean(props.error)))}
        >
          {props.multiple && selected.length > 0 ? (
            <span className="flex shrink-0 flex-wrap items-center gap-1">
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
          ) : null}

          <Combobox.Input
            id={controlId}
            name={props.name}
            placeholder={props.placeholder ?? 'Search…'}
            className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-muted"
          />

          {props.clearable && selected.length > 0 ? (
            <Combobox.ClearTrigger
              aria-label="Clear selection"
              className="shrink-0 rounded p-0.5 text-muted hover:text-text"
            >
              <Icon name="close" size={16} />
            </Combobox.ClearTrigger>
          ) : null}

          <Combobox.Trigger
            aria-label="Show options"
            className="shrink-0 text-muted transition-transform data-[state=open]:rotate-180"
          >
            <Icon name="chevronDown" size={18} />
          </Combobox.Trigger>
        </Combobox.Control>

        <Portal>
          <Combobox.Positioner>
            <Combobox.Content className={menuClasses}>
              {props.loading || props.options.length === 0 ? (
                <Status loading={props.loading} empty={props.emptyMessage ?? 'No matches'} />
              ) : (
                <OptionList
                  rows={rows}
                  hasDescriptions={hasDescriptions}
                  renderRow={(row, index) =>
                    row.kind === 'group' ? (
                      <GroupHeading key={`g-${index}`} label={row.label} />
                    ) : (
                      <Combobox.Item
                        key={row.option.value}
                        item={row.option}
                        className={itemClasses}
                      >
                        <Row
                          option={row.option as DropdownOption<string>}
                          selected={values.includes(row.option.value)}
                          active={false}
                          multiple={props.multiple}
                          renderOption={
                            props.renderOption as
                              | ((option: DropdownOption<never>) => ReactNode)
                              | undefined
                          }
                        />
                      </Combobox.Item>
                    )
                  }
                />
              )}
            </Combobox.Content>
          </Combobox.Positioner>
        </Portal>
      </Combobox.Root>
    </FieldShell>
  );
}
