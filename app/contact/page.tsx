import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/tool/Breadcrumbs';
import { breadcrumbJsonLd, jsonLdProps } from '@/lib/jsonld';
import { pageMetadata } from '@/lib/seo';
import { site } from '@/lib/site';

export const metadata: Metadata = pageMetadata({
  title: 'Contact Toolpit',
  description:
    'How to reach Toolpit about a broken tool, a tool request, a privacy question or an advertising question.',
  path: '/contact',
  keywords: ['contact toolpit', 'toolpit support'],
});

export default function ContactPage() {
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Contact', path: '/contact' },
  ];

  return (
    <>
      <script {...jsonLdProps(breadcrumbJsonLd(crumbs))} />

      <Container className="py-10 sm:py-14">
        <Breadcrumbs crumbs={crumbs} />

        <div className="mt-6 max-w-3xl">
          <h1 className="text-title">Contact us</h1>
          <p className="mt-4 text-lg text-muted">
            One address, read by a person. There is no ticket system and no account required to
            write to us.
          </p>

          <p className="mt-8 text-lg">
            <a
              href={`mailto:${site.contactEmail}`}
              className="font-display font-semibold text-accent hover:underline"
            >
              {site.contactEmail}
            </a>
          </p>
          <p className="mt-2 text-sm text-muted">
            Published by {site.publisher}. We usually reply within a few days.
          </p>
        </div>

        <div className="mt-12 max-w-3xl">
          <h2 className="text-heading">What to include</h2>
          <ul className="mt-4 flex flex-col gap-2 text-muted">
            <li>
              <strong className="text-text">A tool that misbehaved.</strong> Tell us which tool,
              which browser, and what the file was like — how many pages, roughly how large. Please
              do not attach the file itself: we cannot accept documents, and the tool never sent us
              one in the first place.
            </li>
            <li>
              <strong className="text-text">A tool you wish existed.</strong> If a browser can do
              it without a server, it is a candidate.
            </li>
            <li>
              <strong className="text-text">Privacy or advertising.</strong> Anything about what
              this site collects, or about an ad you were shown, is answered by a person here.
              Start with the{' '}
              <Link href="/privacy" className="text-accent hover:underline">
                privacy policy
              </Link>
              , which covers most of it.
            </li>
          </ul>

          <h2 className="mt-10 text-heading">What we cannot help with</h2>
          <p className="mt-3 text-muted">
            We cannot recover a file you lost, because we never had a copy — processing happens on
            your device and nothing is stored here.{' '}
            <Link href="/how-it-works" className="text-accent hover:underline">
              How it works
            </Link>{' '}
            explains why that is structural rather than a policy choice.
          </p>
        </div>
      </Container>
    </>
  );
}
