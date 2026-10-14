import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const EPC_API = 'https://api.get-energy-performance-data.communities.gov.uk/api'
const EPC_PATHS = ['/domestic/search', '/certificate']

/**
 * Local EPC proxy for `npm run dev`. The EPC API needs a bearer token and blocks browser
 * requests, so the dev server adds the token server-side. EPC_API_TOKEN is read from
 * .env.local and is never bundled (no VITE_ prefix). Only the two read-only endpoints
 * Leasewise uses are forwarded.
 */
function epcProxy(token: string | undefined): Plugin {
  return {
    name: 'leasewise-epc-proxy',
    configureServer(server) {
      server.middlewares.use('/api/epc', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://local')
        res.setHeader('Content-Type', 'application/json')
        if (url.pathname === '/status') return res.end(JSON.stringify({ configured: !!token }))
        if (!token) {
          res.statusCode = 503
          return res.end(JSON.stringify({ error: 'EPC_API_TOKEN not set' }))
        }
        if (req.method !== 'GET' || !EPC_PATHS.includes(url.pathname)) {
          res.statusCode = 404
          return res.end('{}')
        }
        try {
          const upstream = await fetch(`${EPC_API}${url.pathname}${url.search}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
          res.statusCode = upstream.status
          res.end(await upstream.text())
        } catch (e) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: String(e) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), epcProxy(env.EPC_API_TOKEN)],
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  } as never
})
