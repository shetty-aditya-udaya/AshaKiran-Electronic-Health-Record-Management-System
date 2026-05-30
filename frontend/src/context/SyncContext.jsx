/**
 * SyncContext - Global sync state provider  v6.0
 *
 * Status transitions:
 *   idle     -> nothing to show
 *   syncing  -> animated spinner  "Syncing N records..."
 *   synced   -> checkmark         "All synced"        (fades after 3s)
 *   pending  -> amber dot         "N changes waiting"
 *   failed   -> red               "Sync failed - Retry?"
 */
import React, { createContext, useEffect, useRef, useState, useCallback } from 'react';
import { initAutoSync, onSyncStatusChange, syncAll, resetSyncEngine } from '../lib/syncService';

export const SyncContext = createContext({
  syncStatus:   'idle',
  pendingCount: 0,
  triggerSync:  () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function SyncProvider({ children }) {
  const [syncStatus,   setSyncStatus]  = useState('idle');
  const [pendingCount, setPending]     = useState(0);
  const unsubRef     = useRef(null);
  const engineReady  = useRef(false);

  const startEngine = useCallback(() => {
    if (engineReady.current) return;
    if (!localStorage.getItem('token')) return;
    engineReady.current = true;
    unsubRef.current = onSyncStatusChange(({ status, pendingCount: pc }) => {
      setSyncStatus(status);
      setPending(pc ?? 0);
    });
    initAutoSync();
  }, []);

  const stopEngine = useCallback(() => {
    if (!engineReady.current) return;
    engineReady.current = false;
    unsubRef.current?.();
    unsubRef.current = null;
    resetSyncEngine();
    setSyncStatus('idle');
    setPending(0);
  }, []);

  useEffect(() => {
    startEngine();
    const onStorage = (e) => {
      if (e.key !== 'token') return;
      if (e.newValue) { startEngine(); } else { stopEngine(); }
    };
    const onLogin  = () => startEngine();
    const onLogout = () => stopEngine();
    window.addEventListener('storage',          onStorage);
    window.addEventListener('user-logged-in',   onLogin);
    window.addEventListener('user-logged-out',  onLogout);
    return () => {
      window.removeEventListener('storage',         onStorage);
      window.removeEventListener('user-logged-in',  onLogin);
      window.removeEventListener('user-logged-out', onLogout);
      unsubRef.current?.();
    };
  }, [startEngine, stopEngine]);

  return (
    <SyncContext.Provider value={{ syncStatus, pendingCount, triggerSync: syncAll }}>
      {children}
      <SyncStatusPill status={syncStatus} pending={pendingCount} onRetry={syncAll} />
    </SyncContext.Provider>
  );
}

// ── CSS keyframes injected once into <head> ───────────────────────────────────
const PILL_STYLES = `
  @keyframes _ak_spin    { to { transform: rotate(360deg); } }
  @keyframes _ak_slideup { from { opacity:0; transform:translateY(8px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }
`;
let _stylesInjected = false;
function ensureStyles() {
  if (_stylesInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.id = 'ak-sync-pill-styles';
  el.textContent = PILL_STYLES;
  document.head.appendChild(el);
  _stylesInjected = true;
}

// ── SyncStatusPill ────────────────────────────────────────────────────────────
function SyncStatusPill({ status, pending, onRetry }) {
  ensureStyles();

  if (!localStorage.getItem('token')) return null;
  if (status === 'idle') return null;

  // Derive icon + label + colours from status
  let icon = null;
  let label = '';
  let accentColor = '#94a3b8';
  let pillBg = '#1e293b';

  if (status === 'syncing') {
    accentColor = '#38bdf8';
    label = pending > 0
      ? `Syncing ${pending} record${pending > 1 ? 's' : ''}...`
      : 'Syncing...';
    icon = (
      <span style={{
        display: 'inline-block', width: '11px', height: '11px',
        borderRadius: '50%', border: '2px solid rgba(56,189,248,0.25)',
        borderTopColor: '#38bdf8', flexShrink: 0,
        animation: '_ak_spin 0.7s linear infinite',
      }} />
    );
  } else if (status === 'synced') {
    accentColor = '#4ade80';
    label = 'All synced';
    icon = <span style={{ color: '#4ade80', fontSize: '14px', lineHeight: 1 }}>&#10003;</span>;
  } else if (status === 'pending') {
    accentColor = '#fbbf24';
    label = pending > 0 ? `${pending} change${pending > 1 ? 's' : ''} waiting` : 'Changes waiting';
    icon = (
      <span style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: '#fbbf24', flexShrink: 0, display: 'inline-block',
        boxShadow: '0 0 6px rgba(251,191,36,0.5)',
      }} />
    );
  } else if (status === 'failed') {
    accentColor = '#f87171';
    label = 'Sync failed';
    pillBg = '#450a0a';
    icon = <span style={{ color: '#f87171', fontSize: '13px', lineHeight: 1 }}>&#9888;</span>;
  }

  const isClickable = status === 'failed' || status === 'pending';

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={isClickable ? onRetry : undefined}
      style={{
        position: 'fixed',
        bottom:   'calc(env(safe-area-inset-bottom) + 72px)',
        right:    '16px',
        zIndex:   9000,
        display:  'flex',
        alignItems: 'center',
        gap:      '6px',
        background: pillBg === '#450a0a' ? '#450a0a' : 'rgba(30, 41, 59, 0.95)',
        backdropFilter: 'blur(8px)',
        color:    '#f8fafc',
        padding:  '4px 10px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: 500,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06), 0 2px 6px rgba(0, 0, 0, 0.03)',
        whiteSpace: 'nowrap',
        cursor:   isClickable ? 'pointer' : 'default',
        opacity:  status === 'synced' ? 0.9 : 1,
        animation: '_ak_slideup 0.2s ease',
        userSelect: 'none',
        letterSpacing: '0.01em',
        border:   `1px solid rgba(255, 255, 255, 0.08)`,
      }}
    >
      {icon}
      <span style={{ color: accentColor, fontWeight: 600 }}>{label}</span>
      {isClickable && (
        <button
          onClick={(e) => { e.stopPropagation(); onRetry(); }}
          style={{
            marginLeft: '6px',
            background: '#10b981',
            border: 'none',
            color: 'white',
            borderRadius: '4px',
            padding: '1px 6px',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.02em',
            boxShadow: 'none',
            transition: 'background-color 0.2s',
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#059669'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#10b981'}
        >
          Sync Now
        </button>
      )}
    </div>
  );
}
