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
const FORCE_PURGE_KEY = 'ashakiran_force_sw_clear_v1.4';

let isStorageSupported = true;
try {
  const testKey = '__ak_storage_test__';
  localStorage.setItem(testKey, testKey);
  localStorage.removeItem(testKey);
} catch (e) {
  isStorageSupported = false;
}

const storedVersion = isStorageSupported ? localStorage.getItem('ashakiran_app_version') : null;
const needsPurge = isStorageSupported && ((storedVersion !== APP_VERSION) || !localStorage.getItem(FORCE_PURGE_KEY));

if (needsPurge) {
  try {
    // Prevent infinite loops by setting the keys immediately
    localStorage.setItem('ashakiran_app_version', APP_VERSION);
    localStorage.setItem(FORCE_PURGE_KEY, 'true');
  } catch (e) {}

  // Inject a styled, professional updating interface during the async cleanup
  const rootEl = document.getElementById('root');
  if (rootEl) {
    rootEl.innerHTML = `
      <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;background-color:#F8FAFC;color:#1a2e2e;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;gap:1.5rem;padding:2rem;text-align:center;">
        <div style="width:2.5rem;height:2.5rem;border:4px solid #e2e8f0;border-top-color:#0F766E;border-radius:50%;animation:ak-spin 1s linear infinite;"></div>
        <div>
          <h2 style="font-size:1.25rem;font-weight:600;color:#0F766E;margin:0 0 0.5rem 0;">Updating AshaKiran</h2>
          <p style="font-size:0.95rem;color:#64748b;margin:0;max-width:320px;line-height:1.5;">Clearing stale system cache and service workers for a fresh update...</p>
        </div>
        <style>
          @keyframes ak-spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </div>
    `;
  }

  (async () => {
    try {
      // Preserve crucial session and offline sync state to prevent forced logout and data sync loss
      const token = isStorageSupported ? localStorage.getItem('token') : null;
      const user = isStorageSupported ? localStorage.getItem('user') : null;
      const currentLang = (isStorageSupported ? localStorage.getItem('lang') : null) || 'en';
      const tombstones = isStorageSupported ? localStorage.getItem('ak_deleted_visit_ids') : null;
      const lastSyncPatients = isStorageSupported ? localStorage.getItem('last_sync_patients') : null;
      const lastSyncRecords = isStorageSupported ? localStorage.getItem('last_sync_records') : null;
      const lastSyncReminders = isStorageSupported ? localStorage.getItem('last_sync_reminders') : null;

      // 1. Unregister all existing service workers asynchronously
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length > 0) {
          await Promise.all(registrations.map(registration => registration.unregister()));
          console.log("Old service workers removed");
        }
      }

      // 2. Clear old caches asynchronously
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        if (keys.length > 0) {
          await Promise.all(keys.map(key => caches.delete(key)));
          console.log("Caches cleared successfully");
        }
      }

      // 3. Purge storage
      if (isStorageSupported) {
        localStorage.clear();
      }
      try {
        sessionStorage.clear();
      } catch (e) {}

      // Restore crucial session & offline sync state
      if (isStorageSupported) {
        localStorage.setItem('ashakiran_app_version', APP_VERSION);
        localStorage.setItem(FORCE_PURGE_KEY, 'true');
        if (token) localStorage.setItem('token', token);
        if (user) localStorage.setItem('user', user);
        localStorage.setItem('lang', currentLang);
        if (tombstones) localStorage.setItem('ak_deleted_visit_ids', tombstones);
        if (lastSyncPatients) localStorage.setItem('last_sync_patients', lastSyncPatients);
        if (lastSyncRecords) localStorage.setItem('last_sync_records', lastSyncRecords);
        if (lastSyncReminders) localStorage.setItem('last_sync_reminders', lastSyncReminders);
      }

      // Force fresh assets/API configuration loading by reloading the page
      window.location.reload();
    } catch (err) {
      console.error("Failed to run cache/SW purge:", err);
      window.location.reload();
    }
  })();
}

if (!needsPurge) {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <ConnectionProvider>
      <SyncProvider>
        <App />
      </SyncProvider>
    </ConnectionProvider>
  );
}
