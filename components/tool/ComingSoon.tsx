import { site } from '@/lib/site';
import { getTool } from '@/lib/tools';

/**
 * Placeholder state for tools that are scaffolded but not built yet. The page
 * still ships full metadata, JSON-LD and real copy, so it is a genuine landing
 * page from day one rather than a thin stub.
 */
export function ComingSoon({
  href,
  plan,
}: {
  href: string;
  /** Two or three sentences on how this tool will work, for real page depth. */
  plan: string;
}) {
  const tool = getTool(href);

  return (
    <section
      aria-label={`${tool.name} status`}
      className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8"
    >
      <p className="inline-flex items-center gap-2 rounded-full border border-line bg-sunken px-3 py-1.5 text-xs font-medium text-muted">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
        In development
      </p>

      <p className="mt-4 max-w-2xl text-base">{site.comingSoon}</p>
      <p className="mt-4 max-w-2xl text-sm text-muted">{plan}</p>

      <h2 className="mt-8 font-display text-heading">What you can use today</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        The PDF toolkit is finished and free to use right now — merge, split, reorder, rotate,
        compress, and convert to and from images, all without an upload. The related tools below
        are a good place to start.
      </p>
    </section>
  );
}
