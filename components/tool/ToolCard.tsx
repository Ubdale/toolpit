import Link from 'next/link';

import type { Tool } from '@/lib/tools';

/** The one card used for every tool link — homepage, category page, related. */
export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <li>
      <Link
        href={tool.href}
        className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-accent hover:bg-accent-soft"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="font-display text-base font-semibold">{tool.name}</span>
          {tool.status === 'soon' ? (
            <span className="shrink-0 rounded-full border border-line bg-sunken px-2 py-0.5 text-[11px] font-medium text-muted">
              Coming soon
            </span>
          ) : null}
        </span>
        <span className="mt-2 text-sm text-muted">{tool.summary}</span>
        <span className="mt-4 text-sm font-medium text-accent">
          {tool.status === 'live' ? 'Open tool' : 'Read more'}
          <span aria-hidden="true" className="ml-1 inline-block transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </span>
      </Link>
    </li>
  );
}
