import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const collectActiveAssetUrls = () => {
    const urls = new Set(['/', '/index.html'])
    document
      .querySelectorAll('script[src], link[rel="stylesheet"][href], link[rel="modulepreload"][href]')
      .forEach((el) => {
        const raw = el.getAttribute('src') || el.getAttribute('href')
        if (!raw) return
        try {
          const resolved = new URL(raw, window.location.origin)
          if (resolved.origin === window.location.origin && !resolved.pathname.startsWith('/api/')) {
            urls.add(resolved.pathname + resolved.search)
          }
        } catch {
          // Ignore malformed asset URLs
        }
      })
    return Array.from(urls)
  }

  const cacheActiveAssetsInSW = (sw) => {
    if (!sw || typeof sw.postMessage !== 'function') return
    sw.postMessage({
      type: 'CACHE_ACTIVE_ASSETS',
      urls: collectActiveAssetUrls()
    })
  }

  window.addEventListener('load', () => {
    let syncedOnClaim = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (syncedOnClaim) return
      syncedOnClaim = true
      cacheActiveAssetsInSW(navigator.serviceWorker.controller)
    })

    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        cacheActiveAssetsInSW(reg.active || navigator.serviceWorker.controller)
      })
      .catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
