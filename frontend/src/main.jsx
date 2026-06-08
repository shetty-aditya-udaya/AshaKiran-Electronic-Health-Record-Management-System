import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n'
import { ConnectionProvider } from './context/ConnectionContext.jsx'
import { SyncProvider } from './context/SyncContext.jsx'

// Centralized Version-Clear mechanism to purge outdated SWs and stale caches automatically
const APP_VERSION = '1.3';
const storedVersion = localStorage.getItem('ashakiran_app_version');
if (storedVersion !== APP_VERSION) {
  const currentLang = localStorage.getItem('lang') || 'en';
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('lang', currentLang);
  localStorage.setItem('ashakiran_app_version', APP_VERSION);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const r of registrations) {
        r.unregister().catch(() => {});
      }
    }).catch(() => {});
  }

  if (typeof caches !== 'undefined') {
    caches.keys().then(keys => {
      for (const key of keys) {
        caches.delete(key).catch(() => {});
      }
    }).catch(() => {});
  }

  window.location.reload();
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ConnectionProvider>
    <SyncProvider>
      <App />
    </SyncProvider>
  </ConnectionProvider>
)
