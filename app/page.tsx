import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/Container';
import { LockGlyph } from '@/components/tool/PrivacyBadge';
import { ToolCard } from '@/components/tool/ToolCard';
import { ButtonLink } from '@/components/ui/Button';
import { jsonLdProps, websiteJsonLd } from '@/lib/jsonld';
import { pageMetadata } from '@/lib/seo';
import { site } from '@/lib/site';
import { categories, toolsIn } from '@/lib/tools';

export const metadata: Metadata = pageMetadata({
  title: 'Toolpit — Free Browser Tools for PDFs, Images & Vectors',
  description: site.oneLiner,
  path: '/',
  keywords: [
    'free online tools',
    'browser pdf tools',
    'no upload file converter',
    'private file tools',
  ],
});

const whyPoints = [
  {
    title: 'Completely free',
    body: 'No trials, no premium tier, no watermark on your output.',
  },
  {
    title: 'Private by design',
    body: 'Files are processed on your device, never uploaded.',
  },
  {
    title: 'No account needed',
    body: 'Open a tool and start. Nothing to install.',
  },
];

export default function HomePage() {
  return (
    <>
      <script {...jsonLdProps(websiteJsonLd())} />

      <Container className="pt-14 pb-4 sm:pt-20">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-vault-line bg-vault-soft px-3 py-1.5 text-xs font-medium text-vault">
            <LockGlyph />
            {site.promise}
          </p>
          <h1 className="mt-6 text-title sm:text-display">
            Free online tools that never touch a server
          </h1>
          <p className="mt-6 text-lg text-muted sm:text-xl">
            Edit PDFs, convert images, trace vectors, and more — all running entirely in your
            browser. No uploads, no accounts, no watermarks, no limits.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="#tools" size="lg">
              Browse the tools
            </ButtonLink>
            <ButtonLink href="/how-it-works" variant="secondary" size="lg">
              How it works
            </ButtonLink>
          </div>
        </div>
      </Container>

      <Container className="py-14">
        <div className="grid gap-6 rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <h2 className="text-heading sm:text-title">Your files stay yours</h2>
            <p className="mt-4 text-muted">
              Most &ldquo;free&rdquo; tools upload your files to a server, then upsell you to get
              them back without a watermark. Toolpit doesn&rsquo;t. Every tool runs locally in your
              browser using WebAssembly — your files are never sent anywhere, never stored, and
              never seen by us. Close the tab and there&rsquo;s nothing left behind.
            </p>
          </div>
          <div>
            <h2 className="text-heading sm:text-title">No magic, no servers</h2>
            <p className="mt-4 text-muted">
              Open a tool, drop in your file, and the work happens on your own machine.
              That&rsquo;s why there&rsquo;s no signup and no upload bar creeping to 100% — the
              processing is instant and private because it never leaves your device.
            </p>
          </div>
        </div>
      </Container>

      <Container className="pb-4">
        <h2 className="sr-only">Why Toolpit</h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {whyPoints.map((point) => (
            <li key={point.title} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-display text-base font-semibold">{point.title}</h3>
              <p className="mt-2 text-sm text-muted">{point.body}</p>
            </li>
          ))}
        </ul>
      </Container>

      <Container className="py-14">
        <div id="tools" className="scroll-mt-28">
          <h2 className="text-title">Every tool in the pit</h2>
          <p className="mt-3 max-w-2xl text-muted">
            {site.tagline} Pick one and start — there is nothing to install and nothing to sign up
            for.
          </p>
        </div>

        <div className="mt-12 flex flex-col gap-14">
          {categories.map((category) => (
            <section key={category.id} id={category.segment} className="scroll-mt-28">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="font-display text-heading">{category.label}</h3>
                <Link
                  href={`/${category.segment}`}
                  className="text-sm font-medium text-accent hover:text-accent-hover"
                >
                  {category.label} overview
                  <span aria-hidden="true"> →</span>
                </Link>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-muted">{category.blurb}</p>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {toolsIn(category.id).map((tool) => (
                  <ToolCard key={tool.href} tool={tool} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Container>
    </>
  );
}
