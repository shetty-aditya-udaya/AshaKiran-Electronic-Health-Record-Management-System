/**
 * AshaKiran – Sync Service  v6.0
 * ────────────────────────────────────────────
 * Fixes applied in this version:
 *  [Bug 3] Correct failed vs pending emission after sync
 *  [Bug 4] _wasOnline initialization — no spurious reconnect loops
 *  [Bug 6] No sync or pending emission when user is not logged in
 *  [Bug 7] Visit patientId UUID resolution — offline patients' visits no longer skipped
 *  [Bug 9] Adaptive heartbeat with jitter — no thundering-herd on reconnect
 *  [Bug 8] _isServerUp deduplication — single /health caller via checkHealth
 *  [Bug 10] _syncCompletedVisits — COMPLETED+PENDING visits with a server id now
 *           receive PATCH /api/visits/:id/complete + image uploads and are marked
 *           SYNCED atomically along with their linked reportItem and reminder.
 *  [Bug 11] _reconcileStaleRecords now detects locally-COMPLETED visits that were
 *           never pushed and schedules them for the _syncCompletedVisits pass instead
 *           of leaving them perpetually PENDING.
 *
 * State machine:
 *   idle     → nothing to show
 *   syncing  → actively pushing/pulling
 *   synced   → everything clean (auto-fades to idle after 3 s)
 *   pending  → items queued, waiting for connectivity
 *   failed   → items permanently failed (>MAX_ITEM_RETRIES, data error)
 */

import {
  db, SYNC,
  getPendingPatients,     markPatientSynced,     markPatientFailed,
  getPendingVisits,       markVisitSynced,       markVisitFailed,
  getPendingReportItems,  markReportItemSynced,  markReportItemFailed,
  bulkUpsertPatients, bulkUpsertVisits, bulkUpsertReminders,
  bulkUpsertReportFolders, createReportFolder,
  bulkUpsertReportItems,
  getPendingCount, getFullDiagnostics,
  clearAllLocalData,
} from './db';
import { api, NetworkError, checkHealth, ApiError } from '../utils/apiClient';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_ITEM_RETRIES  = 5;
const HEARTBEAT_MS      = 20_000;
const SYNCED_DISPLAY_MS = 3_000;

// Consecutive health-check failures before we flip _wasOnline to false.
// This prevents a single slow response flipping us offline and triggering
// a reconnect sync on the very next heartbeat.
const OFFLINE_THRESHOLD = 2;

// ── Module-level singletons ───────────────────────────────────────────────────
let _syncLock          = false;   // true while syncAll is running
let _listeners         = [];      // status-change subscribers
let _heartbeatTimer    = null;    // setInterval handle
let _autoSyncAttached  = false;   // guard against double-attaching events
// [Bug 4] Use undefined (not null or false) so the first heartbeat never
// triggers a false "reconnect" event.
let _wasOnline         = undefined;
let _failStreak        = 0;       // consecutive /health failures

// ── Logging helpers ───────────────────────────────────────────────────────────
const log = {
  info:  (...a) => console.log('%c[Sync]',  'color:#0ea5e9;font-weight:bold', ...a),
  warn:  (...a) => console.warn('%c[Sync]', 'color:#f59e0b;font-weight:bold', ...a),
  error: (...a) => console.error('%c[Sync]','color:#ef4444;font-weight:bold', ...a),
  debug: (...a) => console.debug('%c[Sync]','color:#94a3b8;font-weight:bold', ...a),
};

// ── Status emitter ────────────────────────────────────────────────────────────
export function onSyncStatusChange(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

function _emit(status, pendingCount = 0) {
  log.debug(`emit → ${status} (pending=${pendingCount})`);
  _listeners.forEach(fn => {
    try { fn({ status, pendingCount }); } catch {}
  });
}

// ── Connectivity gate ─────────────────────────────────────────────────────────
// Re-use checkHealth from apiClient — no duplicate /health polling.
// Track consecutive failures; only treat as offline after OFFLINE_THRESHOLD.
// IMPORTANT: returns true = server IS up, false = server is down.
async function _isServerUp() {
  const ok = await checkHealth();
  if (ok) {
    _failStreak = 0;
    return true;     // server is up
  }
  _failStreak++;
  // Only declare offline after N consecutive failures to avoid false-positives
  // on transient network blips.
  return false;      // server is down (regardless of streak)
}

// ── Count helpers ─────────────────────────────────────────────────────────────
async function _countFailed() {
  const [p, v, r] = await Promise.all([
    db.patients.where('syncStatus').equals(SYNC.FAILED).count(),
    db.visits.where('syncStatus').equals(SYNC.FAILED).count(),
    db.reportItems.where('syncStatus').equals(SYNC.FAILED).count(),
  ]);
  return p + v + r;
}

// ── Main sync entry point ─────────────────────────────────────────────────────
export async function syncAll() {
  if (_syncLock) {
    log.debug('syncAll() blocked — lock held');
    return;
  }

  // Check Web Locks support
  if (!navigator.locks) {
    log.debug('Web Locks not supported on this browser — executing sync fallback');
    return await _executeSyncInternal();
  }

  try {
    await navigator.locks.request('ashakiran_sync_mutex', { ifAvailable: true }, async (lock) => {
      if (!lock) {
        log.debug('Sync execution skipped — another browser tab is currently syncing');
        return;
      }
      await _executeSyncInternal();
    });
  } catch (lockErr) {
    log.error('Mutex locking error, executing fallback:', lockErr.message);
    await _executeSyncInternal();
  }
}

async function _executeSyncInternal() {
  // [Bug 6] Never sync or emit pending when user is not authenticated.
  const token = localStorage.getItem('token');
  if (!token) {
    log.debug('syncAll() skipped — no auth token');
    _emit('idle', 0);
    return;
  }

  // Gate: verify server is actually reachable via /health
  const serverUp = await checkHealth();

  if (!serverUp) {
    _failStreak++;
    // Only flip offline state after threshold to avoid false-positives
    if (_failStreak >= OFFLINE_THRESHOLD) {
      _wasOnline = false;
    }
    const n = await getPendingCount();
    if (n > 0) {
      _emit('pending', n);
    } else {
      _emit('idle', 0);
    }
    log.warn(`Server unreachable (streak=${_failStreak}), pending=${n}`);
    return;
  }

  // Server is back
  _failStreak = 0;
  const justReconnected = _wasOnline === false;
  _wasOnline = true;

  if (justReconnected) {
    log.info('Server came back online — triggering sync');
  }

  // ── Step 1: Reconcile first ──────────────────────────────────────────────────
  // Pull server data and reconcile before deciding what to push.
  // This resolves records that are locally PENDING/RETRYING but already exist
  // on the server (e.g. synced via a previous session, or the 500/IntegrityError
  // path where the server succeeded but the client never got the confirmation).
  await _reconcileStaleRecords();

  const pendingCount = await getPendingCount();

  if (pendingCount === 0) {
    // All items reconciled — nothing left to push
    _emit('synced', 0);
    // Run database pruning asynchronously in background
    import('./db').then(m => m.pruneOldSyncedData()).catch(() => {});
    setTimeout(() => _emit('idle', 0), SYNCED_DISPLAY_MS);
    return;
  }

  // Acquire lock and begin sync
  _syncLock = true;
  _emit('syncing', pendingCount);
  log.info(`Starting sync — ${pendingCount} item(s) pending`);

  try {
    await _syncPatients();
    await _syncVisits();
    await _syncCompletedVisits();   // [Bug 10] Push completions for already-created visits
    await _syncReportItems();
    await _pullFreshData();

    const remaining = await getPendingCount();
    const failed    = await _countFailed();

    // ── Post-sync diagnostic dump ─────────────────────────────────────────────
    const diag = await getFullDiagnostics();
    console.group('%c[Sync] Post-sync queue state', 'color:#0ea5e9;font-weight:bold');
    console.log('QUEUE AFTER CLEANUP:');
    console.log('  remaining pending:', remaining, '  failed:', failed);
    Object.entries(diag.counts).forEach(([table, { total, byStatus }]) => {
      console.log(`  ${table}: total=${total}`, byStatus);
    });
    if (diag.pendingItems.length > 0) {
      console.warn('PENDING ITEMS (still in queue):', diag.pendingItems);
    } else {
      console.log('%c  ✅ Queue is empty — all items synced', 'color:#22c55e');
    }
    console.groupEnd();

    // [Bug 3] Correct post-sync emission logic:
    //   remaining > 0  → items still queued (will retry next heartbeat) → 'pending'
    //   remaining = 0 && failed = 0 → all clean → 'synced'
    //   remaining = 0 && failed > 0 → permanent failures (data errors) → 'failed'
    if (remaining === 0 && failed === 0) {
      log.info('Sync complete — all items synced ✅');
      _emit('synced', 0);
      
      // Run database pruning asynchronously in background
      import('./db').then(m => m.pruneOldSyncedData()).catch(() => {});
      
      setTimeout(() => _emit('idle', 0), SYNCED_DISPLAY_MS);
    } else if (remaining > 0) {
      log.warn(`Sync pass done — ${remaining} item(s) still pending (will retry)`);
      _emit('pending', remaining);
    } else {
      log.error(`Sync done — ${failed} item(s) permanently failed (data errors)`);
      _emit('failed', failed);
    }
  } catch (err) {
    // Network dropped mid-sync
    log.error('Sync aborted — network error:', err.message);
    const remaining = await getPendingCount();
    _wasOnline = false;
    _failStreak = OFFLINE_THRESHOLD; // treat as immediately offline
    _emit('pending', remaining);
  } finally {
    _syncLock = false;
  }
}

// ── Push patients ─────────────────────────────────────────────────────────────
async function _syncPatients() {
  const pending = await getPendingPatients();
  if (!pending.length) return;
  log.info(`Pushing ${pending.length} patient(s) to server`);

  for (const patient of pending) {
    if ((patient.retryCount || 0) >= MAX_ITEM_RETRIES) {
      log.warn(`Patient ${patient.local_id} hit max retries — marking failed`);
      await db.patients.update(patient.local_id, { syncStatus: SYNC.FAILED });
      continue;
    }

    try {
      const data     = await api.post('/api/patients', { ...patient, local_id: patient.local_id });
      const serverId = data?.patient?.id ?? data?.id;
      log.info(`Patient synced: local=${patient.local_id} → server=${serverId}`);
      await markPatientSynced(patient.local_id, serverId);
      await _rewritePatientReferences(patient.local_id, serverId);
      await createReportFolder({ ...patient, id: serverId, syncStatus: SYNC.SYNCED });
    } catch (err) {
      if (err instanceof NetworkError) throw err; // bubble up — abort this pass

      if (err instanceof ApiError && err.status === 409) {
        // Already exists on server — treat as synced
        const serverId = err.data?.id;
        log.warn(`Patient 409 (already exists): local=${patient.local_id} server=${serverId}`);
        await markPatientSynced(patient.local_id, serverId);
        await _rewritePatientReferences(patient.local_id, serverId);
        await createReportFolder({ ...patient, id: serverId, syncStatus: SYNC.SYNCED });
        continue;
      }

      log.error(`Patient push failed (retry ${(patient.retryCount || 0) + 1}):`, err.message);
      await db.patients.update(patient.local_id, {
        retryCount: (patient.retryCount || 0) + 1,
        syncStatus: SYNC.RETRYING,
      });
    }
  }

  // After all patient pushes complete, consolidate any orphan duplicate folders
  // that could have been created by previous sync passes (belt-and-suspenders)
  await _consolidateDuplicateFolders();
}

// ── Push visits ───────────────────────────────────────────────────────────────
async function _syncVisits() {
  const pending = await getPendingVisits();
  if (!pending.length) return;

  // Sort: Process COMPLETED visits first, so their server responses can reconcile
  // and mark pending local follow-up visits as SYNCED before we reach them.
  pending.sort((a, b) => {
    if (a.status === 'COMPLETED' && b.status !== 'COMPLETED') return -1;
    if (a.status !== 'COMPLETED' && b.status === 'COMPLETED') return 1;
    return 0;
  });

  log.info(`Pushing ${pending.length} visit(s) to server`);

  for (let visit of pending) {
    // Re-verify from database that it wasn't already synced/reconciled
    // during a previous loop iteration (e.g. follow-up reconciliation)
    const dbVisit = await db.visits.get(visit.local_id);
    if (!dbVisit || dbVisit.syncStatus === SYNC.SYNCED) {
      log.info(`Visit ${visit.local_id} already synced via completed visit response, skipping push`);
      continue;
    }
    visit = dbVisit;

    if ((visit.retryCount || 0) >= MAX_ITEM_RETRIES) {
      log.warn(`Visit ${visit.local_id} hit max retries — marking failed`);
      await markVisitFailed(visit.local_id);
      continue;
    }

    // [Bug 7] patientId may be a UUID string for offline-created patients.
    // Number(uuid) = NaN, which previously caused silent skips forever.
    // Also guard against patientId = 0, which is not a valid server id.
    // Fix: resolve the UUID (or 0) to the server id via the patients store.
    let resolvedPatientId = Number(visit.patientId);

    if (isNaN(resolvedPatientId) || resolvedPatientId <= 0) {
      // The visit was created while the patient was offline — look up the patient
      const patient = await db.patients.get(String(visit.patientId))
        || await db.patients.where('id').equals(Number(visit.patientId)).first().catch(() => null);

      if (!patient) {
        log.warn(`Visit ${visit.local_id} — patient ${visit.patientId} not found locally, deferring`);
        continue;
      }

      const serverPatientId = Number(patient.id);
      if (!patient.id || isNaN(serverPatientId)) {
        // Parent patient not synced yet — defer this visit (patient sync will resolve it)
        log.debug(`Visit ${visit.local_id} — parent patient not yet synced, deferring`);
        continue;
      }

      // Patient is now synced — update the visit's patientId to the server id
      resolvedPatientId = serverPatientId;
      await db.visits.update(visit.local_id, {
        patientId:  String(resolvedPatientId),
        patient_id: resolvedPatientId,
      });
      visit.patientId  = String(resolvedPatientId);
      visit.patient_id = resolvedPatientId;
      log.info(`Visit ${visit.local_id} — resolved patient UUID to server id ${resolvedPatientId}`);
    }

    try {
      // Create the visit on the server if it doesn't have a real server id yet
      if (!visit.id || String(visit.id).startsWith('local_')) {
        const dateStr = visit.visit_date || visit.date || new Date().toISOString().split('T')[0];
        const payload = {
          local_id:  visit.local_id, // ← CRITICAL FIX: Include local_id so server saves it!
          patientId: resolvedPatientId,
          type:      visit.visit_type || visit.type || 'General',
          date:      dateStr.split('T')[0],
          time:      visit.time || '09:00',
          notes:     visit.notes || '',
          bp:        visit.bp || '',
          glucose:   visit.glucose || '',
          severity:  visit.severity || null,
        };
        const data     = await api.post('/api/visits', payload);
        const serverId = data?.visit?.id ?? data?.id;
        log.info(`Visit created: local=${visit.local_id} → server=${serverId}`);
        visit.id = serverId;
        await db.visits.update(visit.local_id, { id: serverId });
      }

      // Upload pending prescription images
      if (visit.status === 'COMPLETED') {
        const localImages = await db.prescriptionImages
          .where('visitLocalId').equals(String(visit.local_id))
          .toArray();

        for (const img of localImages.filter(i => i.syncStatus !== SYNC.SYNCED)) {
          try {
            const blob   = _dataURLtoBlob(img.dataUrl);
            const fd     = new FormData();
            fd.append('file', blob, `prescription_${img.local_id}.jpg`);
            const result = await api.post('/api/reports/upload', fd);
            if (result?.url) {
              await db.prescriptionImages.update(img.local_id, {
                url: result.url, syncStatus: SYNC.SYNCED, updatedAt: Date.now(),
              });
              log.info(`Image uploaded: ${img.local_id} → ${result.url}`);
            } else {
              await db.prescriptionImages.update(img.local_id, { syncStatus: SYNC.FAILED });
              log.warn(`Image upload returned no URL: ${img.local_id}`);
            }
          } catch (imgErr) {
            await db.prescriptionImages.update(img.local_id, { syncStatus: SYNC.FAILED });
            log.error(`Image upload failed: ${img.local_id}`, imgErr.message);
            if (imgErr instanceof NetworkError) throw imgErr;
          }
        }

        // Refresh image list with server URLs
        const allImages = await db.prescriptionImages
          .where('visitLocalId').equals(String(visit.local_id))
          .toArray();
        visit.prescription_images = allImages.map(i => i.url || i.dataUrl);

        // Complete the visit
        const completePayload = {
          bp:                  visit.bp,
          sugar:               visit.glucose || visit.details?.sugar,
          weight:              visit.details?.weight,
          height:              visit.details?.height,
          severity:            visit.severity,
          notes:               visit.notes,
          treatment_status:    visit.treatment_status,
          medicine_prescribed: visit.prescription_data?.medicine_prescribed || false,
          medicines:           visit.prescription_data?.medicines || [],
          prescribed_by:       visit.prescription_data?.prescribed_by,
          prescriber_name:     visit.prescription_data?.prescriber_name,
          clinic_name:         visit.prescription_data?.clinic_name,
          prescription_images: visit.prescription_images || [],
          next_checkup_date:   visit.next_checkup_date || null,
        };
        const patchRes = await api.patch(`/api/visits/${visit.id}/complete`, completePayload);
        await markVisitSynced(visit.local_id, visit.id);
        log.info(`Visit completed and synced: ${visit.local_id}`);

        // Sync follow-up visit if server created one
        if (patchRes?.follow_up && visit.next_checkup_date) {
          const allVisits = await db.visits.toArray();
          const localFollowUp = allVisits.find(v =>
            String(v.patientId) === String(visit.patientId) &&
            v.visit_type === 'Follow-up' &&
            v.status === 'PENDING' &&
            (v.visit_date || v.date || '').startsWith(visit.next_checkup_date)
          );
          if (localFollowUp) {
            await db.visits.update(localFollowUp.local_id, {
              id: patchRes.follow_up.id, syncStatus: SYNC.SYNCED, updatedAt: Date.now(),
            });
            const lr = await db.reminders.get(localFollowUp.local_id);
            if (lr) {
              await db.reminders.update(lr.local_id, {
                id: patchRes.follow_up.id, syncStatus: SYNC.SYNCED, updatedAt: Date.now(),
              });
            }
          }
        }
      } else {
        await markVisitSynced(visit.local_id, visit.id);
        log.info(`Visit synced (pending status): ${visit.local_id}`);
      }
    } catch (err) {
      if (err instanceof NetworkError) throw err;
      if (err instanceof ApiError && (err.status === 409 || err.status === 400)) {
        log.warn(`Visit ${visit.local_id} — ${err.status} response, treating as synced`);
        await markVisitSynced(visit.local_id, visit.id);
        continue;
      }
      log.error(`Visit push failed (retry ${(visit.retryCount || 0) + 1}):`, err.message);
      await db.visits.update(visit.local_id, {
        retryCount: (visit.retryCount || 0) + 1,
        syncStatus: SYNC.RETRYING,
      });
    }
  }
}

// ── Push report items ─────────────────────────────────────────────────────
async function _syncReportItems() {
  const pending = await getPendingReportItems();
  if (!pending.length) return;
  log.info(`Pushing ${pending.length} report item(s) to server`);

  for (const report of pending) {
    if ((report.retryCount || 0) >= MAX_ITEM_RETRIES) {
      log.warn(`Report ${report.local_id} hit max retries — marking failed`);
      await markReportItemFailed(report.local_id);
      continue;
    }

    // Also resolve UUID patient ids for offline patients
    let resolvedPatientId = Number(report.patientId);
    if (isNaN(resolvedPatientId)) {
      const patient = await db.patients.get(String(report.patientId));
      if (!patient?.id || isNaN(Number(patient.id))) {
        log.debug(`Report ${report.local_id} — parent patient not yet synced, deferring`);
        continue;
      }
      resolvedPatientId = Number(patient.id);
    }

    try {
      // Resolve any base64 images to server URLs
      const resolvedImages = [];
      const allLocalImages = await db.prescriptionImages.toArray();
      for (const img of (report.images || [])) {
        if (img.startsWith('data:')) {
          const match = allLocalImages.find(i => i.dataUrl === img);
          if (match?.url) resolvedImages.push(match.url);
        } else {
          resolvedImages.push(img);
        }
      }
      if (resolvedImages.length > 0) {
        await db.reportItems.update(report.local_id, { images: resolvedImages });
        report.images = resolvedImages;
      }

      const payload = {
        patient_id:     resolvedPatientId,
        title:          report.title,
        type:           report.type || report.report_type,
        description:    report.description,
        doctor_name:    report.doctor_name,
        status:         report.status || 'Ongoing',
        images:         report.images || [],
        next_follow_up: report.next_follow_up || null,
        local_id:       report.local_id,
      };
      const data = await api.post('/api/reports/add', payload);
      await markReportItemSynced(report.local_id, data.report_id);
      log.info(`Report synced: local=${report.local_id} → server=${data.report_id}`);
    } catch (err) {
      if (err instanceof NetworkError) throw err;
      if (err instanceof ApiError && err.status === 409) {
        await markReportItemSynced(report.local_id, err.data?.report_id);
        log.warn(`Report 409 (already exists): ${report.local_id}`);
        continue;
      }
      log.error(`Report push failed (retry ${(report.retryCount || 0) + 1}):`, err.message);
      await db.reportItems.update(report.local_id, {
        retryCount: (report.retryCount || 0) + 1,
        syncStatus: SYNC.RETRYING,
      });
    }
  }
}

// ── Push completed visits that already have a server id ────────────────────────
// [Bug 10] This handles the critical gap: a visit was previously created on the
// server (has a real server `id`) but completed OFFLINE. The main _syncVisits
// loop only sends PATCH /complete inside the `!visit.id` POST block, which is
// unreachable for already-created visits — their completions were silently
// dropped forever. This dedicated pass closes that gap.
//
// It also atomically marks the linked reportItem (created by CompleteVisit
// with a visitLocalId field) as SYNCED, clearing the ghost pending badge.
async function _syncCompletedVisits() {
  const allPending = await db.visits
    .where('syncStatus').anyOf([SYNC.PENDING, SYNC.RETRYING])
    .toArray();

  const completedUnsynced = allPending.filter(
    v => v.status === 'COMPLETED' && v.id && !String(v.id).startsWith('local_')
  );

  if (!completedUnsynced.length) return;
  log.info(`[Bug10] _syncCompletedVisits: ${completedUnsynced.length} completed visit(s) need completion push`);

  for (const visit of completedUnsynced) {
    if ((visit.retryCount || 0) >= MAX_ITEM_RETRIES) {
      log.warn(`[Bug10] Completed visit ${visit.local_id} hit max retries — marking failed`);
      await markVisitFailed(visit.local_id);
      continue;
    }

    try {
      // ── 1. Upload any pending prescription images for this visit ───────────
      const pendingImages = await db.prescriptionImages
        .where('visitLocalId').equals(String(visit.local_id))
        .toArray()
        .then(imgs => imgs.filter(i => i.syncStatus !== SYNC.SYNCED));

      for (const img of pendingImages) {
        try {
          const blob   = _dataURLtoBlob(img.dataUrl);
          const fd     = new FormData();
          fd.append('file', blob, `prescription_${img.local_id}.jpg`);
          const result = await api.post('/api/reports/upload', fd);
          if (result?.url) {
            await db.prescriptionImages.update(img.local_id, {
              url: result.url, syncStatus: SYNC.SYNCED, updatedAt: Date.now(),
            });
            log.info(`[Bug10] Image uploaded for visit ${visit.local_id}: ${result.url}`);
          } else {
            await db.prescriptionImages.update(img.local_id, { syncStatus: SYNC.FAILED });
          }
        } catch (imgErr) {
          await db.prescriptionImages.update(img.local_id, { syncStatus: SYNC.FAILED });
          if (imgErr instanceof NetworkError) throw imgErr;
        }
      }

      // Collect all synced image URLs (including previously uploaded ones)
      const allSyncedImages = await db.prescriptionImages
        .where('visitLocalId').equals(String(visit.local_id))
        .toArray()
        .then(imgs => imgs.map(i => i.url).filter(Boolean));

      // ── 2. Send PATCH /api/visits/:id/complete ────────────────────────
      const completePayload = {
        bp:                  visit.bp,
        sugar:               visit.glucose || visit.details?.sugar,
        weight:              visit.details?.weight,
        height:              visit.details?.height,
        severity:            visit.severity,
        notes:               visit.notes,
        treatment_status:    visit.treatment_status,
        medicine_prescribed: visit.prescription_data?.medicine_prescribed || false,
        medicines:           visit.prescription_data?.medicines || [],
        prescribed_by:       visit.prescription_data?.prescribed_by,
        prescriber_name:     visit.prescription_data?.prescriber_name,
        clinic_name:         visit.prescription_data?.clinic_name,
        prescription_images: allSyncedImages,
        next_checkup_date:   visit.next_checkup_date || null,
      };

      const patchRes = await api.patch(`/api/visits/${visit.id}/complete`, completePayload);
      log.info(`[Bug10] Visit completed on server: local=${visit.local_id} server=${visit.id}`);

      // ── 3. Mark visit SYNCED (also marks linked reminder) ──────────────
      await markVisitSynced(visit.local_id, visit.id);

      // ── 4. Mark linked reportItem SYNCED (by visitLocalId index) ───────
      // CompleteVisit stores visitLocalId on the auto-generated reportItem.
      // Use the v5 index to find and clear it atomically — this clears
      // the ghost "N changes waiting" badge.
      try {
        const linkedReports = await db.reportItems
          .where('visitLocalId').equals(String(visit.local_id))
          .toArray();
        for (const report of linkedReports) {
          if (report.syncStatus !== SYNC.SYNCED) {
            await db.reportItems.update(report.local_id, {
              syncStatus: SYNC.SYNCED,
              images:     allSyncedImages,
              updatedAt:  Date.now(),
            });
            log.info(`[Bug10] Linked reportItem ${report.local_id} marked SYNCED`);
          }
        }
      } catch (riErr) {
        log.warn(`[Bug10] Failed to mark linked reportItem SYNCED:`, riErr.message);
      }

      // ── 5. Reconcile server-created follow-up visit ─────────────────
      if (patchRes?.follow_up && visit.next_checkup_date) {
        const allVisits = await db.visits.toArray();
        const localFollowUp = allVisits.find(v =>
          String(v.patientId) === String(visit.patientId) &&
          v.visit_type === 'Follow-up' &&
          v.status === 'PENDING' &&
          (v.visit_date || v.date || '').startsWith(visit.next_checkup_date)
        );
        if (localFollowUp) {
          await db.visits.update(localFollowUp.local_id, {
            id: patchRes.follow_up.id, syncStatus: SYNC.SYNCED, updatedAt: Date.now(),
          });
          const lr = await db.reminders.get(localFollowUp.local_id);
          if (lr) {
            await db.reminders.update(lr.local_id, {
              id: patchRes.follow_up.id, syncStatus: SYNC.SYNCED, updatedAt: Date.now(),
            });
          }
        }
      }
    } catch (err) {
      if (err instanceof NetworkError) throw err;
      if (err instanceof ApiError && (err.status === 409 || err.status === 400)) {
        log.warn(`[Bug10] Visit ${visit.local_id} — ${err.status}, treating as already completed`);
        await markVisitSynced(visit.local_id, visit.id);
        try {
          const linkedReports = await db.reportItems
            .where('visitLocalId').equals(String(visit.local_id))
            .toArray();
          for (const report of linkedReports) {
            await db.reportItems.update(report.local_id, { syncStatus: SYNC.SYNCED, updatedAt: Date.now() });
          }
        } catch {}
        continue;
      }
      log.error(`[Bug10] Completed visit push failed (retry ${(visit.retryCount || 0) + 1}):`, err.message);
      await db.visits.update(visit.local_id, {
        retryCount: (visit.retryCount || 0) + 1,
        syncStatus: SYNC.RETRYING,
      });
    }
  }
}

// ── Reconcile stale local records ───────────────────────────────────────────────
// This runs BEFORE every push cycle. It fetches the authoritative server list
// and uses bulkUpsertPatients / bulkUpsertVisits to mark any locally-PENDING or
// locally-RETRYING records as SYNCED if the server already has them.
//
// [Bug 11] COMPLETED visits are explicitly skipped here — they require the full
// _syncCompletedVisits pass (medical data + images) before being marked SYNCED.
async function _reconcileStaleRecords() {
  log.debug('Reconciling stale records with server state…');
  let hasChanges = false;
  try {
    const [patientsRes, remindersRes] = await Promise.allSettled([
      api.get('/api/patients'),
      api.get('/api/reminders/all'),
    ]);

    if (patientsRes.status === 'fulfilled' && patientsRes.value) {
      const arr = Array.isArray(patientsRes.value)
        ? patientsRes.value
        : (patientsRes.value.patients || []);
      const records = await bulkUpsertPatients(arr);
      if (records.length > 0) {
        hasChanges = true;
        await Promise.all(records.map(p => createReportFolder(p)));
      }
      log.debug(`Reconcile: processed ${arr.length} patient(s) from server`);
    }

    if (remindersRes.status === 'fulfilled' && remindersRes.value) {
      const arr = Array.isArray(remindersRes.value) ? remindersRes.value : [];
      const remindersChanged = await bulkUpsertReminders(arr);
      if (remindersChanged) {
        hasChanges = true;
      }
      log.debug(`Reconcile: processed ${arr.length} reminder(s) from server`);

      const reminders = Array.isArray(remindersRes.value) ? remindersRes.value : [];
      const pendingLocalVisits = await db.visits
        .where('syncStatus').anyOf([SYNC.PENDING, SYNC.RETRYING])
        .toArray();

      for (const localVisit of pendingLocalVisits) {
        // [Bug 11] Skip locally-COMPLETED visits — they must go through
        // _syncCompletedVisits to push medical data before being marked SYNCED.
        if (localVisit.status === 'COMPLETED') {
          log.debug(`Reconcile: skipping COMPLETED visit ${localVisit.local_id} — deferred to _syncCompletedVisits`);
          continue;
        }

        // For non-completed PENDING visits, match by local_id or server id
        const serverMatch = reminders.find(r =>
          (localVisit.local_id && r.local_id && r.local_id === localVisit.local_id) ||
          (localVisit.id && r.id && String(r.id) === String(localVisit.id))
        );
        if (serverMatch) {
          log.debug(`Reconcile: visit ${localVisit.local_id} confirmed on server → SYNCED`);
          if (localVisit.syncStatus !== SYNC.SYNCED) {
            await markVisitSynced(localVisit.local_id, serverMatch.id);
            hasChanges = true;
          }
        }
      }
    }

    if (hasChanges) {
      log.info('Reconcile detected changes — dispatching local-data-written');
      window.dispatchEvent(new CustomEvent('local-data-written'));
    } else {
      log.debug('Reconcile complete — no changes detected');
    }
  } catch (err) {
    if (err instanceof NetworkError) {
      log.warn('Reconcile skipped — network error:', err.message);
      throw err;
    }
    log.warn('Reconcile encountered an error (non-fatal):', err.message);
  }
}

// ── Pull fresh server data ────────────────────────────────────────────
async function _pullFreshData() {
  log.debug('Pulling fresh data from server');
  let hasChanges = false;
  const [patientsRes, remindersRes, foldersRes] = await Promise.allSettled([
    api.get('/api/patients'),
    api.get('/api/reminders/all'),
    api.get('/api/reports/patients'),
  ]);

  if (patientsRes.status === 'fulfilled' && patientsRes.value) {
    const arr = Array.isArray(patientsRes.value)
      ? patientsRes.value
      : (patientsRes.value.patients || []);
    const records = await bulkUpsertPatients(arr);
    if (records.length > 0) {
      hasChanges = true;
      await Promise.all(records.map(p => createReportFolder(p)));
    }
    log.debug(`Pulled ${arr.length} patient(s) from server`);

    // Fetch individual report items & visits for all retrieved patients
    const patientIds = arr.map(p => p.id).filter(Boolean);
    if (patientIds.length > 0) {
      log.debug(`Pulling reports/visits for ${patientIds.length} patients…`);
      const results = await Promise.allSettled(patientIds.map(async (pid) => {
        let patientChanged = false;
        try {
          const res = await api.get(`/api/reports/patient/${pid}`);
          if (res?.reports?.length) {
            const reportsChanged = await bulkUpsertReportItems(res.reports, pid);
            if (reportsChanged) patientChanged = true;
          }
          if (res?.visits?.length) {
            const tagged = res.visits.map(v => ({
              ...v,
              patientId:  String(pid),
              visit_date: v.visit_date || v.date,
            }));
            const visitsChanged = await bulkUpsertVisits(tagged);
            if (visitsChanged) patientChanged = true;
          }
        } catch (e) {
          log.warn(`Failed to pull report items for patient ${pid}:`, e.message);
        }
        return patientChanged;
      }));
      if (results.some(r => r.status === 'fulfilled' && r.value)) {
        hasChanges = true;
      }
    }
  }

  if (remindersRes.status === 'fulfilled' && remindersRes.value) {
    const arr = Array.isArray(remindersRes.value) ? remindersRes.value : [];
    const remindersChanged = await bulkUpsertReminders(arr);
    if (remindersChanged) {
      hasChanges = true;
    }
    log.debug(`Pulled ${arr.length} reminder(s) from server`);
  }

  if (foldersRes.status === 'fulfilled' && foldersRes.value) {
    const arr = Array.isArray(foldersRes.value) ? foldersRes.value : [];
    const foldersChanged = await bulkUpsertReportFolders(arr);
    if (foldersChanged) {
      hasChanges = true;
    }
    log.debug(`Pulled ${arr.length} report folder(s) from server`);
  }

  if (hasChanges) {
    log.info('Pull fresh data detected changes — dispatching local-data-written');
    window.dispatchEvent(new CustomEvent('local-data-written'));
  } else {
    log.debug('Pull fresh data completed — no changes detected');
  }

  // Final cleanup: merge any orphan duplicate folders created before these fixes
  await _consolidateDuplicateFolders();
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
// [Bug 9] Runs every 15s with ±2s jitter to avoid thundering-herd on reconnect.
// Only triggers a full syncAll() on genuine offline→online transitions.
async function _heartbeat() {
  // [Bug 6] Skip heartbeat logic if user is not logged in
  if (!localStorage.getItem('token')) return;

  const ok = await checkHealth();

  if (ok) {
    _failStreak = 0;

    if (_wasOnline === false || _wasOnline === undefined) {
      log.info('Heartbeat: server back online — triggering sync');
      _wasOnline = true;
      syncAll();
    } else {
      _wasOnline = true;
      // Periodic sync to check for updates from other devices
      syncAll();
    }
  } else {
    _failStreak++;

    if (_failStreak >= OFFLINE_THRESHOLD && _wasOnline !== false) {
      log.warn(`Heartbeat: server unreachable (streak=${_failStreak}) — marking offline`);
      _wasOnline = false;
      const n = await getPendingCount();
      if (n > 0) _emit('pending', n);
      else _emit('idle', 0);
    }
  }
}

// ── Auto-sync bootstrap (called once from SyncProvider) ───────────────────────
export function initAutoSync() {
  if (_autoSyncAttached) {
    log.debug('initAutoSync() already attached — skipping');
    return;
  }
  _autoSyncAttached = true;
  log.info('Auto-sync initialized');

  // [Bug 9 FIXED] Recursive setTimeout with fresh jitter on every tick.
  // setInterval + jitter() only evaluated jitter ONCE at init time —
  // all future ticks fired at the same fixed interval.
  const scheduleNextHeartbeat = () => {
    const jitter = Math.floor(Math.random() * 4_000) - 2_000; // ±2 s
    _heartbeatTimer = setTimeout(async () => {
      await _heartbeat();
      scheduleNextHeartbeat(); // reschedule with fresh jitter
    }, HEARTBEAT_MS + jitter);
  };
  scheduleNextHeartbeat();

  // Sync on browser network restore (belt & suspenders alongside heartbeat)
  window.addEventListener('online', () => {
    log.info('browser online event → triggering immediate sync');
    _failStreak = 0;
    // Mark as online now so the next heartbeat doesn't ALSO trigger syncAll
    // (which would start two redundant parallel sync passes on every reconnect).
    _wasOnline = true;
    syncAll();
  });

  // Sync on ConnectionContext server online detection
  window.addEventListener('server-online', () => {
    log.info('server-online custom event → triggering immediate sync');
    _failStreak = 0;
    _wasOnline = true;
    syncAll();
  });

  // Sync on tab focus (only if lock is free — no duplicate runs)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !_syncLock) {
      syncAll();
    }
  });

  // Sync immediately after local writes
  window.addEventListener('visit-added',   () => { if (!_syncLock) syncAll(); });
  window.addEventListener('patient-added', () => { if (!_syncLock) syncAll(); });

  // Initial sync on load
  syncAll();
}

// ── Reset (called on logout) ──────────────────────────────────────────────────
export function resetSyncEngine() {
  _syncLock = false;
  _wasOnline = undefined;
  _failStreak = 0;
  if (_heartbeatTimer) {
    // Works for both clearInterval (old) and clearTimeout (new recursive approach)
    clearTimeout(_heartbeatTimer);
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  _autoSyncAttached = false;
  _emit('idle', 0);
  log.info('Sync engine reset (logout)');
  
  // Clear all IndexedDB store tables for multi-tenant data security
  clearAllLocalData().catch(err => {
    log.error('Failed to clear IndexedDB stores on logout:', err);
  });
}

// ── Manual Rescue Sync functions ──────────────────────────────────────────────
async function runWithLock(callback) {
  if (_syncLock) {
    throw new Error('locked');
  }
  if (navigator.locks) {
    let locked = false;
    const result = await navigator.locks.request('ashakiran_sync_mutex', { ifAvailable: true }, async (lock) => {
      if (!lock) {
        locked = true;
        return;
      }
      _syncLock = true;
      try {
        return await callback();
      } finally {
        _syncLock = false;
      }
    });
    if (locked) {
      throw new Error('locked');
    }
    return result;
  } else {
    _syncLock = true;
    try {
      return await callback();
    } finally {
      _syncLock = false;
    }
  }
}

export async function manualSyncPatients() {
  const token = localStorage.getItem('token');
  if (!token) {
    return { status: 'unauthorized', message: 'User not authenticated' };
  }

  const online = await checkHealth();
  if (!online) {
    return { status: 'offline', message: "You're offline. Connect to internet to sync pending data." };
  }

  const pendingBefore = await getPendingPatients();
  const pendingCount = pendingBefore.length;
  if (pendingCount === 0) {
    return { status: 'nothing-to-sync', message: 'All patient records already synced' };
  }

  try {
    const res = await runWithLock(async () => {
      await _reconcileStaleRecords();
      await _syncPatients();
      await _pullFreshData();
      return true;
    });

    if (res === undefined) {
      return { status: 'locked', message: 'Sync already in progress.' };
    }

    const pendingAfter = await getPendingPatients();
    const syncedCount = pendingCount - pendingAfter.length;
    const failedCount = pendingAfter.length;

    if (syncedCount > 0 && failedCount === 0) {
      localStorage.setItem('last_sync_patients', Date.now().toString());
      return { status: 'success', synced: syncedCount, failed: failedCount, message: `${syncedCount} patient record${syncedCount > 1 ? 's' : ''} synced successfully` };
    } else if (syncedCount > 0 && failedCount > 0) {
      localStorage.setItem('last_sync_patients', Date.now().toString());
      return { status: 'partial', synced: syncedCount, failed: failedCount, message: `${syncedCount} synced, ${failedCount} failed. Retry again.` };
    } else {
      return { status: 'failed', synced: 0, failed: failedCount, message: `Sync failed for ${failedCount} patient record${failedCount > 1 ? 's' : ''}. Retry again.` };
    }
  } catch (err) {
    if (err.message === 'locked') {
      return { status: 'locked', message: 'Sync already in progress.' };
    }
    return { status: 'failed', message: `Sync failed: ${err.message}` };
  }
}

export async function manualSyncReports() {
  const token = localStorage.getItem('token');
  if (!token) {
    return { status: 'unauthorized', message: 'User not authenticated' };
  }

  const online = await checkHealth();
  if (!online) {
    return { status: 'offline', message: "You're offline. Connect to internet to sync pending data." };
  }

  const pendingVisits = await getPendingVisits();
  const pendingCompletedVisits = pendingVisits.filter(v => v.status === 'COMPLETED');
  const pendingReportItems = await getPendingReportItems();
  const pendingCount = pendingCompletedVisits.length + pendingReportItems.length;

  if (pendingCount === 0) {
    return { status: 'nothing-to-sync', message: 'All records already synced' };
  }

  try {
    const res = await runWithLock(async () => {
      await _reconcileStaleRecords();
      await _syncPatients();
      await _syncVisits();
      await _syncCompletedVisits();
      await _syncReportItems();
      await _pullFreshData();
      return true;
    });

    if (res === undefined) {
      return { status: 'locked', message: 'Sync already in progress.' };
    }

    const pendingVisitsAfter = await getPendingVisits();
    const pendingCompletedVisitsAfter = pendingVisitsAfter.filter(v => v.status === 'COMPLETED');
    const pendingReportItemsAfter = await getPendingReportItems();
    const pendingCountAfter = pendingCompletedVisitsAfter.length + pendingReportItemsAfter.length;

    const syncedCount = pendingCount - pendingCountAfter;
    const failedCount = pendingCountAfter;

    if (syncedCount > 0 && failedCount === 0) {
      localStorage.setItem('last_sync_records', Date.now().toString());
      return { status: 'success', synced: syncedCount, failed: failedCount, message: `${syncedCount} record${syncedCount > 1 ? 's' : ''} synced successfully` };
    } else if (syncedCount > 0 && failedCount > 0) {
      localStorage.setItem('last_sync_records', Date.now().toString());
      return { status: 'partial', synced: syncedCount, failed: failedCount, message: `${syncedCount} synced, ${failedCount} failed. Retry again.` };
    } else {
      return { status: 'failed', synced: 0, failed: failedCount, message: `Sync failed for ${failedCount} record${failedCount > 1 ? 's' : ''}. Retry again.` };
    }
  } catch (err) {
    if (err.message === 'locked') {
      return { status: 'locked', message: 'Sync already in progress.' };
    }
    return { status: 'failed', message: `Sync failed: ${err.message}` };
  }
}

export async function manualSyncReminders() {
  const token = localStorage.getItem('token');
  if (!token) {
    return { status: 'unauthorized', message: 'User not authenticated' };
  }

  const online = await checkHealth();
  if (!online) {
    return { status: 'offline', message: "You're offline. Connect to internet to sync pending data." };
  }

  const pendingReminders = await db.reminders.where('syncStatus').anyOf([SYNC.PENDING, SYNC.RETRYING]).toArray();
  const pendingCount = pendingReminders.length;

  if (pendingCount === 0) {
    return { status: 'nothing-to-sync', message: 'All reminders already synced' };
  }

  try {
    const res = await runWithLock(async () => {
      await _reconcileStaleRecords();
      await _syncPatients();
      await _syncVisits();
      await _pullFreshData();
      return true;
    });

    if (res === undefined) {
      return { status: 'locked', message: 'Sync already in progress.' };
    }

    const pendingRemindersAfter = await db.reminders.where('syncStatus').anyOf([SYNC.PENDING, SYNC.RETRYING]).toArray();
    const pendingCountAfter = pendingRemindersAfter.length;

    const syncedCount = pendingCount - pendingCountAfter;
    const failedCount = pendingCountAfter;

    if (syncedCount > 0 && failedCount === 0) {
      localStorage.setItem('last_sync_reminders', Date.now().toString());
      return { status: 'success', synced: syncedCount, failed: failedCount, message: `${syncedCount} reminder${syncedCount > 1 ? 's' : ''} synced successfully` };
    } else if (syncedCount > 0 && failedCount > 0) {
      localStorage.setItem('last_sync_reminders', Date.now().toString());
      return { status: 'partial', synced: syncedCount, failed: failedCount, message: `${syncedCount} synced, ${failedCount} failed. Retry again.` };
    } else {
      return { status: 'failed', synced: 0, failed: failedCount, message: `Sync failed for ${failedCount} reminder${failedCount > 1 ? 's' : ''}. Retry again.` };
    }
  } catch (err) {
    if (err.message === 'locked') {
      return { status: 'locked', message: 'Sync already in progress.' };
    }
    return { status: 'failed', message: `Sync failed: ${err.message}` };
  }
}

// ── Debug / diagnostic exports ────────────────────────────────────────────────
/** Returns the current engine state. */
export function getSyncEngineState() {
  return {
    syncLock:       _syncLock,
    wasOnline:      _wasOnline,
    failStreak:     _failStreak,
    heartbeatActive: _heartbeatTimer !== null,
    autoSyncAttached: _autoSyncAttached,
  };
}

/** Force a full reconcile pass without pushing any new data. Useful from the debug panel. */
export async function forceReconcile() {
  const token = localStorage.getItem('token');
  if (!token) { log.warn('forceReconcile: no token'); return; }
  log.info('forceReconcile: starting…');
  await _reconcileStaleRecords();
  const n = await getPendingCount();
  log.info(`forceReconcile complete — ${n} item(s) still pending`);
  if (n === 0) {
    _emit('synced', 0);
    setTimeout(() => _emit('idle', 0), 3000);
  } else {
    _emit('pending', n);
  }
  return n;
}

/** Re-export getFullDiagnostics so the debug panel only imports from syncService. */
export { getFullDiagnostics } from './db';

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Merge duplicate report folders in IDB.
 *
 * Groups all folders by canonical patient identity (patientId › patientLocalId).
 * For each group with more than one entry, picks the winner (richer data) and
 * physically deletes the losers from IDB, then rewrites the winner's IDs to
 * be consistent so all future lookups converge on the same row.
 *
 * This is called after every patient push and pull to clean up residual
 * duplicates that may have been created by pre-fix sync passes.
 */
async function _consolidateDuplicateFolders() {
  const allFolders = await db.reportFolders.toArray();
  if (allFolders.length <= 1) return;

  // Build a map: canonical key → [folders with this key]
  const groups = new Map();
  for (const folder of allFolders) {
    // Prefer numeric server ID as key for stable grouping; fall back to UUID
    const key = folder.patientId || folder.patientLocalId || folder.local_id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(folder);
  }

  let mergedCount = 0;
  for (const [key, group] of groups) {
    if (group.length <= 1) continue; // no duplicates for this patient

    // Score each folder: prefer synced + has patientId + most recently updated
    const scored = group.map(f => ({
      folder: f,
      score: (f.patientId ? 4 : 0) + (f.syncStatus === SYNC.SYNCED ? 2 : 0) + (f.patientLocalId && !f.patientLocalId.match(/^\d+$/) ? 1 : 0),
    })).sort((a, b) => b.score - a.score || (b.folder.updatedAt || 0) - (a.folder.updatedAt || 0));

    const winner = scored[0].folder;
    const losers = scored.slice(1).map(s => s.folder);

    // Backfill the winner with any IDs the losers had
    const bestPatientId     = group.find(f => f.patientId)?.patientId || winner.patientId;
    const bestPatientLocalId = group.find(f => f.patientLocalId && !f.patientLocalId.match(/^\d+$/))?.patientLocalId || winner.patientLocalId;

    if (bestPatientId !== winner.patientId || bestPatientLocalId !== winner.patientLocalId) {
      await db.reportFolders.update(winner.local_id, {
        patientId:      bestPatientId,
        patientLocalId: bestPatientLocalId,
        updatedAt:      Date.now(),
      });
    }

    // Delete losers
    for (const loser of losers) {
      await db.reportFolders.delete(loser.local_id);
      mergedCount++;
    }

    log.warn(`Consolidated ${losers.length} duplicate folder(s) for patient key="${key}" → kept local_id=${winner.local_id}`);
  }

  if (mergedCount > 0) {
    log.info(`_consolidateDuplicateFolders: removed ${mergedCount} orphan folder(s)`);
    window.dispatchEvent(new CustomEvent('local-data-written'));
  }
}

function _dataURLtoBlob(dataurl) {
  const arr  = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n      = bstr.length;
  const u8   = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
}

async function _rewritePatientReferences(oldLocalId, serverId) {
  if (!serverId) return;
  const sId    = String(serverId);
  const oldStr = String(oldLocalId);

  const visits = await db.visits.toArray();
  for (const v of visits) {
    if (String(v.patientId) === oldStr || String(v.patient_id) === oldStr) {
      await db.visits.update(v.local_id, { patientId: sId, patient_id: sId });
    }
  }

  const reminders = await db.reminders.toArray();
  for (const r of reminders) {
    if (String(r.patientId) === oldStr || String(r.patient_id) === oldStr) {
      await db.reminders.update(r.local_id, { patientId: sId, patient_id: sId });
    }
  }

  const reportItems = await db.reportItems.toArray();
  for (const item of reportItems) {
    if (String(item.patientId) === oldStr || String(item.patient_id) === oldStr) {
      await db.reportItems.update(item.local_id, { patientId: sId, patient_id: sId });
    }
  }

  const folders = await db.reportFolders.toArray();
  for (const folder of folders) {
    if (String(folder.patientId) === oldStr || String(folder.patientLocalId) === oldStr) {
      await db.reportFolders.update(folder.local_id, {
        patientId: sId, patientLocalId: oldStr,
      });
    }
  }

  log.debug(`Rewrote patient references: ${oldStr} → ${sId}`);
}
