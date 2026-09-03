'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { SearchGlyph } from '@/components/layout/CommandPalette';
import { cn } from '@/lib/cn';
import { categories, tools, type CategoryId } from '@/lib/tools';

import { ToolCard } from './ToolCard';

/**
 * The homepage tool directory, with a filter.
 *
 * Twenty-six cards is more than a visitor will read, so this narrows them —
 * but the unfiltered list is what renders on the server and what a crawler
 * sees, and the filter is applied on top in the browser. Filtering by hiding
 * rather than by fetching means the whole directory is in the HTML exactly once,
 * every tool stays crawlable, and the interaction costs no network at all.
 */

const HAYSTACKS = new Map(
  tools.map((tool) => [
    tool.href,
    [tool.name, tool.summary, tool.h1, ...tool.keywords].join(' ').toLowerCase(),
  ]),
);

export function ToolExplorer() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const visible = useMemo(() => {
    return tools.filter((tool) => {
      if (category !== 'all' && tool.category !== category) return false;
      if (terms.length === 0) return true;
      const haystack = HAYSTACKS.get(tool.href) ?? '';
      return terms.every((term) => haystack.includes(term));
    });
  }, [terms, category]);

  const groups = categories
    .map((entry) => ({ category: entry, matches: visible.filter((t) => t.category === entry.id) }))
    .filter((group) => group.matches.length > 0);

  return (
    <>
      <div className="mt-8 flex flex-col gap-4">
        <div className="relative">
          <SearchGlyph className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter tools — try “pdf”, “watermark”, “resize”…"
            aria-label="Filter tools"
            className={cn(
              'h-12 w-full rounded-xl border border-line bg-surface pl-11 pr-4 text-sm',
              'transition-colors hover:border-line-strong focus:border-accent',
            )}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip active={category === 'all'} onClick={() => setCategory('all')}>
            All {tools.length}
          </Chip>
          {categories.map((entry) => (
            <Chip
              key={entry.id}
              active={category === entry.id}
              onClick={() => setCategory(entry.id)}
            >
              {entry.label}
            </Chip>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="mt-12 rounded-2xl border border-line bg-surface p-8 text-center text-muted">
          No tool matches “{query}”.{' '}
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setCategory('all');
            }}
            className="font-medium text-accent underline underline-offset-2"
          >
            Clear the filter
          </button>
        </p>
      ) : (
        <div className="mt-10 flex flex-col gap-14">
          {groups.map(({ category: entry, matches }) => (
            <section key={entry.id} id={entry.segment} className="scroll-mt-28">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-display text-heading">{entry.label}</h3>
                <Link
                  href={`/${entry.segment}`}
                  className="text-sm font-medium text-accent hover:text-accent-hover"
                >
                  {entry.label} overview
                  <span aria-hidden="true"> →</span>
                </Link>
              </div>
              <p className="mt-2 max-w-2xl text-pretty text-sm text-muted">{entry.blurb}</p>

              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {matches.map((tool, index) => (
                  <ToolCard
                    key={tool.href}
                    tool={tool}
                    // A short, capped stagger: enough to read as one group
                    // arriving, not so much that the last card feels late.
                    className="motion-safe:animate-rise"
                    style={{ animationDelay: `${Math.min(index, 5) * 45}ms` }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-9 rounded-full border px-3.5 text-sm font-medium transition-colors',
        active
          ? 'border-accent bg-accent-soft text-text'
          : 'border-line text-muted hover:border-line-strong hover:text-text',
      )}
    >
      {children}
    </button>
  );
}
