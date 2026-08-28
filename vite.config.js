import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const versionFilePath = path.resolve(__dirname, 'src', 'config', 'version.json')

let versionData = {
  major: 1,
  minor: 3,
  build: 98,
  version: '1.3.98',
  displayVersion: 'v1.3.98',
  commit: 'local'
}

if (fs.existsSync(versionFilePath)) {
  try {
    versionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'))
  } catch {}
}

const appCommit = versionData.commit || 'local'
const buildNumber = versionData.build || 98
const displayVersion = versionData.displayVersion || `v${versionData.version}`

function versionJsonPlugin() {
  return {
    name: 'generate-version-json',
    configureServer(server) {
      server.middlewares.use('/version.json', (req, res) => {
        let current = versionData
        if (fs.existsSync(versionFilePath)) {
          try { current = JSON.parse(fs.readFileSync(versionFilePath, 'utf8')) } catch {}
        }
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        res.end(JSON.stringify(current))
      })
    },
    generateBundle() {
      let current = versionData
      if (fs.existsSync(versionFilePath)) {
        try { current = JSON.parse(fs.readFileSync(versionFilePath, 'utf8')) } catch {}
      }
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(current)
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionJsonPlugin()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appCommit),
    'import.meta.env.VITE_APP_BUILD_NUMBER': JSON.stringify(buildNumber),
    'import.meta.env.VITE_APP_NUMERIC_VERSION': JSON.stringify(displayVersion),
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
