import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/tool/Breadcrumbs';
import { breadcrumbJsonLd, jsonLdProps } from '@/lib/jsonld';
import { pageMetadata } from '@/lib/seo';
import { site } from '@/lib/site';

export const metadata: Metadata = pageMetadata({
  title: 'Terms of Use — Toolpit',
  description:
    'The terms you accept by using Toolpit: what the tools are, what they are not warranted to do, and who owns the files you process.',
  path: '/terms',
  keywords: ['toolpit terms', 'terms of use'],
});

export default function TermsPage() {
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Terms', path: '/terms' },
  ];

  return (
    <>
      <script {...jsonLdProps(breadcrumbJsonLd(crumbs))} />

      <Container className="py-10 sm:py-14">
        <Breadcrumbs crumbs={crumbs} />

        <div className="mt-6 max-w-3xl">
          <h1 className="text-title">Terms of use</h1>
          <p className="mt-4 text-lg text-muted">
            Plain terms for a free site. Using Toolpit means accepting them.
          </p>
        </div>

        <div className="mt-12 max-w-3xl">
          <h2 className="text-heading">Your files stay yours</h2>
          <p className="mt-3 text-muted">
            We claim no ownership of, and no licence over, anything you open in a tool. That is
            easy to promise because the files never reach us — see the{' '}
            <Link href="/privacy" className="text-accent hover:underline">
              privacy policy
            </Link>
            .
          </p>

          <h2 className="mt-10 text-heading">Acceptable use</h2>
          <p className="mt-3 text-muted">
            Use the tools on files you own or have permission to work on, and do not use Toolpit
            to break the law or to strip protections from work that is not yours. The
            watermark-removal tools exist for documents and images you are entitled to edit —
            your own drafts, your own exports, stock you have licensed.
          </p>

          <h2 className="mt-10 text-heading">No warranty</h2>
          <p className="mt-3 text-muted">
            The tools are provided as they are, without warranty of any kind. Processing happens
            on your device, in a browser we do not control, on files we never see, so we cannot
            guarantee a particular result for a particular file. Keep your originals. To the
            extent the law allows, {site.publisher} is not liable for loss or damage arising from
            using the site — including a file that did not convert the way you expected.
          </p>

          <h2 className="mt-10 text-heading">Advertising</h2>
          <p className="mt-3 text-muted">
            Pages carry ads served by Google AdSense, which is what pays for the site. Ads are
            supplied by third parties; we do not endorse advertised products and are not party to
            any dealing you have with an advertiser.
          </p>

          <h2 className="mt-10 text-heading">Changes</h2>
          <p className="mt-3 text-muted">
            Tools may be added, changed or withdrawn, and these terms may be updated. Questions go
            to{' '}
            <Link href="/contact" className="text-accent hover:underline">
              our contact page
            </Link>
            .
          </p>
        </div>
      </Container>
    </>
  );
}
