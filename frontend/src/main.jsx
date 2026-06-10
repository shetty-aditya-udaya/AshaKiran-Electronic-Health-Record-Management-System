import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n'
import { ConnectionProvider } from './context/ConnectionContext.jsx'
import { SyncProvider } from './context/SyncContext.jsx'
import * as Sentry from '@sentry/react'

// ── Sentry Error Tracking Setup ──
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  try {
    Sentry.init({
      dsn: sentryDsn,
      integrations: [
        new Sentry.BrowserTracing()
      ],
      tracesSampleRate: 1.0,
    });
    console.log('[Sentry] Frontend exception monitoring initialized successfully!');
  } catch (err) {
    console.error('[Sentry] Failed to initialize Sentry:', err);
  }
}

// ── Diagnostics Console Log Interceptor ──
window.__ak_logs = window.__ak_logs || [];
const captureLog = (type, args) => {
  try {
    const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    window.__ak_logs.push({
      time: new Date().toLocaleTimeString(),
      type,
      message: msg.substring(0, 500)
    });
    if (window.__ak_logs.length > 50) window.__ak_logs.shift();
  } catch (err) {}
};

const origWarn = console.warn;
const origError = console.error;

console.warn = (...args) => {
  captureLog('warn', args);
  origWarn.apply(console, args);
};

console.error = (...args) => {
  captureLog('error', args);
  origError.apply(console, args);
};


// Centralized Version-Clear mechanism to purge outdated SWs and stale caches automatically
const APP_VERSION = '1.3';
const storedVersion = localStorage.getItem('ashakiran_app_version');
if (storedVersion !== APP_VERSION) {
  // Preserve crucial session and offline sync state to prevent forced logout and data sync loss
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  const currentLang = localStorage.getItem('lang') || 'en';
  const tombstones = localStorage.getItem('ak_deleted_visit_ids');
  const lastSyncPatients = localStorage.getItem('last_sync_patients');
  const lastSyncRecords = localStorage.getItem('last_sync_records');
  const lastSyncReminders = localStorage.getItem('last_sync_reminders');

  localStorage.clear();
  sessionStorage.clear();

  if (token) localStorage.setItem('token', token);
  if (user) localStorage.setItem('user', user);
  localStorage.setItem('lang', currentLang);
  if (tombstones) localStorage.setItem('ak_deleted_visit_ids', tombstones);
  if (lastSyncPatients) localStorage.setItem('last_sync_patients', lastSyncPatients);
  if (lastSyncRecords) localStorage.setItem('last_sync_records', lastSyncRecords);
  if (lastSyncReminders) localStorage.setItem('last_sync_reminders', lastSyncReminders);

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
