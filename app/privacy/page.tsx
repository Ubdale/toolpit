import type { Metadata } from 'next';

import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/tool/Breadcrumbs';
import { PrivacyBadge } from '@/components/tool/PrivacyBadge';
import { breadcrumbJsonLd, jsonLdProps } from '@/lib/jsonld';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy — Your Files Never Leave Your Device | Toolpit',
  description:
    'Toolpit has no upload endpoint, no accounts and no file storage. Everything you process stays in your browser. Here is what that means in practice.',
  path: '/privacy',
  keywords: ['private file tools', 'no upload privacy', 'local file processing'],
});

export default function PrivacyPage() {
  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Privacy', path: '/privacy' },
  ];

  return (
    <>
      <script {...jsonLdProps(breadcrumbJsonLd(crumbs))} />

      <Container className="py-10 sm:py-14">
        <Breadcrumbs crumbs={crumbs} />

        <div className="mt-6 max-w-3xl">
          <h1 className="text-title">Your files stay yours</h1>
          <p className="mt-4 text-lg text-muted">
            Most &ldquo;free&rdquo; tools upload your files to a server, then upsell you to get
            them back without a watermark. Toolpit doesn&rsquo;t. Every tool runs locally in your
            browser using WebAssembly — your files are never sent anywhere, never stored, and
            never seen by us. Close the tab and there&rsquo;s nothing left behind.
          </p>
          <PrivacyBadge className="mt-5" />
        </div>

        <div className="mt-12 max-w-3xl">
          <h2 className="text-heading">What Toolpit does not collect</h2>
          <ul className="mt-4 flex flex-col gap-2 text-muted">
            <li>
              <strong className="text-text">Your files.</strong> There is no upload endpoint. A
              file you open is read into this browser tab and nowhere else.
            </li>
            <li>
              <strong className="text-text">Your account.</strong> There isn&rsquo;t one. Nothing
              to register, nothing to log in to, nothing to delete later.
            </li>
            <li>
              <strong className="text-text">Your results.</strong> Output files are built in
              memory and handed straight to your browser&rsquo;s download flow.
            </li>
          </ul>

          <h2 className="mt-10 text-heading">The only thing stored on your device</h2>
          <p className="mt-3 text-muted">
            Toolpit saves one value in your browser&rsquo;s local storage: whether you picked the
            light or dark theme. It never leaves your device either, and clearing your site data
            removes it.
          </p>

          <h2 className="mt-10 text-heading">Hosting</h2>
          <p className="mt-3 text-muted">
            The site is served as static files. Like any web host, the CDN that delivers those
            files sees ordinary request logs for the pages themselves — never their contents, and
            never a file you processed, because your files are never part of a request.
          </p>

          <h2 className="mt-10 text-heading">No watermarks, no limits</h2>
          <p className="mt-3 text-muted">
            There is no premium tier to upsell, so there is no reason to degrade your output. What
            a tool produces is the finished file, at full resolution, every time.
          </p>
        </div>
      </Container>
    </>
  );
}
