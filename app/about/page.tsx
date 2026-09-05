import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/tool/Breadcrumbs';
import { breadcrumbJsonLd, jsonLdProps } from '@/lib/jsonld';
import { pageMetadata } from '@/lib/seo';
import { site } from '@/lib/site';
import { tools } from '@/lib/tools';

export const metadata: Metadata = pageMetadata({
  title: 'About Toolpit — who makes these tools and why',
  description:
    'Toolpit is a small, independent set of file tools that run in your browser instead of on a server. Who builds it, how it is paid for, and how to reach us.',
  path: '/about',
  keywords: ['about toolpit', 'browser file tools', 'independent web tools'],
});

export default function AboutPage() {
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'About', path: '/about' },
  ];

  return (
    <>
      <script {...jsonLdProps(breadcrumbJsonLd(crumbs))} />

      <Container className="py-10 sm:py-14">
        <Breadcrumbs crumbs={crumbs} />

        <div className="mt-6 max-w-3xl">
          <h1 className="text-title">About Toolpit</h1>
          <p className="mt-4 text-lg text-muted">
            Toolpit is a small, independent collection of {tools.length} file tools that run
            inside your browser rather than on somebody else&rsquo;s server. It is published by{' '}
            {site.publisher}.
          </p>
        </div>

        <div className="mt-12 max-w-3xl">
          <h2 className="text-heading">Why it exists</h2>
          <p className="mt-3 text-muted">
            Merging two PDFs or cropping a screenshot should not mean handing a document to a
            stranger&rsquo;s server, making an account, or paying to remove a watermark from work
            your own computer could have done in a second. Browsers can do all of it now, with
            WebAssembly doing the heavy lifting. Toolpit is what that looks like when nobody
            needs your file in order to make the tool work.
          </p>

          <h2 className="mt-10 text-heading">How it works</h2>
          <p className="mt-3 text-muted">
            Every tool is code that runs in the page you are looking at. There is no upload step,
            because there is no endpoint to upload to.{' '}
            <Link href="/how-it-works" className="text-accent hover:underline">
              How it works
            </Link>{' '}
            walks through it, including how to verify the claim yourself in your browser&rsquo;s
            network panel.
          </p>

          <h2 className="mt-10 text-heading">How it is paid for</h2>
          <p className="mt-3 text-muted">
            Toolpit is free and has no paid tier. Hosting and development are funded by
            advertising: pages carry ads served by Google AdSense. That is the whole business
            model — we do not sell data, and there is no data about your files to sell, because
            they never reach us.{' '}
            <Link href="/privacy" className="text-accent hover:underline">
              Our privacy policy
            </Link>{' '}
            sets out exactly what advertising does and does not involve.
          </p>

          <h2 className="mt-10 text-heading">Editorial policy</h2>
          <p className="mt-3 text-muted">
            The tool guides, FAQs and comparisons on this site are written by us for people
            actually trying to get a file job done. Nothing on Toolpit is sponsored, and no
            advertiser has any say in what a page says.
          </p>

          <h2 className="mt-10 text-heading">Contact</h2>
          <p className="mt-3 text-muted">
            Bug reports, tool requests, and anything about privacy or advertising go to the same
            place —{' '}
            <Link href="/contact" className="text-accent hover:underline">
              our contact page
            </Link>
            , or email{' '}
            <a href={`mailto:${site.contactEmail}`} className="text-accent hover:underline">
              {site.contactEmail}
            </a>
            .
          </p>
        </div>
      </Container>
    </>
  );
}
