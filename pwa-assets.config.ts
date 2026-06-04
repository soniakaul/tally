import {
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

// Generates:
//   public/favicon.ico
//   public/apple-touch-icon.png   (180×180, used by Safari "Add to Dock")
//   public/icon-192.png            (192×192, manifest)
//   public/icon-512.png            (512×512, manifest)
//   public/icon-maskable-512.png   (512×512 with safe-area padding)
//
// Run: npm run generate-pwa-assets
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/pwa-source.svg'],
})
