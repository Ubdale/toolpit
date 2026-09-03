'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Button } from '@/components/ui/Button';
import { Dropzone } from '@/components/ui/Dropzone';
import { ErrorMessage, Field, RangeInput, Select } from '@/components/ui/Field';
import { ResultPanel } from '@/components/ui/ResultPanel';
import { stripExtension } from '@/lib/format';
import {
  annotationTools,
  applyAnnotations,
  nextAnnotationId,
  type Annotation,
  type AnnotationKind,
} from '@/lib/pdf/annotate';
import { findAt, translate } from '@/lib/pdf/hit';
import { renderPages, toPdfBlob } from '@/lib/pdf/operations';

import { EditorCanvas } from './EditorCanvas';
import { usePdfFiles } from './usePdfFiles';

type Tool = AnnotationKind | 'select';

type Draft =
  | { kind: 'none' }
  | { kind: 'draw'; id: string; originX: number; originY: number }
  | { kind: 'move'; id: string; startX: number; startY: number; original: Annotation }
  | { kind: 'ink'; id: string };

const PRESET_COLORS = ['#d1541f', '#b4291f', '#191712', '#14684d', '#2a78d6', '#ffd43b'];

export default function EditTool() {
  const { files, error, setError, isReading, add, clear } = usePdfFiles(false);
  const file = files[0];

  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState('#d1541f');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fontSize, setFontSize] = useState(14);
  const [filled, setFilled] = useState(false);
  const [opacity, setOpacity] = useState(1);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [future, setFuture] = useState<Annotation[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState<{ url: string; width: number; height: number } | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; substitutions: number } | null>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<Draft>({ kind: 'none' });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePoint = useRef<{ x: number; y: number } | null>(null);

  const selected = annotations.find((annotation) => annotation.id === selectedId) ?? null;

  // Render the current page at twice the zoom so the bitmap stays sharp when
  // the browser scales it down to the CSS size.
  useEffect(() => {
    if (!file) {
      setPage(null);
      return;
    }

    let cancelled = false;
    let url: string | null = null;

    renderPages(file.bytes, { scale: 2, format: 'image/png', pageIndices: [pageIndex] })
      .then(([rendered]) => {
        if (cancelled || !rendered) return;
        url = URL.createObjectURL(rendered.blob);
        setPage({ url, width: rendered.width / 2, height: rendered.height / 2 });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not render that page.');
        }
      });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, pageIndex, setError]);

  useEffect(
    () => () => {
      for (const url of Object.values(imageUrls)) URL.revokeObjectURL(url);
    },
    // Deliberately empty: this is the unmount sweep, and the map is read from
    // the closure at teardown rather than re-registered on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Every mutation goes through here, so undo is complete by construction. */
  const commit = useCallback((next: Annotation[] | ((current: Annotation[]) => Annotation[])) => {
    setAnnotations((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      setHistory((stack) => [...stack.slice(-49), current]);
      setFuture([]);
      return resolved;
    });
  }, []);

  function undo() {
    setHistory((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1]!;
      setFuture((forward) => [annotations, ...forward]);
      setAnnotations(previous);
      setSelectedId(null);
      return stack.slice(0, -1);
    });
  }

  function redo() {
    setFuture((forward) => {
      if (forward.length === 0) return forward;
      const [next, ...rest] = forward;
      setHistory((stack) => [...stack, annotations]);
      setAnnotations(next!);
      return rest;
    });
  }

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    commit((current) => current.filter((annotation) => annotation.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, commit]);

  // The shortcut handlers change identity every render, so they are kept in a
  // ref and the listener is registered once — re-registering a window listener
  // on every frame of a drag is pure waste.
  const shortcutsRef = useRef({ selectedId, removeSelected, undo, redo });
  shortcutsRef.current = { selectedId, removeSelected, undo, redo };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // Never steal a keystroke from a field the visitor is typing in.
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) {
        return;
      }

      const current = shortcutsRef.current;

      if ((event.key === 'Delete' || event.key === 'Backspace') && current.selectedId) {
        event.preventDefault();
        current.removeSelected();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) current.redo();
        else current.undo();
      }
      if (event.key === 'Escape') setSelectedId(null);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function pointFromEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = surfaceRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / zoom,
      y: (event.clientY - bounds.top) / zoom,
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!page) return;
    const point = pointFromEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === 'select') {
      const found = findAt(
        annotations.filter((annotation) => annotation.pageIndex === pageIndex),
        point.x,
        point.y,
      );
      setSelectedId(found?.id ?? null);
      if (found) {
        draftRef.current = {
          kind: 'move',
          id: found.id,
          startX: point.x,
          startY: point.y,
          original: found,
        };
      }
      return;
    }

    if (tool === 'image') {
      pendingImagePoint.current = point;
      imageInputRef.current?.click();
      return;
    }

    const id = nextAnnotationId();

    if (tool === 'text') {
      commit((current) => [
        ...current,
        {
          id,
          pageIndex,
          kind: 'text',
          x: point.x,
          y: point.y,
          width: Math.min(320, page.width - point.x - 20),
          text: '',
          size: fontSize,
          color,
          bold: false,
          italic: false,
          family: 'sans',
        },
      ]);
      setSelectedId(id);
      setTool('select');
      return;
    }

    if (tool === 'ink') {
      draftRef.current = { kind: 'ink', id };
      commit((current) => [
        ...current,
        { id, pageIndex, kind: 'ink', points: [point.x, point.y], color, strokeWidth },
      ]);
      setSelectedId(id);
      return;
    }

    if (tool === 'line') {
      draftRef.current = { kind: 'draw', id, originX: point.x, originY: point.y };
      commit((current) => [
        ...current,
        {
          id,
          pageIndex,
          kind: 'line',
          x1: point.x,
          y1: point.y,
          x2: point.x,
          y2: point.y,
          color,
          strokeWidth,
          arrow: true,
        },
      ]);
      setSelectedId(id);
      return;
    }

    draftRef.current = { kind: 'draw', id, originX: point.x, originY: point.y };
    commit((current) => [
      ...current,
      {
        id,
        pageIndex,
        kind: tool as 'rect' | 'ellipse' | 'highlight',
        x: point.x,
        y: point.y,
        width: 1,
        height: 1,
        color: tool === 'highlight' ? '#ffd43b' : color,
        filled: tool === 'highlight' ? true : filled,
        strokeWidth,
        opacity: tool === 'highlight' ? 0.4 : opacity,
      },
    ]);
    setSelectedId(id);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const draft = draftRef.current;
    if (draft.kind === 'none' || !page) return;

    const point = pointFromEvent(event);

    if (draft.kind === 'move') {
      const dx = point.x - draft.startX;
      const dy = point.y - draft.startY;
      setAnnotations((current) =>
        current.map((annotation) =>
          annotation.id === draft.id ? translate(draft.original, dx, dy) : annotation,
        ),
      );
      return;
    }

    setAnnotations((current) =>
      current.map((annotation) => {
        if (annotation.id !== draft.id) return annotation;

        if (draft.kind === 'ink' && annotation.kind === 'ink') {
          const last = annotation.points.length;
          const lastX = annotation.points[last - 2] ?? point.x;
          const lastY = annotation.points[last - 1] ?? point.y;
          // Drop points that barely moved, or a slow signature becomes tens of
          // thousands of segments in the output file.
          if (Math.hypot(point.x - lastX, point.y - lastY) < 1.2) return annotation;
          return { ...annotation, points: [...annotation.points, point.x, point.y] };
        }

        if (draft.kind !== 'draw') return annotation;

        if (annotation.kind === 'line') {
          return { ...annotation, x2: point.x, y2: point.y };
        }

        if (
          annotation.kind === 'rect' ||
          annotation.kind === 'ellipse' ||
          annotation.kind === 'highlight'
        ) {
          return {
            ...annotation,
            x: Math.min(draft.originX, point.x),
            y: Math.min(draft.originY, point.y),
            width: Math.abs(point.x - draft.originX),
            height: Math.abs(point.y - draft.originY),
          };
        }

        if (annotation.kind === 'text' || annotation.kind === 'image') {
          return annotation;
        }

        return annotation;
      }),
    );
  }

  function handlePointerUp() {
    const draft = draftRef.current;
    draftRef.current = { kind: 'none' };
    if (draft.kind === 'none' || draft.kind === 'move') return;

    // A click that never became a drag leaves a one-point mark behind; drop it.
    setAnnotations((current) =>
      current.filter((annotation) => {
        if (annotation.id !== draft.id) return true;
        if (annotation.kind === 'ink') return annotation.points.length >= 4;
        if (annotation.kind === 'line') {
          return Math.hypot(annotation.x2 - annotation.x1, annotation.y2 - annotation.y1) > 4;
        }
        if (
          annotation.kind === 'rect' ||
          annotation.kind === 'ellipse' ||
          annotation.kind === 'highlight'
        ) {
          return annotation.width > 3 && annotation.height > 3;
        }
        return true;
      }),
    );

    if (tool !== 'ink' && tool !== 'highlight') setTool('select');
  }

  async function placeImage(fileList: FileList | null) {
    const image = fileList?.[0];
    const point = pendingImagePoint.current;
    pendingImagePoint.current = null;
    if (!image || !point || !page) return;

    const isPng = image.type === 'image/png' || /\.png$/i.test(image.name);
    const isJpg = image.type === 'image/jpeg' || /\.jpe?g$/i.test(image.name);
    if (!isPng && !isJpg) {
      setError('Images placed on a page have to be a PNG or a JPG.');
      return;
    }

    const bytes = new Uint8Array(await image.arrayBuffer());
    const bitmap = await createImageBitmap(image);

    // Land it at a sensible size — a third of the page width — rather than at
    // whatever pixel dimensions a phone camera produced.
    const width = Math.min(bitmap.width, page.width / 3);
    const height = (bitmap.height / bitmap.width) * width;
    bitmap.close();

    const id = nextAnnotationId();
    setImageUrls((current) => ({ ...current, [id]: URL.createObjectURL(image) }));
    commit((current) => [
      ...current,
      {
        id,
        pageIndex,
        kind: 'image',
        x: point.x,
        y: point.y,
        width,
        height,
        bytes,
        isPng,
        opacity: 1,
      },
    ]);
    setSelectedId(id);
    setTool('select');
  }

  function patchSelected(changes: Partial<Annotation>) {
    if (!selectedId) return;
    commit((current) =>
      current.map((annotation) =>
        annotation.id === selectedId ? ({ ...annotation, ...changes } as Annotation) : annotation,
      ),
    );
  }

  async function save() {
    if (!file) return;
    setError(null);
    setIsSaving(true);
    try {
      const { bytes, substitutions } = await applyAnnotations(file.bytes, annotations);
      setResult({ blob: toPdfBlob(bytes), substitutions });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the edited PDF.');
    } finally {
      setIsSaving(false);
    }
  }

  function reset() {
    clear();
    setResult(null);
    setAnnotations([]);
    setHistory([]);
    setFuture([]);
    setSelectedId(null);
    setPageIndex(0);
  }

  if (result && file) {
    const filename = `${stripExtension(file.name)}-edited.pdf`;
    return (
      <ResultPanel
        filename={filename}
        size={result.blob.size}
        detail={`${annotations.length} edit${annotations.length === 1 ? '' : 's'} applied`}
        target={{ blob: result.blob, filename }}
        onReset={reset}
      >
        {result.substitutions > 0 ? (
          <p className="text-sm text-muted">
            {result.substitutions} character{result.substitutions === 1 ? '' : 's'} had to be
            approximated to fit the PDF font.
          </p>
        ) : null}
      </ResultPanel>
    );
  }

  if (!file) {
    return (
      <ToolSurface>
        <Dropzone
          onFiles={add}
          accept="application/pdf"
          label="Drop a PDF here, or click to choose one"
          hint="The document is opened in this tab. It is never uploaded, including the parts you sign."
          disabled={isReading}
        />
        <ErrorMessage>{error}</ErrorMessage>
      </ToolSurface>
    );
  }

  const activeTool = annotationTools.find((entry) => entry.kind === tool);
  const onPage = annotations.filter((annotation) => annotation.pageIndex === pageIndex);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <ToolSurface className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <ToolButton active={tool === 'select'} onClick={() => setTool('select')}>
            Select
          </ToolButton>
          {annotationTools.map((entry) => (
            <ToolButton
              key={entry.kind}
              active={tool === entry.kind}
              onClick={() => setTool(entry.kind)}
            >
              {entry.label}
            </ToolButton>
          ))}

          <span className="ml-auto flex items-center gap-1">
            <ToolButton onClick={undo} disabled={history.length === 0}>
              Undo
            </ToolButton>
            <ToolButton onClick={redo} disabled={future.length === 0}>
              Redo
            </ToolButton>
          </span>
        </div>

        <p className="text-xs text-muted">
          {activeTool?.hint ?? 'Click a mark to select it, then drag to move or edit it on the right.'}
        </p>

        <div className="flex items-center justify-between gap-3 border-y border-line py-2">
          <div className="flex items-center gap-1">
            <ToolButton onClick={() => setPageIndex(pageIndex - 1)} disabled={pageIndex === 0}>
              ←
            </ToolButton>
            <span className="min-w-24 text-center text-xs text-muted tabular-nums">
              Page {pageIndex + 1} of {file.pageCount}
            </span>
            <ToolButton
              onClick={() => setPageIndex(pageIndex + 1)}
              disabled={pageIndex >= file.pageCount - 1}
            >
              →
            </ToolButton>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted tabular-nums">{Math.round(zoom * 100)}%</span>
            <ToolButton onClick={() => setZoom((value) => Math.max(0.35, value - 0.15))}>
              −
            </ToolButton>
            <ToolButton onClick={() => setZoom((value) => Math.min(2.5, value + 0.15))}>+</ToolButton>
          </div>
        </div>

        <div className="max-h-[42rem] overflow-auto rounded-xl bg-sunken p-4">
          <div ref={surfaceRef} className="mx-auto w-fit">
            <EditorCanvas
              pageUrl={page?.url ?? null}
              pageWidth={page?.width ?? 595}
              pageHeight={page?.height ?? 842}
              zoom={zoom}
              annotations={onPage}
              selectedId={selectedId}
              imageUrls={imageUrls}
              cursor={tool === 'select' ? (selectedId ? 'move' : 'default') : 'crosshair'}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </div>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={(event) => {
            void placeImage(event.target.files);
            event.target.value = '';
          }}
        />

        <ErrorMessage>{error}</ErrorMessage>
      </ToolSurface>

      <ToolSurface className="flex flex-col gap-5">
        <ToolSectionHeading>{selected ? 'Selected mark' : 'Defaults'}</ToolSectionHeading>

        {selected?.kind === 'text' ? (
          <>
            <Field label="Text">
              {({ id }) => (
                <textarea
                  id={id}
                  rows={4}
                  autoFocus
                  value={selected.text}
                  onChange={(event) => patchSelected({ text: event.target.value })}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm transition-colors hover:border-line-strong focus:border-accent"
                />
              )}
            </Field>

            <Field label="Typeface">
              {({ id }) => (
                <Select
                  id={id}
                  value={selected.family}
                  onChange={(event) =>
                    patchSelected({ family: event.target.value as 'sans' | 'serif' | 'mono' })
                  }
                >
                  <option value="sans">Sans — Helvetica</option>
                  <option value="serif">Serif — Times</option>
                  <option value="mono">Monospace — Courier</option>
                </Select>
              )}
            </Field>

            <div className="flex gap-2">
              <ToolButton
                active={selected.bold}
                onClick={() => patchSelected({ bold: !selected.bold })}
              >
                Bold
              </ToolButton>
              <ToolButton
                active={selected.italic}
                onClick={() => patchSelected({ italic: !selected.italic })}
              >
                Italic
              </ToolButton>
            </div>

            <Field label={`Size — ${Math.round(selected.size)}pt`}>
              {({ id }) => (
                <RangeInput
                  id={id}
                  min={6}
                  max={48}
                  value={selected.size}
                  onChange={(event) => patchSelected({ size: Number(event.target.value) })}
                />
              )}
            </Field>
          </>
        ) : null}

        {selected && selected.kind !== 'text' && selected.kind !== 'image' ? (
          <>
            {'strokeWidth' in selected ? (
              <Field label={`Thickness — ${selected.strokeWidth}pt`}>
                {({ id }) => (
                  <RangeInput
                    id={id}
                    min={1}
                    max={12}
                    value={selected.strokeWidth}
                    onChange={(event) => patchSelected({ strokeWidth: Number(event.target.value) })}
                  />
                )}
              </Field>
            ) : null}

            {'filled' in selected ? (
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.filled}
                  onChange={(event) => patchSelected({ filled: event.target.checked })}
                  className="size-4 accent-accent"
                />
                Fill the shape
                {selected.filled ? (
                  <span className="text-xs text-muted">— a filled white box hides what is under it</span>
                ) : null}
              </label>
            ) : null}

            {'arrow' in selected ? (
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.arrow}
                  onChange={(event) => patchSelected({ arrow: event.target.checked })}
                  className="size-4 accent-accent"
                />
                Arrowhead
              </label>
            ) : null}

            {'opacity' in selected ? (
              <Field label={`Opacity — ${Math.round(selected.opacity * 100)}%`}>
                {({ id }) => (
                  <RangeInput
                    id={id}
                    min={10}
                    max={100}
                    value={selected.opacity * 100}
                    onChange={(event) =>
                      patchSelected({ opacity: Number(event.target.value) / 100 })
                    }
                  />
                )}
              </Field>
            ) : null}
          </>
        ) : null}

        {selected?.kind === 'image' ? (
          <>
            <Field label={`Width — ${Math.round(selected.width)}pt`}>
              {({ id }) => (
                <RangeInput
                  id={id}
                  min={20}
                  max={Math.round(page?.width ?? 595)}
                  value={selected.width}
                  onChange={(event) => {
                    const width = Number(event.target.value);
                    patchSelected({
                      width,
                      height: (selected.height / selected.width) * width,
                    });
                  }}
                />
              )}
            </Field>
            <Field label={`Opacity — ${Math.round(selected.opacity * 100)}%`}>
              {({ id }) => (
                <RangeInput
                  id={id}
                  min={10}
                  max={100}
                  value={selected.opacity * 100}
                  onChange={(event) => patchSelected({ opacity: Number(event.target.value) / 100 })}
                />
              )}
            </Field>
          </>
        ) : null}

        {(!selected || selected.kind !== 'image') && (
          <Field label="Colour">
            {({ id }) => (
              <div className="flex flex-col gap-2">
                <input
                  id={id}
                  type="color"
                  value={selected && 'color' in selected ? selected.color : color}
                  onChange={(event) => {
                    setColor(event.target.value);
                    if (selected) patchSelected({ color: event.target.value });
                  }}
                  className="h-11 w-full cursor-pointer rounded-xl border border-line bg-surface p-1"
                />
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      aria-label={`Use ${preset}`}
                      onClick={() => {
                        setColor(preset);
                        if (selected) patchSelected({ color: preset });
                      }}
                      style={{ background: preset }}
                      className="size-7 rounded-lg border border-line"
                    />
                  ))}
                </div>
              </div>
            )}
          </Field>
        )}

        {!selected ? (
          <>
            <Field label={`Line thickness — ${strokeWidth}pt`}>
              {({ id }) => (
                <RangeInput
                  id={id}
                  min={1}
                  max={12}
                  value={strokeWidth}
                  onChange={(event) => setStrokeWidth(Number(event.target.value))}
                />
              )}
            </Field>
            <Field label={`Text size — ${fontSize}pt`}>
              {({ id }) => (
                <RangeInput
                  id={id}
                  min={6}
                  max={48}
                  value={fontSize}
                  onChange={(event) => setFontSize(Number(event.target.value))}
                />
              )}
            </Field>
            <Field label={`Shape opacity — ${Math.round(opacity * 100)}%`}>
              {({ id }) => (
                <RangeInput
                  id={id}
                  min={10}
                  max={100}
                  value={opacity * 100}
                  onChange={(event) => setOpacity(Number(event.target.value) / 100)}
                />
              )}
            </Field>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={filled}
                onChange={(event) => setFilled(event.target.checked)}
                className="size-4 accent-accent"
              />
              Fill new shapes
            </label>
          </>
        ) : null}

        {selected ? (
          <Button variant="danger" onClick={removeSelected}>
            Delete this mark
          </Button>
        ) : null}

        <div className="border-t border-line pt-4 text-xs text-muted">
          {annotations.length} mark{annotations.length === 1 ? '' : 's'} across the document ·{' '}
          {onPage.length} on this page
        </div>

        <Button onClick={save} disabled={isSaving || annotations.length === 0} size="lg">
          {isSaving ? 'Saving…' : 'Save the edited PDF'}
        </Button>
        <Button variant="ghost" onClick={reset}>
          Choose a different PDF
        </Button>
      </ToolSurface>
    </div>
  );
}

function ToolButton({
  children,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        active
          ? 'border-accent bg-accent-soft text-text'
          : 'border-line text-muted hover:border-line-strong hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}
