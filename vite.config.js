import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the API runs on :3001 (npm run dev:api); Vite proxies /api to it.
// In production Express serves both the API and the built app from one origin.
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false },
    },
  },
})
