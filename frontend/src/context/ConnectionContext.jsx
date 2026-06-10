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
  const pollRef    = useRef(null);

  // Stabilization and Anti-Blinking State
  const lastStatus = useRef('checking');
  const statusRef  = useRef('checking'); // mirrors serverStatus without re-rendering
  const lastStatusChangeTime = useRef(Date.now());
  const consecutiveFailures = useRef(0);
  const verificationTimer = useRef(null);
  const isCheckingRef = useRef(false);
  const abortControllerRef = useRef(null);

  const MIN_STATE_DURATION_MS = 5000; // 5 seconds minimum in any status to prevent UI blinking

  const transitionTo = useCallback((nextStatus) => {
    if (nextStatus === lastStatus.current) return;

    const now = Date.now();
    const duration = now - lastStatusChangeTime.current;

    // Enforce minimum state duration only when transitioning to an offline/unreachable state (prevent flickering),
    // but ALWAYS allow transitioning to 'online' immediately so the interface responds instantly.
    if (nextStatus !== 'online' && lastStatus.current !== 'checking' && duration < MIN_STATE_DURATION_MS) {
      console.warn(`[Connection] Status transition blocked to prevent blinking: ${lastStatus.current} -> ${nextStatus} (${duration}ms < ${MIN_STATE_DURATION_MS}ms)`);
      return;
    }

    console.log(`[Connection] Status changed: ${lastStatus.current} -> ${nextStatus} (persisted ${duration}ms)`);
    lastStatus.current = nextStatus;
    statusRef.current  = nextStatus;
    setServerStatus(nextStatus);
    lastStatusChangeTime.current = now;

    if (nextStatus === 'online') {
      window.dispatchEvent(new CustomEvent('server-online'));
    } else if (nextStatus === 'offline' || nextStatus === 'unreachable') {
      window.dispatchEvent(new CustomEvent('server-offline'));
    }
  }, []);

  const runVerificationLoop = useCallback((signal) => {
    let attempts = 0;
    const maxAttempts = 3; // Ping every 3 seconds, up to 3 times (approx 9-10s verification window)

    const runPing = async () => {
      if (consecutiveFailures.current === 0 || signal.aborted) return;
      attempts += 1;

      console.log(`[Connection Debug] Verification ping ${attempts}/${maxAttempts} running...`);
      try {
        const ok = await checkHealth(6000, 1, signal);
        if (ok) {
          console.log(`[Connection Debug] Verification ping succeeded. Restoring status to online.`);
          consecutiveFailures.current = 0;
          transitionTo('online');
          return;
        }
      } catch (err) {
        console.warn(`[Connection Debug] Verification ping ${attempts} failed:`, err.message);
      }

      if (attempts < maxAttempts) {
        verificationTimer.current = setTimeout(runPing, 3000);
      } else {
        console.warn(`[Connection Debug] All ${maxAttempts} verification attempts failed. Confirming server unreachable.`);
        const hasInternet = await checkInternet();
        const nextStatus = hasInternet ? 'unreachable' : 'offline';
        transitionTo(nextStatus);
      }
    };

    verificationTimer.current = setTimeout(runPing, 3000);
  }, [transitionTo]);

  const check = useCallback(async (isImmediateRetry = false) => {
    if (isCheckingRef.current) {
      return; // Prevent duplicate checks
    }
    isCheckingRef.current = true;

    // Abort active check
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Clear verification timer on a fresh active check
    if (verificationTimer.current) {
      clearTimeout(verificationTimer.current);
      verificationTimer.current = null;
    }

    try {
      console.log(`[Connection Debug] Silent backend health ping starting... (Immediate: ${isImmediateRetry})`);
      const ok = await checkHealth(8000, 1, controller.signal);

      if (controller.signal.aborted) {
        isCheckingRef.current = false;
        return;
      }

      if (ok) {
        consecutiveFailures.current = 0;
        transitionTo('online');
      } else {
        consecutiveFailures.current += 1;
        console.warn(`[Connection Debug] Health check failed (streak=${consecutiveFailures.current})`);

        // Shield UI from transient drops: only transition to offline/unreachable if we exceed threshold,
        // or if it was an immediate manual retry request.
        if (consecutiveFailures.current >= FAIL_THRESHOLD || isImmediateRetry) {
          const hasInternet = await checkInternet();
          const nextStatus = hasInternet ? 'unreachable' : 'offline';
          transitionTo(nextStatus);
        } else {
          // If we haven't hit the threshold, run the silent verification loop to confirm outage
          runVerificationLoop(controller.signal);
        }
      }
    } catch (err) {
      // silent fail
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      isCheckingRef.current = false;
    }
  }, [transitionTo, runVerificationLoop]);

  const retryNow = useCallback(async () => {
    console.log(`[Connection] Manual retry triggered.`);
    setServerStatus('checking');
    lastStatus.current = 'checking';
    statusRef.current  = 'checking';
    consecutiveFailures.current = 0;
    if (verificationTimer.current) {
      clearTimeout(verificationTimer.current);
      verificationTimer.current = null;
    }
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
        console.log(`[Connection] Browser network change detected. Verifying live health...`);
        check();
      }, 1000); // Debounce network event triggers
    };

    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);

    const handleApiSuccess = () => {
      consecutiveFailures.current = 0;
      if (verificationTimer.current) {
        clearTimeout(verificationTimer.current);
        verificationTimer.current = null;
      }
      transitionTo('online');
    };

    let apiFailureDebounce = null;
    const handleApiFailure = () => {
      if (apiFailureDebounce) clearTimeout(apiFailureDebounce);
      apiFailureDebounce = setTimeout(() => {
        check();
      }, 1500); // Debounce transient connection checks
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
      if (verificationTimer.current) clearTimeout(verificationTimer.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [check, retryNow, transitionTo]);

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
