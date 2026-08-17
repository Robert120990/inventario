import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const env = globalThis.process?.env || {}
const appVersion = (
  env.VERCEL_GIT_COMMIT_SHA ||
  env.GITHUB_SHA ||
  env.VITE_APP_VERSION ||
  'local'
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
