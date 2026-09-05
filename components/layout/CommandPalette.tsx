'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { ToolIcon } from '@/components/tool/ToolIcon';
import { cn } from '@/lib/cn';
import { getCategory, tools } from '@/lib/tools';
import { Icon } from '@/components/ui/Icon';

/**
 * Search across every tool, opened with ⌘K / Ctrl-K or the header button.
 *
 * Past a couple of dozen tools the category nav stopped being enough: knowing you want
 * "the one that makes a PDF smaller" should not require guessing which of five
 * sections it lives in. Matching runs over the tool's name, summary and its
 * SEO keywords, so "shrink", "reduce size" and "compress" all find the same
 * page even though only one of those words is in its title.
 */

type Match = {
  href: string;
  name: string;
  summary: string;
  category: string;
  score: number;
};

const SEARCHABLE = tools.map((tool) => ({
  href: tool.href,
  name: tool.name,
  summary: tool.summary,
  category: getCategory(tool.category).label,
  haystack: [tool.name, tool.summary, tool.h1, ...tool.keywords].join(' ').toLowerCase(),
}));

function search(query: string): Match[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return SEARCHABLE.slice(0, 8).map((entry) => ({ ...entry, score: 0 }));
  }

  const results: Match[] = [];

  for (const entry of SEARCHABLE) {
    let score = 0;
    let matchedAll = true;

    for (const term of terms) {
      const name = entry.name.toLowerCase();
      if (name.startsWith(term)) score += 6;
      else if (name.includes(term)) score += 4;
      else if (entry.haystack.includes(term)) score += 1;
      else {
        matchedAll = false;
        break;
      }
    }

    if (matchedAll) results.push({ ...entry, score });
  }

  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 10);
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const matches = useMemo(() => search(query), [query]);

  // Reset per opening, so it never reopens showing the last search.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(timer);
  }, [open]);

  // The palette is a modal, so the page behind it must not scroll under it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes from anywhere, not only while the input holds focus. The
  // keydown handler below sits on the input, so clicking a result or the
  // backdrop used to leave the palette with no keyboard way out.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % Math.max(1, matches.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current - 1 + matches.length) % Math.max(1, matches.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = matches[active];
      if (target) go(target.href);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* The backdrop covers the viewport and sits above this container, so a
          click outside the panel lands here rather than on the parent. It
          therefore has to close the palette itself - testing target against
          currentTarget on the container alone never fired. */}
      <div
        className="fixed inset-0 bg-canvas/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search tools"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <SearchGlyph className="size-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={`Search ${tools.length} tools — try “shrink”, “sign”, “resize”…`}
            aria-label="Search tools"
            aria-controls={listId}
            aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
            className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted"
          />
          <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[11px] text-muted sm:block">
            Esc
          </kbd>
        </div>

        <ul id={listId} role="listbox" aria-label="Tools" className="max-h-80 overflow-y-auto p-2">
          {matches.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted">
              Nothing matches “{query}”.
            </li>
          ) : (
            matches.map((match, index) => (
              <li key={match.href}>
                <button
                  type="button"
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(match.href)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                    index === active ? 'bg-sunken' : 'hover:bg-sunken',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-lg border border-line',
                      index === active ? 'border-accent/40 text-accent' : 'text-muted',
                    )}
                  >
                    <ToolIcon href={match.href} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{match.name}</span>
                    <span className="block truncate text-xs text-muted">{match.summary}</span>
                  </span>
                  <span className="hidden shrink-0 text-[11px] text-muted sm:block">
                    {match.category}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

/** Wires up ⌘K / Ctrl-K and the "/" shortcut, and owns the open state. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }

      // "/" is the other convention, but only when it is not being typed into
      // a field — several tools here have text inputs that want a slash.
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return { open, setOpen };
}

export function SearchGlyph({ className }: { className?: string }) {
  return <Icon name="search" size={18} className={className} />;
}
