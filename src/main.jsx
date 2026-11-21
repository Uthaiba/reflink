import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ConnectivityNotice from './components/ConnectivityNotice.jsx'
import { configureOfflineShell } from './lib/offlineShell.js'

if (import.meta.env.PROD) {
  void configureOfflineShell({ enabled: import.meta.env.VITE_PWA_ENABLED === 'true' });
}

// A frozen clinical page can miss sign-out events from other tabs.
let hiddenForHistory = false;
window.addEventListener('pagehide', event => {
  if (event.persisted && document.querySelector('.dashboard-page, .new-referral-page')) {
    hiddenForHistory = true;
    document.documentElement.style.visibility = 'hidden';
  }
});
window.addEventListener('pageshow', event => {
  if (event.persisted && hiddenForHistory) window.location.reload();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConnectivityNotice />
    <Suspense fallback={<p role="status">Loading REFLINK workspace…</p>}><App /></Suspense>
  </StrictMode>,
)
