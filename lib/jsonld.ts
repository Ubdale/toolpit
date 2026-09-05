import { absoluteUrl, site } from './site';
import type { Faq } from './tool-guides';
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

/**
 * FAQPage and HowTo for a tool.
 *
 * Both describe content that is rendered on the page for a person to read.
 * Marking up answers that exist only in the <head> is what search engines
 * penalise as structured-data spam, so `ToolPage` renders these sections and
 * this function describes what it rendered — never the other way round.
 */
export function faqJsonLd(faqs: Faq[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

export function howToJsonLd(tool: Tool, steps: string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: tool.h1,
    description: tool.description,
    totalTime: 'PT1M',
    tool: { '@type': 'HowToTool', name: 'A web browser' },
    supply: [],
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: `Step ${index + 1}`,
      text: step,
      url: `${absoluteUrl(tool.href)}#how-to`,
    })),
  };
}

/** The tools in a category, as an ordered list search engines can read. */
export function itemListJsonLd(tools: Tool[], name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: tools.length,
    itemListElement: tools.map((tool, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: tool.name,
      description: tool.summary,
      url: absoluteUrl(tool.href),
    })),
  };
}

/**
 * The publisher behind every other node on the site. Kept separate from
 * `websiteJsonLd` so it can be emitted once in the layout.
 */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: site.url,
    description: site.oneLiner,
    logo: absoluteUrl('/icon-512.png'),
    slogan: site.tagline,
    // A machine-readable contact route, matching what /contact and /about show
    // a person. Reviewers check that the two agree.
    email: site.contactEmail,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: site.contactEmail,
      url: absoluteUrl('/contact'),
      availableLanguage: 'English',
    },
  };
}
