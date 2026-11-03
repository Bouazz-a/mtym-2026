import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The app calls the API on its own origin (/api). In production Caddy
// routes /api to the backend; in dev this proxy does the same.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3001'

export default defineConfig({
  plugins: [react()],
  // A second dev server of this project (./dev.sh demo, next to ./dev.sh)
  // keeps its own cache of prepared dependencies: sharing one, each could
  // rebuild it under the other. Unset: Vite's usual node_modules/.vite.
  cacheDir: process.env.VITE_CACHE_DIR,
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
