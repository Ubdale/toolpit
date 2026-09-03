'use client';

import type { TextRun } from '@/lib/pdf/text-edit';

/**
 * The clickable overlay over the page's real text.
 *
 * One box per run of text that the document actually draws, positioned from the
 * content stream rather than guessed — so clicking a line selects that line, and
 * what you type replaces those exact glyphs.
 *
 * Edited runs are shown with their new text in place of the old, at the original
 * size and colour, and are marked when the replacement is wider than what it
 * replaced: PDF text has no reflow, so a longer line will run into whatever sits
 * beside it, and it is better to see that before saving than after.
 */
export function TextLayer({
  runs,
  edits,
  selectedId,
  zoom,
  onSelect,
}: {
  runs: TextRun[];
  edits: Map<string, string>;
  selectedId: string | null;
  zoom: number;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="absolute inset-0">
      {runs.map((run) => {
        const edited = edits.get(run.id);
        const changed = edited !== undefined && edited !== run.text;
        const selected = run.id === selectedId;

        return (
          <button
            key={run.id}
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect(run.id);
            }}
            title={run.text}
            style={{
              left: run.x * zoom,
              // The stored y is the baseline; the box is lifted by roughly the
              // ascender so it sits over the glyphs rather than under them.
              top: (run.y - run.fontSize * 0.82) * zoom,
              height: run.fontSize * 1.12 * zoom,
              minWidth: Math.max(run.width, run.fontSize) * zoom,
              transform: run.angle ? `rotate(${-run.angle}deg)` : undefined,
              transformOrigin: 'left bottom',
            }}
            className={`absolute cursor-text rounded-[3px] border text-left transition-colors ${
              selected
                ? 'border-accent bg-accent/15'
                : changed
                  ? 'border-vault/60 bg-vault/10'
                  : 'border-transparent bg-accent/5 hover:border-accent/50 hover:bg-accent/10'
            }`}
          >
            {changed ? (
              <span
                className="pointer-events-none absolute left-0 top-0 whitespace-pre"
                style={{
                  fontSize: run.fontSize * zoom,
                  lineHeight: 1.12,
                  color: run.color,
                  fontFamily:
                    run.family === 'serif'
                      ? "'Times New Roman', Times, serif"
                      : run.family === 'mono'
                        ? "'Courier New', Courier, monospace"
                        : 'Helvetica, Arial, sans-serif',
                  fontWeight: run.bold ? 700 : 400,
                  fontStyle: run.italic ? 'italic' : 'normal',
                  background: 'white',
                }}
              >
                {edited}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
