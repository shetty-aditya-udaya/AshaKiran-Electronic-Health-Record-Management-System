/**
 * useReports – offline-first Reports tab hook.
 *
 * Provides the list of patient report folders for the Reports page.
 * Strategy:
 *  1. Load from IDB immediately (zero-wait)
 *  2. Merge fresh server data in background when online
 *  3. Never show empty state if local data exists
 *  4. Always resolve loading=false — even when there's no data yet
 */
import { useState, useEffect, useCallback } from 'react';
import {
  getAllReportFolders,
  bulkUpsertReportFolders,
  SYNC,
} from '../lib/db';
import { api, NetworkError } from '../utils/apiClient';
import toast from 'react-hot-toast';

export function useReports() {
  const [folders, setFolders]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [error, setError]       = useState(null);

  // ── Load IDB immediately ───────────────────────────────────────────────
  const loadLocal = useCallback(async () => {
    const local = await getAllReportFolders();
    setFolders(local);
    // Always mark loading done after IDB read, regardless of count.
    // Previously this was gated on local.length > 0, which left the
    // loading spinner forever when a patient was just added offline
    // and the folder was freshly created in IDB.
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const local = await getAllReportFolders();
    setFolders(local);
  }, []);

  // ── Fetch from server + merge ──────────────────────────────────────────
  // NOTE: Do NOT gate on isServerReachable here — that flag can lag behind
  // actual connectivity. The API client has its own timeout + retry logic.
  // We always attempt the fetch and gracefully catch NetworkError.
  const fetchFromServer = useCallback(async (silent = false) => {
    if (!localStorage.getItem('token')) return; // not logged in
    if (!silent) setSyncing(true);
    try {
      const data = await api.get('/api/reports/patients');
      const arr  = Array.isArray(data) ? data : [];
      await bulkUpsertReportFolders(arr);
      await refresh();
      setError(null);
    } catch (err) {
      if (err instanceof NetworkError) {
        // Silent – already showing local data
      } else if (err?.status === 401) {
        setError('unauthorized');
      } else if (!silent) {
        toast.error('Could not refresh reports – showing cached data 📡');
      }
    } finally {
      setSyncing(false);
      // Always ensure loading is resolved even if server fetch fails
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    loadLocal().then(() => fetchFromServer(true));
  }, [loadLocal, fetchFromServer]);

  // Re-read when new patients are added locally (offline or online)
  useEffect(() => {
    const onWrite = () => refresh();
    window.addEventListener('local-data-written', onWrite);
    window.addEventListener('patient-added',       onWrite);
    return () => {
      window.removeEventListener('local-data-written', onWrite);
      window.removeEventListener('patient-added',       onWrite);
    };
  }, [refresh]);

  return { folders, loading, syncing, error, refresh, fetchFromServer };
}
