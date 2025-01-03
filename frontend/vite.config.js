import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000', // Points to Django
        changeOrigin: true,
        secure: false,
      },
      // Match only the exact /monitor path (list + create endpoint).
      // /monitor/12, /monitor/anything etc. are React frontend routes
      // and must NOT be proxied to Django.
      '^/monitor/?$': {
        target: 'http://127.0.0.1:8000', // Points to Django
        changeOrigin: true,
        secure: false,
      },
      '/media': {
        target: 'http://127.0.0.1:8000', // Points to Django
        changeOrigin: true,
        secure: false,
      },
    }
  }
})