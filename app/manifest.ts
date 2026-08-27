import type { MetadataRoute } from 'next';

import { site } from '@/lib/site';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} — free browser tools`,
    short_name: site.name,
    description: site.oneLiner,
    start_url: '/',
    display: 'standalone',
    background_color: '#fbfaf8',
    theme_color: '#d1541f',
    categories: ['utilities', 'productivity'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
