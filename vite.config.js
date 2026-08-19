import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Precision Load Vault — Jamstack build config.
// Zero-server: static output deploys directly to Vercel/Netlify free tiers.
//
// PWA/offline support (vite-plugin-pwa) is intentionally NOT wired up yet.
// It was included from the start in an earlier draft of this config, but a
// Workbox service worker aggressively caches the app shell — during active
// development that meant every deploy kept serving a stale cached bundle in
// the browser, surviving hard refreshes and even DevTools "Clear site data"
// in some cases. Re-add it properly in Phase 4 (Offline Dexie Sync), with a
// deliberate update strategy (skipWaiting/clientsClaim, or a "new version
// available, refresh?" prompt) so it doesn't fight normal iteration again.
export default defineConfig({
  plugins: [react()],
});
