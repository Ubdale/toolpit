import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/Container';
import { LockGlyph } from '@/components/tool/PrivacyBadge';
import { ToolExplorer } from '@/components/tool/ToolExplorer';
import { ButtonLink } from '@/components/ui/Button';
import { itemListJsonLd, jsonLdProps, websiteJsonLd } from '@/lib/jsonld';
import { pageMetadata } from '@/lib/seo';
import { site } from '@/lib/site';
import { tools } from '@/lib/tools';

export const metadata: Metadata = pageMetadata({
  title: 'Toolpit — Free Browser Tools for PDFs, Images & Vectors',
  description: site.oneLiner,
  path: '/',
  cardHeading: 'Free online tools that never touch a server',
  keywords: [
    'free online tools',
    'browser pdf tools',
    'no upload file converter',
    'private file tools',
    'free pdf editor',
    'free resume builder',
    'free chart maker',
    'watermark remover',
  ],
});

/** The tools people arrive looking for, surfaced straight from the hero. */
const POPULAR = ['/pdf/merge', '/pdf/edit', '/image/resize', '/create/resume'].map((href) =>
  tools.find((tool) => tool.href === href)!,
);

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
      <script {...jsonLdProps(itemListJsonLd(tools, 'Every Toolpit tool'))} />

      <Container className="pt-14 pb-4 sm:pt-20">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-vault-line bg-vault-soft px-3 py-1.5 text-xs font-medium text-vault">
            <LockGlyph />
            {site.promise}
          </p>
          <h1 className="mt-6 text-balance text-title sm:text-display">
            Free online tools that never touch a server
          </h1>
          <p className="mt-6 text-pretty text-lg text-muted sm:text-xl">
            Edit and sign PDFs, strip watermarks, resize images, trace vectors, build a resume,
            chart your numbers — {tools.length} tools running entirely in your browser. No uploads,
            no accounts, no watermarks, no limits.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="#tools" size="lg">
              Browse {tools.length} tools
            </ButtonLink>
            <ButtonLink href="/how-it-works" variant="secondary" size="lg">
              How it works
            </ButtonLink>
          </div>

          <p className="mt-6 text-sm text-muted">
            Popular:{' '}
            {POPULAR.map((tool, index) => (
              <span key={tool.href}>
                {index > 0 ? ' · ' : ''}
                <Link
                  href={tool.href}
                  className="text-text underline-offset-4 hover:text-accent hover:underline"
                >
                  {tool.name}
                </Link>
              </span>
            ))}
          </p>
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

        <ToolExplorer />
      </Container>
    </>
  );
}
