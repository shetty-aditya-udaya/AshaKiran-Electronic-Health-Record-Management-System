/**
 * useVisits – offline-first visits hook for a specific patient.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  getVisitsForPatient, saveVisit, bulkUpsertVisits, SYNC,
} from '../lib/db';
import { api, NetworkError } from '../utils/apiClient';
import toast from 'react-hot-toast';

export function useVisits(patientId) {
  const [visits, setVisits]   = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!patientId) return;
    const local = await getVisitsForPatient(patientId);
    setVisits(local);
  }, [patientId]);

  const fetchFromServer = useCallback(async () => {
    if (!patientId || !navigator.onLine) return;
    try {
      const data = await api.get(`/api/patients/${patientId}/visits`);
      const arr  = Array.isArray(data) ? data : (data?.visits || []);
      // Tag with patientId for IDB query
      const tagged = arr.map(v => ({ ...v, patientId: String(patientId) }));
      await bulkUpsertVisits(tagged);
      await refresh();
    } catch (err) {
      if (!(err instanceof NetworkError)) {
        console.warn('[useVisits] Fetch failed:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [patientId, refresh]);

  const addVisit = useCallback(async (formData) => {
    const local_id = crypto.randomUUID();
    const record = {
      ...formData,
      local_id,
      patientId: String(patientId),
      syncStatus: SYNC.PENDING,
      createdAt:  new Date().toISOString(),
    };

    // 1. Save locally immediately
    await saveVisit(record);
    await refresh();
    window.dispatchEvent(new CustomEvent('local-data-written'));
    window.dispatchEvent(new CustomEvent('visit-added'));

    // 2. Try to push now if online
    if (navigator.onLine) {
      try {
        const data = await api.post('/api/visits', { ...record, patientId });
        const serverId = data?.visit?.id ?? data?.id;
        await saveVisit({ ...record, syncStatus: SYNC.SYNCED, id: serverId });
        await refresh();
        return { ...record, syncStatus: SYNC.SYNCED, id: serverId };
      } catch (err) {
        if (!(err instanceof NetworkError)) {
          console.warn('[useVisits] Immediate push failed:', err);
        }
      }
    }

    return record;
  }, [patientId, refresh]);

  useEffect(() => {
    refresh().then(() => {
      fetchFromServer().finally(() => setLoading(false));
    });
  }, [patientId, refresh, fetchFromServer]);

  return { visits, loading, addVisit, refresh };
}
