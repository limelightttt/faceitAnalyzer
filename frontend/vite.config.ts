/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      output: {
        // charts only get recharts' own dependencies; shared helpers (clsx…) stay in the entry so pages
        // without charts never download the charting chunk
        manualChunks(id) {
          // helpers shared with recharts must be assigned explicitly, or Rollup pulls them into the charts chunk
          if (id.includes('commonjsHelpers') || /node_modules\/(clsx|react-is)\//.test(id)) return 'react'
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run|@tanstack)\//.test(id)) return 'react'
          if (/node_modules\/(recharts|recharts-scale|d3-[a-z-]+|victory-vendor|internmap|decimal\.js-light|lodash|eventemitter3|react-smooth|fast-equals|tiny-invariant)\//.test(id)) return 'charts'
        },
      },
    },
  },
  test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], css: false },
})
