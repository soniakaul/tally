import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Auto-update the SW in the background when a new version ships.
      // Mom won't be looking for "an update is available" prompts.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Let the SW work in dev too — easier to debug the install flow.
      devOptions: { enabled: true, type: 'module' },
      includeAssets: ['favicon.svg', 'pwa-source.svg'],
      manifest: {
        name: 'tally',
        short_name: 'tally',
        description:
          'Track household payments across countries and items. Encrypted credentials per payment, WhatsApp reminders.',
        // Standalone strips the browser chrome so the installed app looks
        // like a native window — the Mac install experience.
        display: 'standalone',
        orientation: 'any',
        // Cream + ink, matching the app palette.
        background_color: '#F4F2EA',
        theme_color: '#0A0A0A',
        start_url: '/',
        scope: '/',
        // SVG icons work in current Chromium browsers and Safari 17+. For
        // older browser fallbacks, run `npm run generate-pwa-assets` (needs
        // Node 20+) and add the resulting PNGs back into this list as
        // additional entries with type: 'image/png'.
        icons: [
          { src: '/pwa-source.svg', sizes: 'any', type: 'image/svg+xml' },
          {
            src: '/pwa-source.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Cache the SPA shell so the app loads instantly on second visit and
        // works while opening offline (the data still needs network, but the
        // shell renders and the "no connection" state surfaces gracefully).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Don't intercept Supabase API calls — they need to be live.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/functions/],
      },
    }),
  ],
})
