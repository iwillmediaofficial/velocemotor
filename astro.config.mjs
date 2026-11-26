// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

const SITE = process.env.PUBLIC_SITE_URL || 'https://velocemotor.com';

export default defineConfig({
  site: SITE,
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'auto' },
  integrations: [
    preact(),
    sitemap({ filter: (page) => !page.includes('/admin') }),
  ],
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  vite: {
    server: {
      // `npm run dev` (Astro, :4321) forwards /api to `npm run dev:api` (Wrangler Pages Functions, :8788)
      proxy: { '/api': 'http://localhost:8788' },
    },
  },
});
