import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import RootBoundary from './components/RootBoundary'
import UpdateBanner from './components/UpdateBanner'
import { UserProvider } from './contexts/UserContext'
import { PresenceProvider } from './contexts/PresenceContext'
import { ToastProvider } from './components/ToastProvider'
import { isNative } from './utils/platform'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootBoundary>
      <ToastProvider>
        <UserProvider>
          <PresenceProvider>
            <App />
            <UpdateBanner />
          </PresenceProvider>
        </UserProvider>
      </ToastProvider>
    </RootBoundary>
  </React.StrictMode>,
)

// If something throws before React mounts, the page would just sit blank.
window.addEventListener('error', (e) => {
  const root = document.getElementById('root')
  if (root && root.children.length === 0 && e?.message) {
    root.innerHTML = '<div style="font-family:-apple-system,system-ui,sans-serif;padding:24px;color:#374151">'
      + '<h1 style="font-size:18px">Limitless Scrum could not start</h1>'
      + '<p style="font-size:14px;color:#6b7280">Screenshot this and send it over.</p>'
      + '<pre style="font-size:11px;color:#9ca3af;background:#f9fafb;padding:8px;border-radius:8px;white-space:pre-wrap">'
      + String(e.message).replace(/[<>]/g, '') + '</pre></div>'
  }
})

// Register service worker for push notifications (web only — not supported in Capacitor WebView)
if (!isNative && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.error('SW registration failed:', err)
    })
  })
}
