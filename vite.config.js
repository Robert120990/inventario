import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

const env = globalThis.process?.env || {}
let gitCommit = ''
try {
  gitCommit = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  // fallback if git command fails
}

const appVersion = (
  env.VERCEL_GIT_COMMIT_SHA ||
  env.GITHUB_SHA ||
  env.VITE_APP_VERSION ||
  gitCommit ||
  '1.0.0'
).slice(0, 7)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
