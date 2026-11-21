import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
        theme_color: '#3b82f6',
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
      workbox: {
        // Precache the self-hosted font so the recorder looks right offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/search/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'search-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 24 * 60 * 60 // 24 hours
              }
            }
          },
          {
            // English vector basemap: tiles, fonts and sprites are cached for offline use.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(?:planet|fonts|sprites)\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // The style itself: serve the cached copy instantly, refresh in the background.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/styles\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'map-style',
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/(?:[a-z]+\.)?tile\.openstreetmap\.org\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
              }
            }
          }
        ],
        navigateFallback: 'index.html'
      }
    })
  ]
});