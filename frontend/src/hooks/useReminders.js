/**
 * useReminders – Derived reminders hook using visits-first architecture.
 *
 * This hook is the single source of truth for all reminder data.
 * It reads visits as the primary authoritative record and overlays reminder metadata.
 * It enriches the records with patient details (name, village, category) and computes
 * the reminder status dynamically based on current date.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  getAllVisits,
  getAllReminders,
  getAllPatients,
  bulkUpsertPatients,
  bulkUpsertReminders,
  createReportFolder,
  SYNC,
} from '../lib/db';
import { api, NetworkError } from '../utils/apiClient';
import { useConnection } from '../context/ConnectionContext';

const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const extractDatePart = (dStr) => {
  if (!dStr) return '';
  return dStr.split('T')[0];
};

export function useReminders() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    overdue: 0,
    today: 0,
    upcoming: 0,
    completed: 0,
  });
  const { isServerReachable } = useConnection();

  const refresh = useCallback(async () => {
    try {
      const [localVisits, localReminders, localPatients] = await Promise.all([
        getAllVisits(),
        getAllReminders(),
        getAllPatients(),
      ]);

      const patientMap = new Map();
      for (const p of localPatients) {
        if (p.id) patientMap.set(String(p.id), p);
        if (p.local_id) patientMap.set(String(p.local_id), p);
      }

      const reminderMap = new Map();
      for (const r of localReminders) {
        if (r.local_id) reminderMap.set(String(r.local_id), r);
        if (r.id) reminderMap.set(String(r.id), r);
      }

      const todayStr = getLocalDateString();
      let overdueCount = 0;
      let todayCount = 0;
      let upcomingCount = 0;
      let completedCount = 0;

      const enrichedReminders = localVisits.map(visit => {
        // Find matching patient
        const patientIdKey = visit.patientId || visit.patient_id;
        const patient = patientIdKey ? patientMap.get(String(patientIdKey)) : null;

        // Find matching reminder metadata
        const reminder = reminderMap.get(String(visit.local_id)) || (visit.id ? reminderMap.get(String(visit.id)) : null);

        // Determine date
        const rawDate = visit.visit_date || visit.date || (reminder ? (reminder.visit_date || reminder.date) : '');
        const visitDateOnly = extractDatePart(rawDate);

        // Compute status dynamically
        let computedStatus = 'upcoming';
        if (visit.status === 'COMPLETED') {
          computedStatus = 'completed';
          completedCount++;
        } else if (visitDateOnly) {
          if (visitDateOnly < todayStr) {
            computedStatus = 'overdue';
            overdueCount++;
          } else if (visitDateOnly === todayStr) {
            computedStatus = 'today';
            todayCount++;
          } else {
            computedStatus = 'upcoming';
            upcomingCount++;
          }
        } else {
          upcomingCount++;
        }

        return {
          local_id: visit.local_id,
          id: visit.id,
          patientId: patientIdKey,
          patient_id: patientIdKey,
          patientName: patient?.name || visit.patient || (reminder ? reminder.patient : 'Unknown Patient'),
          patientCategory: patient?.category || 'General',
          village: patient?.village || 'Unknown Village',
          visit_type: visit.visit_type || visit.type || (reminder ? reminder.type : 'General'),
          type: visit.visit_type || visit.type || (reminder ? reminder.type : 'General'),
          visit_date: visitDateOnly,
          date: rawDate,
          time: visit.time || (reminder ? reminder.time : '09:00'),
          status: visit.status || 'PENDING',
          computedStatus,
          severity: visit.severity || (reminder ? reminder.severity : null),
          notes: visit.notes || (reminder ? reminder.notes : ''),
          syncStatus: visit.syncStatus,
        };
      });

      setReminders(enrichedReminders);
      setStats({
        total: enrichedReminders.length,
        overdue: overdueCount,
        today: todayCount,
        upcoming: upcomingCount,
        completed: completedCount,
      });
    } catch (err) {
      console.error('[useReminders] Refresh error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFromServer = useCallback(async () => {
    if (!localStorage.getItem('token') || !isServerReachable) return;
    try {
      // 1. Fetch patients
      const patientsData = await api.get('/api/patients');
      const patientArr = Array.isArray(patientsData) ? patientsData : (patientsData?.patients || []);
      const patientRecords = await bulkUpsertPatients(patientArr);
      await Promise.all(patientRecords.map(p => createReportFolder(p)));

      // 2. Fetch all reminders (which are visits in the backend)
      const remindersData = await api.get('/api/reminders/all');
      const reminderArr = Array.isArray(remindersData) ? remindersData : [];
      await bulkUpsertReminders(reminderArr);

      // 3. Re-load and enrich local data
      await refresh();
    } catch (err) {
      if (!(err instanceof NetworkError)) {
        console.warn('[useReminders] fetchFromServer failed:', err);
      }
    }
  }, [isServerReachable, refresh]);

  // Load local data immediately on mount
  useEffect(() => {
    refresh().then(() => {
      fetchFromServer();
    });
  }, [refresh, fetchFromServer]);

  // Subscribe to local database changes
  useEffect(() => {
    const onSync = () => refresh();
    window.addEventListener('local-data-written', onSync);
    return () => window.removeEventListener('local-data-written', onSync);
  }, [refresh]);

  return {
    reminders,
    stats,
    loading,
    refresh,
    fetchFromServer,
  };
}
