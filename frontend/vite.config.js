import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        runtimeCaching: [{
          urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
          handler: 'NetworkFirst',
          options: { cacheName: 'api-cache', networkTimeoutSeconds: 5 }
        }]
      }
    })
  ],
  server: {
    proxy: {
      '/api':             'http://localhost:5000',
      '/health':          'http://localhost:5000',
      '/nearby-clinics':  'http://localhost:5000',
    }
  }
});
