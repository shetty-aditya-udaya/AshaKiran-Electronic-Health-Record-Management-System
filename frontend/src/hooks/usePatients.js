/**
 * usePatients – offline-first patient data hook.
 *
 * Strategy:
 *  1. Immediately return locally cached data (IDB) → zero loading flicker
 *  2. If online, fetch fresh data from server in background and merge
 *  3. New patients added offline are stored locally with syncStatus=pending
 *  4. EVERY patient gets a report folder created in IDB immediately
 *  5. Sync service pushes them to backend when online
 */
import { useState, useEffect, useCallback } from 'react';
import {
  getAllPatients, savePatient, bulkUpsertPatients,
  createReportFolder, SYNC, deletePatientAndAllData,
} from '../lib/db';
import { api, NetworkError } from '../utils/apiClient';
import toast from 'react-hot-toast';

export function usePatients() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [error, setError]       = useState(null);

  // ── Load from IDB first (instant, zero-wait) ───────────────────────────────
  const loadLocal = useCallback(async () => {
    const local = await getAllPatients();
    if (local.length > 0) {
      setPatients(local);
      setLoading(false);
    }
  }, []);

  // ── Fetch from server and merge ────────────────────────────────────────────
  // NOTE: Do NOT gate on navigator.onLine — it is unreliable (returns true on
  // captive portals / slow connections). The API client has its own timeout
  // and the sync engine has proper connectivity detection.
  const fetchFromServer = useCallback(async (silent = false) => {
    if (!localStorage.getItem('token')) return; // not logged in
    if (!silent) setSyncing(true);
    try {
      const data = await api.get('/api/patients');
      const arr  = Array.isArray(data) ? data : (data?.patients || []);

      // Persist to IDB and create report folders for any new server patients
      const records = await bulkUpsertPatients(arr);
      await Promise.all(records.map(p => createReportFolder(p)));

      // Re-read from IDB (includes pending local records too)
      const merged = await getAllPatients();
      setPatients(merged);
      setError(null);
    } catch (err) {
      if (err instanceof NetworkError) {
        // Already have local data — silent fail is correct behaviour
      } else if (err?.status === 401) {
        setError('unauthorized');
      } else if (!silent) {
        toast.error('Could not refresh patients – showing cached data 📡');
      }
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, []);

  // ── Re-read IDB into state ─────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const local = await getAllPatients();
    setPatients(local);
  }, []);

  // ── Add patient (offline-first) ────────────────────────────────────────────
  const addPatient = useCallback(async (formData) => {
    const local_id = formData.local_id || crypto.randomUUID();
    const record = {
      ...formData,
      local_id,
      syncStatus: SYNC.PENDING,
      createdAt:  formData.createdAt || new Date().toISOString(),
    };

    // 1. Save patient locally → immediate UI update
    await savePatient(record);

    // 2. Create report folder immediately – no backend needed
    await createReportFolder(record);

    await refresh();
    window.dispatchEvent(new CustomEvent('local-data-written'));
    window.dispatchEvent(new CustomEvent('patient-added'));

    // 3. Try to push to server right now if online
    if (navigator.onLine) {
      try {
        const data     = await api.post('/api/patients', record);
        const serverId = data?.patient?.id ?? data?.id;
        const synced   = { ...record, syncStatus: SYNC.SYNCED, id: serverId };

        await savePatient(synced);
        // Update report folder with real server id
        await createReportFolder(synced);
        await refresh();

        return synced;
      } catch (err) {
        if (!(err instanceof NetworkError)) {
          console.warn('[usePatients] Immediate push failed:', err.message);
        }
      }
    }

    return record;
  }, [refresh]);

  useEffect(() => {
    loadLocal().then(() => fetchFromServer(true));
  }, [loadLocal, fetchFromServer]);

  // Re-read IDB on local writes (e.g. after sync service updates records)
  useEffect(() => {
    const onSync = () => refresh();
    window.addEventListener('local-data-written', onSync);
    return () => window.removeEventListener('local-data-written', onSync);
  }, [refresh]);

  // ── Delete patient (offline-first) ────────────────────────────────────────
  const deletePatient = useCallback(async (patient) => {
    const localId   = patient.local_id;
    const serverId  = patient.id;

    // 1. Instantly purge from IDB — UI sees change immediately
    await deletePatientAndAllData(localId, serverId);
    await refresh();
    window.dispatchEvent(new CustomEvent('local-data-written'));
    window.dispatchEvent(new CustomEvent('patient-deleted'));

    // 2. If online and patient was synced to server, delete on server
    if (serverId && navigator.onLine) {
      try {
        await api.delete(`/api/patients/${serverId}`);
      } catch (err) {
        // If 404 — already gone on server, that's fine
        if (err?.status !== 404) {
          console.warn('[usePatients] Server delete failed (IDB already cleaned):', err.message);
        }
      }
    }
  }, [refresh]);

  return { patients, loading, syncing, error, addPatient, deletePatient, refresh, fetchFromServer };
}
