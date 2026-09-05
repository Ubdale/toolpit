import type { Metadata } from 'next';

import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/tool/Breadcrumbs';
import { PrivacyBadge } from '@/components/tool/PrivacyBadge';
import { breadcrumbJsonLd, jsonLdProps } from '@/lib/jsonld';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'How Toolpit Works — Browser-Only File Tools | Toolpit',
  description:
    'Toolpit runs every tool locally in your browser with WebAssembly. No upload, no server, no account — here is exactly what happens to your file.',
  path: '/how-it-works',
  keywords: ['client-side file processing', 'webassembly tools', 'no upload converter'],
});

const steps = [
  {
    title: 'You open a tool',
    body: 'The page is a static file served from a CDN. There is no session, no account and nothing waiting to receive an upload.',
  },
  {
    title: 'Your file is read into the tab',
    body: 'Dropping a file hands it to the page through the browser’s own File API. The bytes go into this tab’s memory — not to a network request.',
  },
  {
    title: 'The work happens on your CPU',
    body: 'The processing libraries are compiled to WebAssembly and downloaded like any other script. They run on your machine, at your machine’s speed, with no queue.',
  },
  {
    title: 'You download the result',
    body: 'The finished file is created in memory and handed to your browser’s download flow. Close the tab and every trace of it is gone.',
  },
];

export default function HowItWorksPage() {
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'How it works', path: '/how-it-works' },
  ];

  return (
    <>
      <script {...jsonLdProps(breadcrumbJsonLd(crumbs))} />

      <Container className="py-10 sm:py-14">
        <Breadcrumbs crumbs={crumbs} />

        <div className="mt-6 max-w-3xl">
          <h1 className="text-title">No magic, no servers</h1>
          <p className="mt-4 text-lg text-muted">
            Open a tool, drop in your file, and the work happens on your own machine. That&rsquo;s
            why there&rsquo;s no signup and no upload bar creeping to 100% — the processing is
            instant and private because it never leaves your device.
          </p>
          <PrivacyBadge className="mt-5" />
        </div>

        <ol className="mt-12 grid gap-4 sm:grid-cols-2">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-2xl border border-line bg-surface p-5">
              <span
                aria-hidden="true"
                className="grid size-8 place-items-center rounded-lg bg-accent-soft font-display text-sm font-semibold text-accent"
              >
                {index + 1}
              </span>
              <h2 className="mt-3 font-display text-base font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-12 max-w-3xl">
          <h2 className="text-heading">How you can check</h2>
          <p className="mt-3 text-muted">
            You do not have to take our word for it. Open your browser&rsquo;s developer tools,
            switch to the Network tab, and use any tool on Toolpit. You will see the page load,
            its scripts download, and the ads that pay for the site fetch themselves. What you
            will not see is a request carrying your file, because there is no endpoint to carry it
            to. Block the ads and disconnect from the network entirely after the page loads: every
            tool keeps working.
          </p>

          <h2 className="mt-10 text-heading">What about big files?</h2>
          <p className="mt-3 text-muted">
            Because there is no upload, size limits are set by your own device rather than by a
            free-tier quota. A large PDF is processed at the speed of your CPU, and the progress
            bars you see are real work happening locally — not a queue position on somebody
            else&rsquo;s server.
          </p>
        </div>
      </Container>
    </>
  );
}
