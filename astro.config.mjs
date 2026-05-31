// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Static SEO dashboard for theturfyard.com.
// Data is read from data/seo.db (SQLite) at BUILD TIME via src/lib/db.ts.
export default defineConfig({
  output: 'static',
  integrations: [tailwind()],
  vite: {
    // better-sqlite3 is a native module — keep it external from the SSR bundle
    // so Astro uses the real Node binding during the static build.
    ssr: {
      external: ['better-sqlite3'],
    },
  },
});
