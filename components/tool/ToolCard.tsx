import Link from 'next/link';

import { cn } from '@/lib/cn';
import type { Tool } from '@/lib/tools';

import { ToolIcon } from './ToolIcon';

/**
 * The one card used for every tool link — homepage, category page, related.
 *
 * The whole card is a single anchor rather than a div containing one, so the
 * hit target is the card and there is exactly one thing in the tab order per
 * tool. The hover treatment moves the icon tile and the arrow, not the card
 * itself: a grid where every cell lifts under the cursor reads as fidgety, and
 * transform-only changes stay off the main thread.
 */
export function ToolCard({
  tool,
  className,
  style,
}: {
  tool: Tool;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <li className={className} style={style}>
      <Link
        href={tool.href}
        className={cn(
          'group flex h-full flex-col rounded-2xl border border-line bg-surface p-5',
          'transition-colors duration-200 hover:border-accent/60 hover:bg-accent-soft/60',
          'focus-visible:border-accent',
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span
            className={cn(
              'grid size-10 place-items-center rounded-xl border border-line bg-sunken text-muted',
              'transition-[color,background-color,border-color,transform] duration-200',
              'group-hover:-translate-y-0.5 group-hover:border-accent/40 group-hover:bg-surface group-hover:text-accent',
            )}
          >
            <ToolIcon href={tool.href} />
          </span>

          {tool.status === 'soon' ? (
            <span className="shrink-0 rounded-full border border-line bg-sunken px-2 py-0.5 text-[11px] font-medium text-muted">
              Coming soon
            </span>
          ) : null}
        </span>

        <span className="mt-4 font-display text-base font-semibold">{tool.name}</span>
        <span className="mt-1.5 text-pretty text-sm text-muted">{tool.summary}</span>

        <span className="mt-4 flex items-center gap-1 text-sm font-medium text-accent">
          {tool.status === 'live' ? 'Open tool' : 'Read more'}
          <span
            aria-hidden="true"
            className="inline-block transition-transform duration-200 group-hover:translate-x-1"
          >
            →
          </span>
        </span>
      </Link>
    </li>
  );
}
