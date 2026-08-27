import { absoluteUrl, site } from './site';
import { getCategory, type Tool } from './tools';

/** Every tool is a free, browser-based WebApplication. */
export function toolJsonLd(tool: Tool) {
  const category = getCategory(tool.category);

  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: tool.h1,
    url: absoluteUrl(tool.href),
    description: tool.description,
    applicationCategory: 'UtilitiesApplication',
    applicationSubCategory: category.label,
    operatingSystem: 'Any (browser)',
    browserRequirements: 'Requires a modern browser with WebAssembly support',
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'Runs entirely in your browser',
      'No file upload',
      'No signup or account',
      'No watermark',
    ],
    publisher: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
    },
  };
}

type Crumb = { name: string; path: string };

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: site.url,
    description: site.oneLiner,
    publisher: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
    },
  };
}

/** Renders a <script type="application/ld+json"> for the given data. */
export function jsonLdProps(data: unknown) {
  return {
    type: 'application/ld+json' as const,
    dangerouslySetInnerHTML: { __html: JSON.stringify(data) },
  };
}
