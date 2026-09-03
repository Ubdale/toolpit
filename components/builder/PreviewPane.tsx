'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

/**
 * The shared live-preview machinery.
 *
 * Every editor in the app renders its result as it is edited, so this holds the
 * three things that behaviour needs and that were otherwise going to be written
 * once per builder:
 *
 *  - **Debounce.** Recomputing on every keystroke of a filter value is wasted
 *    work; recomputing only on blur feels dead. A short trailing debounce gives
 *    the responsiveness without the churn.
 *  - **A stale flag.** While a recompute is pending the previous result stays
 *    on screen, dimmed, rather than blanking — a preview that empties itself
 *    between keystrokes is worse than one that lags slightly.
 *  - **Invalid configurations shown, not thrown.** A half-built config is the
 *    normal state of an editor. `validate` turns that into a message inside the
 *    pane instead of an error boundary.
 */

export type PreviewState<T> = {
  value: T | null;
  problem: string | null;
  stale: boolean;
};

export function useLivePreview<Config, Result>({
  config,
  compute,
  validate,
  delay = 220,
}: {
  config: Config;
  compute: (config: Config) => Result;
  /** Returns a message when the config cannot be rendered yet. */
  validate?: (config: Config) => string | null;
  delay?: number;
}): PreviewState<Result> {
  const [state, setState] = useState<PreviewState<Result>>({
    value: null,
    problem: null,
    stale: true,
  });

  // Held in refs so changing a callback identity does not restart the timer.
  const computeRef = useRef(compute);
  const validateRef = useRef(validate);
  computeRef.current = compute;
  validateRef.current = validate;

  useEffect(() => {
    setState((current) => ({ ...current, stale: true }));

    const timer = setTimeout(() => {
      const problem = validateRef.current?.(config) ?? null;
      if (problem) {
        setState({ value: null, problem, stale: false });
        return;
      }
      try {
        setState({ value: computeRef.current(config), problem: null, stale: false });
      } catch (cause) {
        setState({
          value: null,
          problem: cause instanceof Error ? cause.message : 'This configuration could not be rendered.',
          stale: false,
        });
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [config, delay]);

  return state;
}

/**
 * The pane itself: resizable, collapsible, and honest about what it is showing.
 */
export function PreviewPane({
  title,
  children,
  problem,
  stale,
  actions,
  note,
  className,
  minHeight = 320,
}: {
  title: string;
  children: ReactNode;
  problem?: string | null;
  stale?: boolean;
  actions?: ReactNode;
  /** e.g. "Previewing the first 5,000 rows". */
  note?: string;
  className?: string;
  minHeight?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [height, setHeight] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setHeight(Math.max(160, drag.startHeight + (event.clientY - drag.startY)));
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }, [onPointerMove]);

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    },
    [onPointerMove, onPointerUp],
  );

  return (
    <section
      aria-label={title}
      className={cn('flex flex-col rounded-2xl border border-line bg-surface', className)}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          className="flex items-center gap-1.5 text-sm font-medium"
        >
          <Icon
            name="chevronDown"
            size={18}
            className={cn('text-muted transition-transform', collapsed && '-rotate-90')}
          />
          {title}
        </button>

        {stale ? (
          <span className="flex items-center gap-1.5 text-xs text-muted" role="status">
            <Icon name="refresh" size={14} className="motion-safe:animate-spin" />
            Updating
          </span>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>
      </header>

      {collapsed ? null : (
        <>
          <div
            ref={bodyRef}
            className={cn(
              'relative overflow-auto p-4 transition-opacity',
              stale && 'opacity-60',
            )}
            style={{ height: height ?? undefined, minHeight }}
          >
            {problem ? (
              <div className="grid h-full min-h-40 place-items-center">
                <p className="flex max-w-sm flex-col items-center gap-2 text-center text-sm text-muted">
                  <Icon name="info" size={22} />
                  {problem}
                </p>
              </div>
            ) : (
              children
            )}
          </div>

          {note ? (
            <p className="border-t border-line px-4 py-2 text-xs text-muted">{note}</p>
          ) : null}

          {/* A grab strip rather than a CSS resize corner, so it works the same
              on touch and can carry a keyboard affordance. */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize the preview"
            tabIndex={0}
            onPointerDown={(event) => {
              dragRef.current = {
                startY: event.clientY,
                startHeight: bodyRef.current?.offsetHeight ?? minHeight,
              };
              window.addEventListener('pointermove', onPointerMove);
              window.addEventListener('pointerup', onPointerUp);
            }}
            onKeyDown={(event) => {
              const current = height ?? bodyRef.current?.offsetHeight ?? minHeight;
              if (event.key === 'ArrowDown') setHeight(current + 32);
              if (event.key === 'ArrowUp') setHeight(Math.max(160, current - 32));
            }}
            className="group flex h-3 cursor-ns-resize items-center justify-center rounded-b-2xl border-t border-line hover:bg-sunken focus-visible:bg-sunken"
          >
            <span className="h-0.5 w-8 rounded-full bg-line-strong group-hover:bg-accent" />
          </div>
        </>
      )}
    </section>
  );
}

/** Save / load / duplicate, shared by both builders. */
export function TemplateBar({
  templates,
  activeId,
  onLoad,
  onSave,
  onDuplicate,
  onDelete,
  saving,
}: {
  templates: { id: string; name: string; savedAt: string }[];
  activeId: string | null;
  onLoad: (id: string) => void;
  onSave: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  saving?: boolean;
}) {
  const [name, setName] = useState('');

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-40 flex-1 flex-col gap-1.5">
        <span className="text-sm font-medium">Template name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Monthly revenue by region"
          className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm transition-colors hover:border-line-strong focus:border-accent"
        />
      </label>

      <Button onClick={() => onSave(name)} disabled={saving}>
        <Icon name="save" size={16} />
        Save
      </Button>

      {activeId ? (
        <>
          <Button variant="secondary" onClick={onDuplicate}>
            <Icon name="copy" size={16} />
            Duplicate
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <Icon name="delete" size={16} />
            Delete
          </Button>
        </>
      ) : null}

      {templates.length > 0 ? (
        <div className="flex w-full flex-wrap gap-1.5 pt-1">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onLoad(template.id)}
              aria-pressed={template.id === activeId}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-xs transition-colors',
                template.id === activeId
                  ? 'border-accent bg-accent-soft'
                  : 'border-line text-muted hover:border-line-strong hover:text-text',
              )}
            >
              {template.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
