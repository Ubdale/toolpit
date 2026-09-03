import type { Metadata } from 'next';

import { absoluteUrl, site } from './site';

type PageMetaInput = {
  title: string;
  description: string;
  /** Site-relative path, e.g. /pdf/merge */
  path: string;
  keywords?: string[];
  /**
   * The heading to print on the social card. Defaults to the page's <h1>-ish
   * title with the brand suffix removed, which is almost always what you want.
   */
  cardHeading?: string;
};

/**
 * Builds title/description/canonical/OG/Twitter for a page in one place so no
 * route can ship with a missing canonical or a duplicated description.
 */
export function pageMetadata({
  title,
  description,
  path,
  keywords,
  cardHeading,
}: PageMetaInput): Metadata {
  const url = absoluteUrl(path);

  // A card per page rather than one for the whole site: a link to the resume
  // builder and a link to the QR generator should not preview identically.
  const heading = cardHeading ?? stripBrand(title);
  const ogImage = {
    url: absoluteUrl(
      `/og?t=${encodeURIComponent(heading)}&s=${encodeURIComponent(description)}`,
    ),
    width: 1200,
    height: 630,
    alt: `${heading} — ${site.name}`,
  };

  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      siteName: site.name,
      title,
      description,
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

/**
 * "Merge PDF Files Free — No Upload, No Watermark | Toolpit" becomes
 * "Merge PDF Files Free". A social card has the wordmark on it already, and the
 * keyword tail that earns the click in a search result is noise in a preview.
 */
function stripBrand(title: string): string {
  return title
    .split('|')[0]!
    .split('—')[0]!
    .trim();
}
