/**
 * ConnectionContext – Server reachability  v5.0
 *
 * [Bug 8] Fix: This is now the SINGLE source of truth for /health pinging.
 *   - syncService.js uses the imported `checkHealth` from apiClient (same logic).
 *   - This context focuses on the USER-FACING banner only.
 *   - Uses FAIL_THRESHOLD=2 to avoid flipping offline on a single slow response.
 *   - Banner text is clear and non-alarming: "Working offline – data saved locally"
 *   - Dispatches 'server-online' / 'server-offline' custom events so syncService
 *     can react without React coupling.
 */
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { checkHealth, checkInternet, onAppReady } from '../utils/apiClient';

const POLL_INTERVAL_MS = 15_000;
const FAIL_THRESHOLD   = 2;   // consecutive failures before marking offline

const ConnectionContext = createContext({
  isServerReachable: true,
  serverStatus:      'online',   // 'online' | 'checking' | 'offline'
  retryNow:          () => {},
});

export function ConnectionProvider({ children }) {
  const [serverStatus, setServerStatus] = useState('checking');
  const failStreak = useRef(0);
  const pollRef    = useRef(null);
  const lastStatus = useRef('checking');
  const statusRef  = useRef('checking'); // mirrors state without triggering re-render
  const isCheckingRef = useRef(false);
  const abortControllerRef = useRef(null);

  const check = useCallback(async (isInitialOrRetry = false) => {
    if (isCheckingRef.current) {
      return; // Prevent duplicate checks
    }
    isCheckingRef.current = true;

    // Abort any active check
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Retry loop for the active check
    const maxAttempts = isInitialOrRetry ? 3 : 1;
    let success = false;
    let isOffline = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (controller.signal.aborted) break;

      // 1. Check physical internet state first
      const online = await checkInternet();
      if (!online) {
        isOffline = true;
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        break;
      }

      // 2. Perform silent backend health ping
      try {
        const ok = await checkHealth(3000, 1, controller.signal);
        if (ok) {
          success = true;
          break;
        }
      } catch (err) {
        // silent fail for this attempt
      }

      if (attempt < maxAttempts) {
        // sleep before retry
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (controller.signal.aborted) {
      isCheckingRef.current = false;
      return;
    }

    if (success) {
      failStreak.current = 0;
      if (lastStatus.current !== 'online') {
        lastStatus.current = 'online';
        statusRef.current  = 'online';
        setServerStatus('online');
        window.dispatchEvent(new CustomEvent('server-online'));
      }
    } else {
      failStreak.current += 1;
      
      const shouldMarkDown = isInitialOrRetry || failStreak.current >= FAIL_THRESHOLD;
      if (shouldMarkDown) {
        const nextStatus = isOffline ? 'offline' : 'unreachable';
        if (lastStatus.current !== nextStatus) {
          lastStatus.current = nextStatus;
          statusRef.current  = nextStatus;
          setServerStatus(nextStatus);
          window.dispatchEvent(new CustomEvent('server-offline'));
        }
      }
    }

    if (abortControllerRef.current === controller) {
      abortControllerRef.current = null;
    }
    isCheckingRef.current = false;
  }, []);

  const retryNow = useCallback(async () => {
    setServerStatus('checking');
    lastStatus.current = 'checking';
    statusRef.current  = 'checking';
    await check(true);
  }, [check]);

  useEffect(() => {
    let active = true;

    // Initial check deferred until app is fully ready
    onAppReady().then(() => {
      if (!active) return;
      check(true);
      pollRef.current = setInterval(() => check(), POLL_INTERVAL_MS);
    });

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);

    let networkTimer = null;
    const handleNetworkChange = () => {
      if (networkTimer) clearTimeout(networkTimer);
      networkTimer = setTimeout(() => {
        retryNow();
      }, 500); // Debounce network transitions
    };

    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);

    const handleApiSuccess = () => {
      failStreak.current = 0;
      if (lastStatus.current === 'offline' || lastStatus.current === 'checking' || lastStatus.current === 'unreachable') {
        lastStatus.current = 'online';
        statusRef.current  = 'online';
        setServerStatus('online');
        window.dispatchEvent(new CustomEvent('server-online'));
      }
    };

    let apiFailureDebounce = null;
    const handleApiFailure = () => {
      if (apiFailureDebounce) clearTimeout(apiFailureDebounce);
      apiFailureDebounce = setTimeout(() => {
        check();
      }, 1000); // Debounce transient connection checks
    };

    window.addEventListener('api-call-success', handleApiSuccess);
    window.addEventListener('api-call-failure', handleApiFailure);

    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
      window.removeEventListener('api-call-success', handleApiSuccess);
      window.removeEventListener('api-call-failure', handleApiFailure);
      if (networkTimer) clearTimeout(networkTimer);
      if (apiFailureDebounce) clearTimeout(apiFailureDebounce);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [check, retryNow]);

  // UI stays responsive and behaves reachable during the 'checking' transition
  const isServerReachable = serverStatus === 'online' || serverStatus === 'checking';

  return (
    <ConnectionContext.Provider value={{ isServerReachable, serverStatus, retryNow }}>
      {children}
      {serverStatus !== 'online' && (
        <ConnectionBanner status={serverStatus} onRetry={retryNow} />
      )}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  return useContext(ConnectionContext);
}

// ── Offline banner ────────────────────────────────────────────────────────────
function ConnectionBanner({ status, onRetry }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position:     'fixed',
        bottom:       'calc(env(safe-area-inset-bottom) + 72px)',
        left:         '50%',
        transform:    'translateX(-50%)',
        zIndex:       9999,
        display:      'flex',
        alignItems:   'center',
        gap:          '10px',
        background:   '#1e293b',
        color:        '#f1f5f9',
        padding:      '10px 20px',
        borderRadius: '999px',
        fontSize:     '13px',
        fontWeight:   600,
        boxShadow:    '0 4px 24px rgba(0,0,0,0.25)',
        whiteSpace:   'nowrap',
      }}
    >
      {status === 'checking' ? (
        <>
          <span style={spinStyle}>⟳</span>
          Checking connection…
        </>
      ) : status === 'offline' ? (
        <>
          <span style={{ color: '#f97316' }}>●</span>
          Working offline — data saved locally
        </>
      ) : (
        <>
          <span style={{ color: '#f87171' }}>●</span>
          Server temporarily unreachable
          <button
            onClick={onRetry}
            style={{
              marginLeft:   '8px',
              background:   '#0ea5e9',
              border:       'none',
              color:        'white',
              borderRadius: '999px',
              padding:      '3px 12px',
              cursor:       'pointer',
              fontSize:     '12px',
              fontWeight:   700,
            }}
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}

const spinStyle = {
  display:   'inline-block',
  animation: 'connSpin 1s linear infinite',
};

if (typeof document !== 'undefined') {
  const id = '__conn-spin-v5';
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = '@keyframes connSpin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }';
    document.head.appendChild(s);
  }
}
