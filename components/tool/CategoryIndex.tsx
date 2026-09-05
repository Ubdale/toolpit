import Link from 'next/link';

import { Container } from '@/components/layout/Container';
import { categoryGuides } from '@/lib/category-guides';
import { breadcrumbJsonLd, faqJsonLd, itemListJsonLd, jsonLdProps } from '@/lib/jsonld';
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
  const guide = categoryGuides[id];
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: category.label, path: `/${category.segment}` },
  ];

  return (
    <>
      <script {...jsonLdProps(breadcrumbJsonLd(crumbs))} />
      <script {...jsonLdProps(itemListJsonLd(toolsIn(id), category.label))} />
      {/* Describes the questions rendered further down this page, never
          answers that exist only in the markup. */}
      <script {...jsonLdProps(faqJsonLd(guide.faqs))} />

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

        {/* ------------------------------------------------------ chooser */}
        <section className="mt-16 max-w-3xl">
          <h2 className="text-heading">{guide.chooserHeading}</h2>
          <p className="mt-3 text-muted">
            A grid of names does not help much when two of them sound alike. Find the row that
            matches what you are actually trying to do.
          </p>

          <ul className="mt-6 flex flex-col gap-3">
            {guide.chooser.map((row) => (
              <li
                key={row.href}
                className="rounded-2xl border border-line bg-surface p-4 sm:p-5"
              >
                <p className="font-medium">{row.need}</p>
                <p className="mt-1.5 text-sm text-muted">
                  <Link href={row.href} className="font-medium text-accent hover:underline">
                    {row.label}
                  </Link>
                  {' — '}
                  {row.why}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* --------------------------------------------------- explainers */}
        <section className="mt-14 max-w-3xl">
          {guide.sections.map((section) => (
            <div key={section.heading} className="mt-10 first:mt-0">
              <h2 className="text-heading">{section.heading}</h2>
              <p className="mt-3 text-muted">{section.body}</p>
            </div>
          ))}
        </section>

        {/* --------------------------------------------------------- FAQs */}
        <section className="mt-14 max-w-3xl">
          <h2 className="text-heading">Questions</h2>
          <div className="mt-5 flex flex-col gap-3">
            {guide.faqs.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-2xl border border-line bg-surface p-4 sm:p-5"
              >
                <summary className="cursor-pointer list-none font-medium">
                  {faq.question}
                </summary>
                <p className="mt-3 text-sm text-muted">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <p className="mt-12 max-w-3xl text-sm text-muted">
          {site.promise} Every tool on this page runs privately in your browser using
          WebAssembly, so your files are never uploaded, never stored, and never seen by us.
        </p>
      </Container>
    </>
  );
}
