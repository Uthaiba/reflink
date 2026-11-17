import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ConnectivityNotice from './components/ConnectivityNotice.jsx'
import { configureOfflineShell } from './lib/offlineShell.js'

if (import.meta.env.PROD) {
  void configureOfflineShell({ enabled: import.meta.env.VITE_PWA_ENABLED === 'true' });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConnectivityNotice />
    <Suspense fallback={<p role="status">Loading REFLINK workspace…</p>}><App /></Suspense>
  </StrictMode>,
)
