import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Which build this is: shown in the menu so you can tell whether the app has updated.
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    // Local dev: forward /api to `vercel dev` (or any server running the api/ functions).
    proxy: { '/api': process.env.API_PROXY_TARGET || 'http://localhost:3000' },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Record My Trip',
        short_name: 'Record Trip',
        description: 'Track and save your journeys',
        theme_color: '#0E6B4F',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      // Our own service worker (src/sw/sw.ts): saved map areas, offline maps, the app offline.
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      injectManifest: {
        // Precache the self-hosted font so the recorder looks right offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    })
  ]
});