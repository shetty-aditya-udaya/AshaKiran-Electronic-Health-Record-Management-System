import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'AshaKiran',
        short_name: 'AshaKiran',
        theme_color: '#0F766E',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        cacheId: 'ashakiran-pwa-v1.1',
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,jpeg,svg,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => {
              const isApi = url.pathname.startsWith('/api/') || url.href.includes('/api/');
              const isAuth = url.pathname.includes('/login') || url.pathname.includes('/refresh') || url.pathname.includes('/register');
              const isGet = request ? request.method === 'GET' : true;
              return isApi && !isAuth && isGet;
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 24 * 3600 },
              cacheableResponse: {
                statuses: [200]
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  server: {
    proxy: {
      '/api':             'http://localhost:5000',
      '/health':          'http://localhost:5000',
      '/nearby-clinics':  'http://localhost:5000',
    }
  },
  build: {
    chunkSizeWarningLimit: 2000
  }
});
