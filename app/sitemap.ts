import type { MetadataRoute } from 'next';

import { absoluteUrl } from '@/lib/site';
import { categories, tools } from '@/lib/tools';

/**
 * Every route, including the Phase 2-4 tools that are scaffolded but not built
 * yet — they are real landing pages with real copy, so they belong in the index
 * from day one.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: absoluteUrl('/'), lastModified, changeFrequency: 'weekly', priority: 1 },
    ...categories.map((category) => ({
      url: absoluteUrl(`/${category.segment}`),
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    ...tools.map((tool) => ({
      url: absoluteUrl(tool.href),
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: tool.status === 'live' ? 0.8 : 0.5,
    })),
    {
      url: absoluteUrl('/how-it-works'),
      lastModified,
      changeFrequency: 'yearly' as const,
      priority: 0.6,
    },
    {
      url: absoluteUrl('/about'),
      lastModified,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    },
    {
      url: absoluteUrl('/contact'),
      lastModified,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    },
    {
      url: absoluteUrl('/privacy'),
      lastModified,
      changeFrequency: 'yearly' as const,
      priority: 0.4,
    },
    {
      url: absoluteUrl('/terms'),
      lastModified,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
  ];
}
