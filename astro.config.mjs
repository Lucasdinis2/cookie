// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE } from './src/config/site.mjs';

/**
 * Para gerar URLs absolutas (canonical, Open Graph e sitemap), informe o
 * domínio final em src/config/site.mjs (SITE.url) ou na variável SITE_URL.
 */
const siteUrl = process.env.SITE_URL || SITE.url || undefined;

export default defineConfig({
  site: siteUrl,
  trailingSlash: 'ignore',
  integrations: siteUrl ? [sitemap()] : [],
  build: {
    inlineStylesheets: 'auto',
  },
  image: {
    responsiveStyles: false,
  },
  vite: {
    build: {
      chunkSizeWarningLimit: 900,
    },
  },
});
