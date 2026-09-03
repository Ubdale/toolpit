import type { ReactNode } from 'react';

import { Container } from '@/components/layout/Container';
import {
  breadcrumbJsonLd,
  faqJsonLd,
  howToJsonLd,
  jsonLdProps,
  toolJsonLd,
} from '@/lib/jsonld';
import { site } from '@/lib/site';
import { getGuide } from '@/lib/tool-guides';
import { getCategory, getTool } from '@/lib/tools';

import { Breadcrumbs } from './Breadcrumbs';
import { PrivacyBadge } from './PrivacyBadge';
import { RelatedTools } from './RelatedTools';
import { ToolGuideSections } from './ToolGuide';
import { ToolIcon } from './ToolIcon';

/**
 * The frame every tool drops into.
 *
 * The ordering is the important part. People arrive here to *use* the tool, so
 * the tool goes directly under the heading and is on screen without scrolling;
 * the long intro paragraph — which exists to explain the tool to someone who
 * arrived from a search result — moves below it into an "about" block. Nothing
 * is cut and nothing is hidden from crawlers, which read the document in full
 * regardless of where it sits on the page. Above the tool there is only a
 * one-line summary, so the first thing in view is the dropzone.
 */
export function ToolPage({ href, children }: { href: string; children: ReactNode }) {
  const tool = getTool(href);
  const category = getCategory(tool.category);
  const guide = getGuide(href);

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: category.label, path: `/${category.segment}` },
    { name: tool.name, path: tool.href },
  ];

  return (
    <>
      <script {...jsonLdProps(toolJsonLd(tool))} />
      <script {...jsonLdProps(breadcrumbJsonLd(crumbs))} />
      {guide ? (
        <>
          <script {...jsonLdProps(howToJsonLd(tool, guide.steps))} />
          <script {...jsonLdProps(faqJsonLd(guide.faqs))} />
        </>
      ) : null}

      <Container className="py-8 sm:py-12">
        <Breadcrumbs crumbs={crumbs} />

        <div className="mt-5 flex flex-wrap items-start gap-x-4 gap-y-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface text-accent shadow-card">
            <ToolIcon href={href} className="size-6" />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-balance text-title">{tool.h1}</h1>
            <p className="mt-1.5 text-pretty text-muted">{tool.summary}</p>
          </div>

          <PrivacyBadge className="shrink-0" />
        </div>

        <div className="mt-8">{children}</div>

        <section aria-labelledby="about-tool" className="mt-14 max-w-3xl">
          <h2 id="about-tool" className="font-display text-heading">
            About this tool
          </h2>
          <p className="mt-4 text-pretty text-lg text-muted">{tool.intro}</p>
          <p className="mt-4 text-pretty text-sm text-muted">
            {site.promise} Toolpit has no upload step and no server that can see your document —
            the work happens in this tab, on your machine, and stops the moment you close it.
          </p>
        </section>

        {/* Every h1 is already phrased as the action ("Merge PDF files",
            "Remove a watermark from a PDF"), so only the first letter is
            lowered — lowercasing the whole thing would turn PDF into pdf. */}
        {guide ? (
          <ToolGuideSections
            guide={guide}
            heading={`How to ${tool.h1.charAt(0).toLowerCase()}${tool.h1.slice(1)}`}
          />
        ) : null}

        <RelatedTools href={href} />
      </Container>
    </>
  );
}
