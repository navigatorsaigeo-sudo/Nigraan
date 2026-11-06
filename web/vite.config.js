import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = 'http://127.0.0.1:9087';

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5190,
    strictPort: true,
    proxy: {
      '/api': API,
      '/tiles': API,
      '/n3': API,
      '/health': API,
      '/archive': API,
      '/px': API,
      '/agn-place-search.js': API,
      '/agn-hour-strip.js': API,
      '/agn-hour-strip.css': API,
      '/agn-guidance.js': API,
      '/agn-guidance.css': API,
      '/agn-switch.css': API,
      '/agn-switch.js': API,
      '/agn-ops-exp.js': API,
      '/customize/sites': API,
      '/seal': {
        target: API,
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/seal/, '') || '/',
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const loc = proxyRes.headers.location;
            if (!loc || /^https?:/i.test(loc)) return;
            const u = new URL(loc, 'http://127.0.0.1:5190');
            if (!u.pathname.startsWith('/seal')) u.pathname = '/seal' + u.pathname;
            if (u.searchParams.has('backend')) u.searchParams.set('backend', 'http://127.0.0.1:5190/px');
            proxyRes.headers.location = u.pathname + u.search;
          });
        },
      },
    },
  },
});
