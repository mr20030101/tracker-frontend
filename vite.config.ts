import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

// Publishes the app's version at /version.json, so an open tab can tell a newer release has
// been deployed (src/components/UpdateBanner.tsx). Written into every build; the dev server
// answers it live from package.json, so bumping the version there shows the prompt too.
function versionFile(): Plugin {
  const read = () => JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string
  const body = () => JSON.stringify({ version: read() })

  return {
    name: 'version-file',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(body())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body() })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/sanctum': 'http://localhost:8000',
    },
  },
})
