import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      // Two home-screen apps from one site: the main app at /, and EN Helper
      // at /helper/. Each is its own page with its own small bundle, so the
      // Helper opens fast without loading the whole app. The main entry stays
      // named 'index' because index.html's auto-refresh looks for index-*.js.
      input: {
        index: resolve(__dirname, 'index.html'),
        helper: resolve(__dirname, 'helper/index.html'),
      },
    },
  },
})
