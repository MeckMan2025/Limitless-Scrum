import { defineConfig, loadEnv } from 'vite'
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

  export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    // Where the app is served; every asset path is built from this. On the
    // robotics server that is /scrum/ (robotics.yml).
    const base = env.VITE_BASE || '/Limitless-Scrum/'
    // VITE_SUPABASE_URL=same-origin: the API is the app's own server, at
    // <base>api on whatever address the page was opened from. The preview
    // (dev-N.firstpvrobotics.com) and live (N.firstpvrobotics.com) are then one
    // build, each talking to its own server and database.
    const sameOrigin = env.VITE_SUPABASE_URL === 'same-origin'
    const apiPath = `${base}api`
    return {
    plugins: [react(), ...(mode === 'demo' ? [demoDatabase()] : [])],
    base,
    define: sameOrigin
      // Set by an inline script in index.html and helper/index.html.
      ? { 'import.meta.env.VITE_SUPABASE_URL': 'window.__LIMITLESS_API__' }
      : {},
    // npm run dev: the API calls go to the server running beside it (npm run server).
    server: sameOrigin
      ? { proxy: { [apiPath]: { target: 'http://127.0.0.1:8080', ws: true } } }
      : {},
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
  }
})
