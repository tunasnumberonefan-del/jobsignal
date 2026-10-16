import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  // The local Workers proxy occasionally drops a connection under parallel requests on
  // Windows ("fetch failed"). The app retries those; don't let the overlay block the page.
  server: { hmr: { overlay: false } },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@client': fileURLToPath(new URL('./src/client', import.meta.url)),
    },
  },
});
