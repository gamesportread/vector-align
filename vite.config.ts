import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  server: {
    hmr: false,
  },
  plugins: [react(), VitePWA({ registerType: 'prompt', includeAssets: ['favicon.svg', 'icons/*.png', 'models/*.glb', 'textures/*'],
    manifest: { name: 'Vector Align · Orbital Academy', short_name: 'Vector Align', description: 'Learn the final 100 metres of spacecraft docking.', theme_color: '#101315', background_color: '#101315', display: 'standalone', start_url: '/', icons: [{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png'}, {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png'}, {src:'/icons/maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}] },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,glb,jpg,webp}'],
      globIgnores: [
        'models/sls_artemis_rocket.glb',
        'images/dragon_ref/**',
        'images/home/*.jpg',
        'textures/earth.jpg',
        'textures/earth_clouds.png',
        'artemis.html',
      ],
      maximumFileSizeToCacheInBytes: 80 * 1024 * 1024,
      navigateFallback: '/index.html',
      cleanupOutdatedCaches: true,
    }
  })],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('/src/i18n/messages')) return 'i18n-messages';
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          if (id.includes('/node_modules/three/')) return 'three-core';
          if (
            id.includes('/node_modules/@react-three/') ||
            id.includes('/node_modules/three-stdlib/') ||
            id.includes('/node_modules/react-reconciler/') ||
            id.includes('/node_modules/camera-controls/') ||
            id.includes('/node_modules/maath/') ||
            id.includes('/node_modules/troika-')
          ) {
            return 'r3f-vendor';
          }
          if (id.includes('/node_modules/lucide-react/')) return 'icons-vendor';
          return undefined;
        },
      },
    },
  },
  test: { include: ['src/**/*.test.ts'] }
} as import('vite').UserConfig);
