import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const built = new Date();

export default defineConfig({
  root: 'web',
  define: {
    __APP_VERSION__: JSON.stringify(built.toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })),
  },
  build: { outDir: '../dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'ctrinn DJ HQ',
        short_name: 'DJ HQ',
        description: 'Bookings, invoices, content and press pack for ctrinn',
        theme_color: '#0b0a10',
        background_color: '#0b0a10',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The page itself (index.html) is NOT saved in the offline copy: it's always
        // fetched fresh, so new versions of the app show up straight away. Scripts,
        // styles and icons are saved (their names change with every version).
        // Offline, the last page you loaded is used instead.
        globPatterns: ['**/*.{js,css,png,svg,webmanifest}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        importScripts: ['/push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'pages', networkTimeoutSeconds: 6 },
          },
        ],
      },
    }),
  ],
});
