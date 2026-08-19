import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

const env = globalThis.process?.env || {}
let gitCommit = ''
let gitCommitCount = 1
try {
  gitCommit = execSync('git rev-parse --short HEAD').toString().trim()
  gitCommitCount = parseInt(execSync('git rev-list --count HEAD').toString().trim(), 10) || 1
} catch {
  // fallback if git command fails
}

const appCommit = (
  env.VERCEL_GIT_COMMIT_SHA ||
  env.GITHUB_SHA ||
  env.VITE_APP_VERSION ||
  gitCommit ||
  'local'
).slice(0, 7)

const numericVersion = `v2.5.${gitCommitCount}`

function versionJsonPlugin() {
  return {
    name: 'generate-version-json',
    configureServer(server) {
      server.middlewares.use('/version.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        res.end(JSON.stringify({
          commit: appCommit,
          build: gitCommitCount,
          numeric: numericVersion,
          timestamp: Date.now()
        }))
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({
          commit: appCommit,
          build: gitCommitCount,
          numeric: numericVersion,
          timestamp: Date.now()
        })
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionJsonPlugin()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appCommit),
    'import.meta.env.VITE_APP_BUILD_NUMBER': JSON.stringify(gitCommitCount),
    'import.meta.env.VITE_APP_NUMERIC_VERSION': JSON.stringify(numericVersion),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx')) {
              return 'vendor-excel';
            }
            if (id.includes('jspdf') || id.includes('html2canvas')) {
              return 'vendor-pdf';
            }
            if (id.includes('jsbarcode')) {
              return 'vendor-barcode';
            }
            if (id.includes('react') || id.includes('lucide-react') || id.includes('react-hot-toast')) {
              return 'vendor-react';
            }
          }
        }
      }
    },
    chunkSizeWarningLimit: 700
  }
})
