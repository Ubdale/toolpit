import type { Metadata } from 'next';
import Link from 'next/link';

import { Container } from '@/components/layout/Container';
import { Breadcrumbs } from '@/components/tool/Breadcrumbs';
import { PrivacyBadge } from '@/components/tool/PrivacyBadge';
import { breadcrumbJsonLd, jsonLdProps } from '@/lib/jsonld';
import { pageMetadata } from '@/lib/seo';
import { site } from '@/lib/site';

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
            never seen by us. Close the tab and no file of yours is left behind anywhere.
          </p>
          <p className="mt-3 text-muted">
            That is the strong claim on this page, and it is about your files. Two other things
            are true and are set out in full below: a handful of things are saved in your own
            browser, and this site is paid for by Google AdSense, whose ads do use cookies that
            follow you across sites. Read on rather than stopping here.
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

          <h2 className="mt-10 text-heading">What is stored on your device</h2>
          <p className="mt-3 text-muted">
            A few things are kept in your own browser so the site is usable. None of them is sent
            to us, and clearing your site data removes all of them.
          </p>
          <ul className="mt-4 flex flex-col gap-2 text-muted">
            <li>
              <strong className="text-text">Your theme.</strong> Whether you picked light or dark.
            </li>
            <li>
              <strong className="text-text">Resume drafts.</strong> The resume builder autosaves
              what you have typed — including the name, email, phone number and history you enter
              — into this browser&rsquo;s local storage, so a refresh does not wipe an hour of
              work. It stays on this device: there is no account and no sync, and no copy of it
              reaches us.
            </li>
            <li>
              <strong className="text-text">Saved builder templates.</strong> Chart and report
              layouts you save are kept the same way, on this device only.
            </li>
            <li>
              <strong className="text-text">Downloaded AI models.</strong> The background-removal,
              upscaling and object-removal tools download a model file the first time you use
              them and keep it in your browser&rsquo;s cache so it is not downloaded again. The
              model is fetched from a third-party host, which sees an ordinary file request and
              your IP address — the same as any download. Your image is not part of that request.
            </li>
            <li>
              <strong className="text-text">Advertising cookies.</strong> Set by Google and its
              partners, described in the next section.
            </li>
          </ul>

          <h2 className="mt-10 text-heading">What is measured</h2>
          <p className="mt-3 text-muted">
            Two Vercel scripts do report something, and it would be dishonest to leave them
            unmentioned on a page like this. <strong className="text-text">Analytics</strong>
            {' '}counts page views — which tool pages people open, roughly where in the world from,
            and which site sent them. <strong className="text-text">Speed Insights</strong> records
            how quickly pages actually load for real visitors: standard web-vitals timings and a
            coarse device class.
          </p>
          <p className="mt-3 text-muted">
            Both are cookieless and neither builds a profile of you or follows you to other sites.
            More to the point, neither can see a file you opened — not because they promise not to,
            but because your files are never part of any request in the first place. That is the
            part of this page that is structural rather than a policy. If you would rather send
            nothing at all, any content blocker will stop both, and every tool keeps working
            exactly as before.
          </p>

          <h2 className="mt-10 text-heading">Advertising</h2>
          <p className="mt-3 text-muted">
            Toolpit is free and has no paid tier. It is paid for by advertising, and every page on
            this site carries ads served by{' '}
            <strong className="text-text">Google AdSense</strong>. This is the part of the site
            that does involve third-party tracking, and it would be misleading to describe the
            rest of this page without saying so plainly.
          </p>
          <p className="mt-3 text-muted">
            Google and its partners use cookies and similar technologies to serve those ads. That
            includes personalised advertising based on your prior visits to this and other
            websites, and it means Google can recognise you across sites in a way nothing else on
            Toolpit does. Third-party vendors, including Google, may also use cookies to serve ads
            based on someone&rsquo;s past visits here.
          </p>
          <p className="mt-3 text-muted">
            You can turn personalised advertising off, for Google&rsquo;s ads anywhere on the web,
            at{' '}
            <a
              href="https://www.google.com/settings/ads"
              className="text-accent hover:underline"
              rel="noopener"
            >
              Google Ads Settings
            </a>
            . How Google uses data from sites that show its ads is set out at{' '}
            <a
              href="https://policies.google.com/technologies/partner-sites"
              className="text-accent hover:underline"
              rel="noopener"
            >
              google.com/policies/technologies/partner-sites
            </a>
            . Third-party vendors other than Google can be opted out of at{' '}
            <a
              href="https://www.aboutads.info/choices/"
              className="text-accent hover:underline"
              rel="noopener"
            >
              aboutads.info/choices
            </a>
            . Turning ads off entirely with a content blocker also works, and every tool on this
            site keeps working exactly as before if you do.
          </p>
          <p className="mt-3 text-muted">
            What advertising does not change: no ad script can see a file you opened, because your
            files are never part of any request to any server, ours or Google&rsquo;s. That
            remains structural rather than a promise.
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

          <h2 className="mt-10 text-heading">Children</h2>
          <p className="mt-3 text-muted">
            Toolpit is a general-audience utility site and is not directed at children under 13.
            We do not knowingly collect personal information from anyone — there are no accounts
            and no forms that submit data to us.
          </p>

          <h2 className="mt-10 text-heading">Questions</h2>
          <p className="mt-3 text-muted">
            Anything about this page, including advertising, goes to{' '}
            <Link href="/contact" className="text-accent hover:underline">
              our contact page
            </Link>{' '}
            or straight to{' '}
            <a href={`mailto:${site.contactEmail}`} className="text-accent hover:underline">
              {site.contactEmail}
            </a>
            . This policy was last updated on 5 September 2026.
          </p>
        </div>
      </Container>
    </>
  );
}
