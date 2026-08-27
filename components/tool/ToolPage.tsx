import type { ReactNode } from 'react';

import { Container } from '@/components/layout/Container';
import { breadcrumbJsonLd, jsonLdProps, toolJsonLd } from '@/lib/jsonld';
import { site } from '@/lib/site';
import { getCategory, getTool } from '@/lib/tools';

import { Breadcrumbs } from './Breadcrumbs';
import { PrivacyBadge } from './PrivacyBadge';
import { RelatedTools } from './RelatedTools';

/**
 * The frame every tool drops into: breadcrumb trail, the page's single <h1>,
 * the SEO intro paragraph, the privacy badge, the tool itself, and the
 * related-tool cross-links — plus the WebApplication and BreadcrumbList
 * structured data. Individual tools only supply their UI.
 */
export function ToolPage({ href, children }: { href: string; children: ReactNode }) {
  const tool = getTool(href);
  const category = getCategory(tool.category);

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: category.label, path: `/${category.segment}` },
    { name: tool.name, path: tool.href },
  ];

  return (
    <>
      <script {...jsonLdProps(toolJsonLd(tool))} />
      <script {...jsonLdProps(breadcrumbJsonLd(crumbs))} />

      <Container className="py-10 sm:py-14">
        <Breadcrumbs crumbs={crumbs} />

        <div className="mt-6 max-w-3xl">
          <h1 className="text-title">{tool.h1}</h1>
          <p className="mt-4 text-lg text-muted">{tool.intro}</p>
          <PrivacyBadge className="mt-5" />
        </div>

        <div className="mt-10">{children}</div>

        <p className="mt-8 max-w-3xl text-sm text-muted">
          {site.promise} Toolpit has no upload step and no server that can see your document —
          the work happens in this tab, on your machine, and stops the moment you close it.
        </p>

        <RelatedTools href={href} />
      </Container>
    </>
  );
}
