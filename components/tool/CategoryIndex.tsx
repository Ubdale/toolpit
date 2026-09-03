import { Container } from '@/components/layout/Container';
import { breadcrumbJsonLd, itemListJsonLd, jsonLdProps } from '@/lib/jsonld';
import { site } from '@/lib/site';
import { getCategory, toolsIn, type CategoryId } from '@/lib/tools';

import { Breadcrumbs } from './Breadcrumbs';
import { PrivacyBadge } from './PrivacyBadge';
import { ToolCard } from './ToolCard';

/** Category landing page: the hub each tool page links back up to. */
export function CategoryIndex({
  id,
  h1,
  intro,
}: {
  id: CategoryId;
  h1: string;
  intro: string;
}) {
  const category = getCategory(id);
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: category.label, path: `/${category.segment}` },
  ];

  return (
    <>
      <script {...jsonLdProps(breadcrumbJsonLd(crumbs))} />
      <script {...jsonLdProps(itemListJsonLd(toolsIn(id), category.label))} />

      <Container className="py-10 sm:py-14">
        <Breadcrumbs crumbs={crumbs} />

        <div className="mt-6 max-w-3xl">
          <h1 className="text-title">{h1}</h1>
          <p className="mt-4 text-lg text-muted">{intro}</p>
          <PrivacyBadge className="mt-5" />
        </div>

        <h2 className="sr-only">{category.label}</h2>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {toolsIn(id).map((tool) => (
            <ToolCard key={tool.href} tool={tool} />
          ))}
        </ul>

        <p className="mt-10 max-w-3xl text-sm text-muted">{site.promise} Every tool on this page
          runs in your browser using WebAssembly, so your files are never uploaded, never stored,
          and never seen by us.</p>
      </Container>
    </>
  );
}
