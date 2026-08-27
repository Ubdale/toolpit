import { relatedTools } from '@/lib/tools';

import { ToolCard } from './ToolCard';

/**
 * Cross-links on every tool page. Beyond being useful, this is what turns a set
 * of standalone landing pages into a crawlable graph.
 */
export function RelatedTools({ href }: { href: string }) {
  const related = relatedTools(href);

  return (
    <section aria-labelledby="related-tools" className="mt-16">
      <h2 id="related-tools" className="font-display text-heading">
        Related tools
      </h2>
      <p className="mt-2 text-sm text-muted">
        Every one of these runs in your browser too — no upload, no signup, no watermark.
      </p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {related.map((tool) => (
          <ToolCard key={tool.href} tool={tool} />
        ))}
      </ul>
    </section>
  );
}
