import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Precision Load Vault — Jamstack build config.
// Zero-server: static output deploys directly to Vercel/Netlify free tiers.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Precision Load Vault',
        short_name: 'LoadVault',
        description: 'Ammunition load development, target analysis, and bench inventory tracking.',
        theme_color: '#121619',
        background_color: '#121619',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Range Mode needs to work with zero signal at the bench.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
      },
    }),
  ],
});
