/**
 * reminderEngine.js – Local reminder generation
 * ───────────────────────────────────────────────
 * [Bug 12] Fix: Reminders must NEVER depend on a server round-trip.
 *
 * When a visit is created (online or offline), call createLocalReminder()
 * immediately. The reminder is written directly to db.reminders so it
 * appears in the Reminders tab instantly — no sync required.
 *
 * After sync, the server's own reminder IDs are pulled down via
 * _pullFreshData → bulkUpsertReminders, which updates the local records
 * with real server IDs without duplicating them.
 */
import { db, SYNC, saveReminder, saveVisit } from './db';

/**
 * Generate and persist a local reminder for a visit.
 *
 * @param {Object} visit   — the full visit record (after saveVisit)
 * @param {Object} patient — the full patient record
 * @returns {Object}       — the saved reminder record
 */
export async function createLocalReminder(visit, patient) {
  if (!visit || !patient) return null;

  // Use the visit's own local_id as the reminder's local_id so that
  // bulkUpsertReminders (from server) can upsert the same record by id
  // and markVisitSynced can locate it.
  const local_id = visit.local_id;

  // Check if a reminder already exists for this visit
  const existing = await db.reminders.get(local_id);
  if (existing) return existing;

  const visitDate = visit.visit_date || visit.date || new Date().toISOString().split('T')[0];
  const visitTime = visit.time || '09:00';

  // Build a ISO datetime string for the reminder
  const dateTimeStr = `${visitDate}T${visitTime}:00`;

  const reminder = {
    local_id,
    id:         visit.id || null,          // null until synced
    patientId:  String(visit.patientId || visit.patient_id || patient.id || patient.local_id),
    patient_id: visit.patientId || visit.patient_id || patient.id || patient.local_id,
    patient:    patient.name,
    type:       visit.visit_type || visit.type || 'General',
    date:       dateTimeStr,
    visit_date: visitDate,
    time:       visitTime,
    status:     visit.status || 'PENDING',
    severity:   visit.severity || null,
    notes:      visit.notes || '',
    syncStatus: SYNC.PENDING,
    createdAt:  new Date().toISOString(),
    updatedAt:  Date.now(),
  };

  await saveReminder(reminder);

  // Notify Reminders page that local data changed
  window.dispatchEvent(new CustomEvent('local-data-written'));

  return reminder;
}

/**
 * Generate a follow-up reminder from a completed visit's next_checkup_date.
 * Called by CompleteVisit when the worker schedules a follow-up offline.
 *
 * @param {Object} completedVisit  — the completed visit record
 * @param {Object} patient         — the patient record
 * @param {string} followUpDate    — ISO date string (YYYY-MM-DD)
 * @param {string} [followUpTime]  — HH:MM, defaults to '09:00'
 * @returns {Object|null}          — saved follow-up visit + reminder records
 */
export async function createFollowUpLocally(completedVisit, patient, followUpDate, followUpTime = '09:00') {
  if (!followUpDate) return null;

  const pid = String(completedVisit.patientId || completedVisit.patient_id || patient.id || patient.local_id);

  // Prevent duplicate local follow-ups for the same patient on the same date
  try {
    const existingFollowUp = await db.visits
      .where('patientId').equals(pid)
      .filter(v => v.visit_type === 'Follow-up' && v.status === 'PENDING' && v.visit_date === followUpDate)
      .first();

    if (existingFollowUp) {
      console.log('[reminderEngine] createFollowUpLocally: duplicate follow-up check triggered, skipping creation');
      const reminder = await db.reminders.get(existingFollowUp.local_id);
      return { followUpVisit: existingFollowUp, reminder };
    }
  } catch (err) {
    console.warn('[reminderEngine] Failed to check for duplicate follow-up visit:', err);
  }

  const followUpLocalId = crypto.randomUUID();
  const followUpVisit = {
    local_id:   followUpLocalId,
    patientId:  pid,
    patient_id: pid,
    visit_type: 'Follow-up',
    type:       'Follow-up',
    visit_date: followUpDate,
    date:       followUpDate,
    time:       followUpTime,
    status:     'PENDING',
    severity:   null,
    notes:      `Follow-up from visit on ${completedVisit.visit_date || completedVisit.date}`,
    syncStatus: SYNC.PENDING,
    createdAt:  new Date().toISOString(),
  };

  await saveVisit(followUpVisit);
  const reminder = await createLocalReminder(followUpVisit, patient);

  return { followUpVisit, reminder };
}
