import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Demo mode (npm run demo) answers every database call from here, empty,
// so the app can be looked at without signing in and without touching the
// real Supabase project. Reads get no rows; writes are accepted and dropped.
function demoDatabase() {
  return {
    name: 'demo-database',
    configureServer(server) {
      server.middlewares.use('/__demo', (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Content-Range', '*/0')
          res.end(body === undefined ? '' : JSON.stringify(body))
        }
        const path = req.url || ''
        if (path.startsWith('/rest/v1/')) {
          const single = (req.headers.accept || '').includes('vnd.pgrst.object')
          if (req.method === 'GET' || req.method === 'HEAD') {
            return single ? send(406, { code: 'PGRST116', message: 'No rows (demo)' }) : send(200, [])
          }
          return send(single ? 201 : 201, single ? {} : [])
        }
        if (path.startsWith('/auth/v1/')) return send(200, {})
        if (path.startsWith('/storage/v1/')) return send(200, [])
        return send(200, {})
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'demo' ? [demoDatabase()] : [])],
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
}))
