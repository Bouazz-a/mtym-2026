import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The app calls the API on its own origin (/api). In production Caddy
// routes /api to the backend; in dev this proxy does the same.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': apiTarget,
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
