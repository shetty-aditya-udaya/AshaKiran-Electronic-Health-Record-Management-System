/**
 * AshaKiran – Dexie (IndexedDB) Database  v3.0
 * ─────────────────────────────────────────────
 * Single source of truth for all local data.
 * Every write goes here first; sync pushes to backend.
 *
 * Stores
 * ──────
 *  patients      – one record per patient
 *  visits        – one record per scheduled / completed visit
 *  reminders     – pulled from server + pending local ones
 *  reportFolders – one "folder" per patient (the Reports-tab view)
 *  reportItems   – individual Medical/Vaccination/Prescription entries
 *  syncQueue     – generic outbox (reserved for future use)
 */
import Dexie from 'dexie';

export const db = new Dexie('AshaKiran_v3');

db.version(1).stores({
  patients:      'local_id, syncStatus, createdAt, village, category',
  visits:        'local_id, syncStatus, patientId, visit_date',
  reminders:     'local_id, syncStatus, patientId, visit_date, status',
  reportFolders: 'local_id, syncStatus, patientId, patientLocalId, updatedAt',
  reportItems:   'local_id, syncStatus, patientId, patientLocalId, createdAt',
  syncQueue:     '++id, entity, syncStatus, createdAt',
});

// v2: add prescriptionImages store for offline-first image blobs
db.version(2).stores({
  patients:             'local_id, syncStatus, createdAt, village, category',
  visits:               'local_id, syncStatus, patientId, visit_date',
  reminders:            'local_id, syncStatus, patientId, visit_date, status',
  reportFolders:        'local_id, syncStatus, patientId, patientLocalId, updatedAt',
  reportItems:          'local_id, syncStatus, patientId, patientLocalId, createdAt',
  syncQueue:            '++id, entity, syncStatus, createdAt',
  prescriptionImages:   'local_id, syncStatus, visitLocalId, createdAt',
});

// v3: add 'id' (server integer ID) as an indexed field on visits and reminders
//     so that db.visits.where('id').equals(N) works correctly.
//     Without this index, all .where('id') queries throw a DOMException:
//     "Column (id) not found" — which was the root cause of the
//     'Visit Record Not Found' error even when the visit existed in IDB.
db.version(3).stores({
  patients:             'local_id, syncStatus, createdAt, village, category',
  visits:               'local_id, id, syncStatus, patientId, visit_date',
  reminders:            'local_id, id, syncStatus, patientId, visit_date, status',
  reportFolders:        'local_id, syncStatus, patientId, patientLocalId, updatedAt',
  reportItems:          'local_id, syncStatus, patientId, patientLocalId, createdAt',
  syncQueue:            '++id, entity, syncStatus, createdAt',
  prescriptionImages:   'local_id, syncStatus, visitLocalId, createdAt',
});

// v4: add 'id' (server integer ID) as an indexed field on patients store
//     so that db.patients.where('id').equals(N) works correctly.
//     Without this index, any .where('id') query on patients throws a
//     Dexie SchemaError and crashes the entire visit completion screen.
db.version(4).stores({
  patients:             'local_id, id, syncStatus, createdAt, village, category',
  visits:               'local_id, id, syncStatus, patientId, visit_date',
  reminders:            'local_id, id, syncStatus, patientId, visit_date, status',
  reportFolders:        'local_id, syncStatus, patientId, patientLocalId, updatedAt',
  reportItems:          'local_id, syncStatus, patientId, patientLocalId, createdAt',
  syncQueue:            '++id, entity, syncStatus, createdAt',
  prescriptionImages:   'local_id, syncStatus, visitLocalId, createdAt',
});

// v5: add 'visitLocalId' as an indexed field on reportItems.
//     CompleteVisit creates a reportItem for the timeline when a visit is
//     completed. The sync engine must be able to look up that item by the
//     visit's local_id so it can mark it SYNCED atomically after a successful
//     PATCH /api/visits/:id/complete — preventing ghost pending badges.
db.version(5).stores({
  patients:             'local_id, id, syncStatus, createdAt, village, category',
  visits:               'local_id, id, syncStatus, patientId, visit_date, status',
  reminders:            'local_id, id, syncStatus, patientId, visit_date, status',
  reportFolders:        'local_id, syncStatus, patientId, patientLocalId, updatedAt',
  reportItems:          'local_id, syncStatus, patientId, patientLocalId, visitLocalId, createdAt',
  syncQueue:            '++id, entity, syncStatus, createdAt',
  prescriptionImages:   'local_id, syncStatus, visitLocalId, createdAt',
});

// v6: CRITICAL SECURITY FIX — Add `userId` as an indexed field to ALL stores.
//     This enforces strict per-user data isolation in the shared IndexedDB.
//     Every write is now stamped with the authenticated user's ID;
//     every read returns only that user's records.
//     The upgrade function clears ALL existing records (which lacked userId)
//     so the sync engine can re-pull clean, user-scoped data from the server.
db.version(6).stores({
  patients:           'local_id, id, userId, syncStatus, createdAt, village, category',
  visits:             'local_id, id, userId, syncStatus, patientId, visit_date, status',
  reminders:          'local_id, id, userId, syncStatus, patientId, visit_date, status',
  reportFolders:      'local_id, userId, syncStatus, patientId, patientLocalId, updatedAt',
  reportItems:        'local_id, userId, syncStatus, patientId, patientLocalId, visitLocalId, createdAt',
  syncQueue:          '++id, userId, entity, syncStatus, createdAt',
  prescriptionImages: 'local_id, userId, syncStatus, visitLocalId, createdAt',
}).upgrade(async tx => {
  // Records from v5 and earlier lack `userId` and cannot be safely filtered.
  // Clearing them forces a clean re-pull from the server after login.
  // This runs once per browser and only affects pre-existing data.
  console.log('%c[DB] v6 upgrade: clearing all stores to enforce per-user isolation. Data will re-sync from server.', 'color:#f97316;font-weight:bold');
  await Promise.all([
    tx.table('patients').clear(),
    tx.table('visits').clear(),
    tx.table('reminders').clear(),
    tx.table('reportFolders').clear(),
    tx.table('reportItems').clear(),
    tx.table('syncQueue').clear(),
    tx.table('prescriptionImages').clear(),
  ]);
});


// ── syncStatus enum ────────────────────────────────────────────────────────────
export const SYNC = {
  PENDING:  'pending',
  SYNCING:  'syncing',
  SYNCED:   'synced',
  RETRYING: 'retrying',
  FAILED:   'failed',
};

// ── Authenticated user ID helper ──────────────────────────────────────────────
// Used internally by ALL DB read/write functions to enforce per-user isolation.
// Reads from localStorage — the identical source used by the auth system and
// sync engine. Returns null when no user is logged in; all read functions
// return [] in that case, preventing any cross-user data from surfacing.
export function getCurrentUserId() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user?.id ? String(user.id) : null;
  } catch { return null; }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PATIENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function savePatient(patient) {
  const uid = getCurrentUserId() || patient.userId || '';
  const record = {
    ...patient,
    local_id:   patient.local_id || crypto.randomUUID(),
    userId:     uid,
    syncStatus: patient.syncStatus ?? SYNC.PENDING,
    updatedAt:  Date.now(),
  };
  await db.patients.put(record);
  return record;
}

export async function getAllPatients() {
  const uid = getCurrentUserId();
  if (!uid) return [];
  return db.patients.where('userId').equals(uid).toArray();
}

export async function getPendingPatients() {
  const uid = getCurrentUserId();
  if (!uid) return [];
  return db.patients.where('syncStatus').anyOf([SYNC.PENDING, SYNC.RETRYING])
    .and(p => p.userId === uid).toArray();
}

/**
 * Upsert patients fetched from the server.
 *
 * Reconciliation rules:
 *  - If a local record is SYNCED → update it with fresh server data
 *  - If a local record is PENDING or RETRYING → the server just confirmed it
 *    exists there already, so mark it SYNCED with the correct server id.
 *    This is the key reconciliation step that clears the "N changes waiting"
 *    badge when records were already synced via a different path.
 *  - If no local record exists yet → insert it as SYNCED
 */
export async function bulkUpsertPatients(patients) {
  const uid = getCurrentUserId() || '';
  const reconciled = [];  // records that were pending but now confirmed synced
  const upserted   = [];  // new/updated records

  for (const p of patients) {
    // Server always provides `local_id` (the UUID we sent) and `id` (its PK).
    const localId = p.local_id || p.id?.toString() || crypto.randomUUID();
    let existing = await db.patients.get(localId);

    // ── [Bug A Fix] Dedup by server integer ID before inserting ──────────────
    // When a patient was created offline (UUID key) and synced, the server
    // returns it in future GET /api/patients responses. If local_id is missing
    // from the server response, the key defaults to p.id.toString() (e.g. "42").
    // But the IDB record is keyed by UUID → .get("42") returns undefined.
    // Without this check, bulkPut would create a SECOND row keyed "42" alongside
    // the UUID-keyed original — the root cause of duplicate patient cards.
    if (!existing && p.id) {
      existing = await db.patients
        .where('id').equals(Number(p.id))
        .first()
        .catch(() => null)
        // Fallback scan if the index isn't ready (e.g. mid-migration)
        || (await db.patients.toArray()).find(x => String(x.id) === String(p.id)) || null;
    }

    if (existing) {
      if (existing.syncStatus !== SYNC.SYNCED) {
        // Record was PENDING or RETRYING — server confirms it exists.
        // Mark it synced with the authoritative server id.
        await db.patients.update(existing.local_id, {
          syncStatus: SYNC.SYNCED,
          id:         p.id ?? existing.id,
          userId:     uid || existing.userId || '',
          updatedAt:  Date.now(),
        });
        reconciled.push(existing.local_id);
      } else {
        // Already synced — refresh with latest server data (in-place update,
        // preserve the ORIGINAL primary key so no duplicate row is created)
        upserted.push({
          ...existing,
          ...p,
          local_id:   existing.local_id, // always keep the original UUID key
          userId:     uid || existing.userId || '',
          syncStatus: SYNC.SYNCED,
          updatedAt:  Date.now(),
        });
      }
    } else {
      // Truly brand-new record from server (another device / previous session)
      upserted.push({
        ...p,
        local_id:   localId,
        userId:     uid,
        syncStatus: SYNC.SYNCED,
        updatedAt:  Date.now(),
      });
    }
  }

  if (upserted.length > 0) {
    await db.patients.bulkPut(upserted);
  }

  return upserted;
}

export async function markPatientSynced(local_id, serverId) {
  await db.patients.update(local_id, {
    syncStatus: SYNC.SYNCED,
    id: serverId,
    updatedAt: Date.now(),
  });
}

export async function markPatientFailed(local_id) {
  await db.patients.update(local_id, { syncStatus: SYNC.FAILED });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VISITS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function saveVisit(visit) {
  const uid = getCurrentUserId() || visit.userId || '';
  const record = {
    ...visit,
    local_id:   visit.local_id || crypto.randomUUID(),
    userId:     uid,
    syncStatus: visit.syncStatus ?? SYNC.PENDING,
    updatedAt:  Date.now(),
  };
  await db.visits.put(record);
  return record;
}

export async function getVisitsForPatient(patientId) {
  // patientId can be the server id (number) or local_id (UUID string)
  const uid = getCurrentUserId() || '';
  if (!uid) return [];
  const all = await db.visits.where('userId').equals(uid).toArray();
  const pid = String(patientId);
  const visits = all.filter(v => String(v.patientId) === pid || String(v.patient_id) === pid);

  // ── Deduplicate visits by server ID (id) or local UUID (local_id) ──
  const seenIds = new Set();
  const uniqueVisits = [];

  // Sort visits so that COMPLETED or SYNCED versions are prioritized and processed first
  const sortedForDeduplication = [...visits].sort((a, b) => {
    if (a.status === 'COMPLETED' && b.status !== 'COMPLETED') return -1;
    if (a.status !== 'COMPLETED' && b.status === 'COMPLETED') return 1;
    if (a.syncStatus === SYNC.SYNCED && b.syncStatus !== SYNC.SYNCED) return -1;
    if (a.syncStatus !== SYNC.SYNCED && b.syncStatus === SYNC.SYNCED) return 1;
    return 0;
  });

  for (const v of sortedForDeduplication) {
    let duplicate = false;

    // 1. Check if server ID was already seen
    if (v.id) {
      const serverIdStr = String(v.id);
      if (seenIds.has(serverIdStr)) {
        duplicate = true;
      } else {
        seenIds.add(serverIdStr);
      }
    }

    // 2. Check if local_id (UUID) was already seen
    if (v.local_id) {
      const localIdStr = String(v.local_id);
      if (seenIds.has(localIdStr)) {
        duplicate = true;
      } else {
        seenIds.add(localIdStr);
      }
    }

    if (!duplicate) {
      uniqueVisits.push(v);
    }
  }

  return uniqueVisits.sort((a, b) => new Date(b.visit_date || b.date) - new Date(a.visit_date || a.date));
}

export async function getAllVisits() {
  const uid = getCurrentUserId() || '';
  if (!uid) return [];
  const all = await db.visits.where('userId').equals(uid).toArray();

  // ── Deduplicate visits by server ID (id) or local UUID (local_id) ──
  const seenIds = new Set();
  const uniqueVisits = [];

  // Sort visits so that COMPLETED or SYNCED versions are prioritized and processed first
  const sortedForDeduplication = [...all].sort((a, b) => {
    if (a.status === 'COMPLETED' && b.status !== 'COMPLETED') return -1;
    if (a.status !== 'COMPLETED' && b.status === 'COMPLETED') return 1;
    if (a.syncStatus === SYNC.SYNCED && b.syncStatus !== SYNC.SYNCED) return -1;
    if (a.syncStatus !== SYNC.SYNCED && b.syncStatus === SYNC.SYNCED) return 1;
    return 0;
  });

  for (const v of sortedForDeduplication) {
    let duplicate = false;

    // 1. Check if server ID was already seen
    if (v.id) {
      const serverIdStr = String(v.id);
      if (seenIds.has(serverIdStr)) {
        duplicate = true;
      } else {
        seenIds.add(serverIdStr);
      }
    }

    // 2. Check if local_id (UUID) was already seen
    if (v.local_id) {
      const localIdStr = String(v.local_id);
      if (seenIds.has(localIdStr)) {
        duplicate = true;
      } else {
        seenIds.add(localIdStr);
      }
    }

    if (!duplicate) {
      uniqueVisits.push(v);
    }
  }

  return uniqueVisits.sort((a, b) => new Date(b.visit_date || b.date) - new Date(a.visit_date || a.date));
}

export async function getPendingVisits() {
  const uid = getCurrentUserId();
  if (!uid) return [];
  return db.visits.where('syncStatus').anyOf([SYNC.PENDING, SYNC.RETRYING])
    .and(v => v.userId === uid).toArray();
}

export async function bulkUpsertVisits(visits) {
  const uid = getCurrentUserId() || '';
  const upserted = [];
  for (const v of visits) {
    // ── Step 1: Try primary key (local_id / UUID) lookup ─────────────────────
    const localId  = v.local_id || v.id?.toString() || crypto.randomUUID();
    const existing = await db.visits.get(localId);

    if (existing) {
      // Local completed status is authoritative over server pending status
      const preservedStatus = existing.status === 'COMPLETED'
        ? 'COMPLETED'
        : (v.status || existing.status);

      // If local is completed but server is pending, it's not truly synced yet
      const isSynced = (existing.status === 'COMPLETED' && v.status !== 'COMPLETED')
        ? existing.syncStatus
        : SYNC.SYNCED;

      // Merge server fields, protecting local clinical data & sync status
      await db.visits.update(localId, {
        ...v,
        status:     preservedStatus,
        syncStatus: isSynced,
        id:         v.id ?? existing.id,
        updatedAt:  Date.now(),
      });

      // Also reconcile the linked reminder
      const reminder = await db.reminders.get(localId);
      if (reminder) {
        await db.reminders.update(localId, {
          syncStatus: isSynced,
          status:     preservedStatus,
          id:         v.id ?? reminder.id,
          updatedAt:  Date.now(),
        });
      }
      continue;
    }

    // ── Step 2: Dedup by server id BEFORE inserting a new record ─────────────
    // When server visits lack a local_id (older rows), the fallback key becomes
    // v.id.toString() (e.g. "123"). But a local UUID-keyed record for that same
    // visit may already exist (created offline, synced, now has id=123 stored in
    // its `id` field). Without this check, bulkPut would create a SECOND IDB
    // record keyed "123" alongside the UUID-keyed one — the root cause of
    // duplicate visits appearing in the Reminders and PatientDetails panels.
    if (v.id) {
      const existingByServerId = await db.visits
        .where('id').equals(Number(v.id))
        .first()
        .catch(() => null)
        // Fallback scan if index not available
        || (await db.visits.toArray()).find(x => String(x.id) === String(v.id));

      if (existingByServerId) {
        // Update the existing UUID-keyed record in-place — do NOT insert a new one.
        const preservedStatus = existingByServerId.status === 'COMPLETED'
          ? 'COMPLETED'
          : (v.status || existingByServerId.status);
        const isSynced = (existingByServerId.status === 'COMPLETED' && v.status !== 'COMPLETED')
          ? existingByServerId.syncStatus
          : SYNC.SYNCED;
        await db.visits.update(existingByServerId.local_id, {
          ...v,
          local_id:   existingByServerId.local_id, // preserve original UUID key
          status:     preservedStatus,
          syncStatus: isSynced,
          updatedAt:  Date.now(),
        });
        // Reconcile linked reminder too
        const reminder = await db.reminders.get(existingByServerId.local_id);
        if (reminder) {
          await db.reminders.update(existingByServerId.local_id, {
            syncStatus: isSynced,
            status:     preservedStatus,
            id:         v.id ?? reminder.id,
            updatedAt:  Date.now(),
          });
        }
        continue;
      }
    }

    // ── Step 3: Truly new record from server — insert it ─────────────────────
    upserted.push({
      ...v,
      local_id:   localId,
      userId:     uid,
      syncStatus: SYNC.SYNCED,
      updatedAt:  Date.now(),
    });
  }
  if (upserted.length > 0) {
    await db.visits.bulkPut(upserted);
  }
}


export async function markVisitSynced(local_id, serverId) {
  const visit = await db.visits.get(local_id);
  if (!visit) return;

  const serverIdNum = (serverId && !String(serverId).startsWith('local_')) ? Number(serverId) : undefined;

  await db.visits.update(local_id, {
    syncStatus: SYNC.SYNCED,
    id: serverIdNum || visit.id,
    updatedAt: Date.now(),
  });

  const reminder = await db.reminders.get(local_id);
  if (reminder) {
    await db.reminders.update(local_id, {
      syncStatus: SYNC.SYNCED,
      id: serverIdNum || reminder.id,
      status: visit.status || reminder.status,
      updatedAt: Date.now(),
    });
  }

  const pid = String(visit.patientId || visit.patient_id);
  if (pid) {
    const folder = await db.reportFolders
      .where('patientId').equals(pid)
      .or('patientLocalId').equals(pid)
      .first();
    if (folder) {
      await db.reportFolders.update(folder.local_id, {
        syncStatus: SYNC.SYNCED,
        updatedAt: Date.now()
      });
    }
  }
}

export async function markVisitFailed(local_id) {
  await db.visits.update(local_id, { syncStatus: SYNC.FAILED });
  const reminder = await db.reminders.get(local_id);
  if (reminder) {
    await db.reminders.update(local_id, { syncStatus: SYNC.FAILED });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REMINDERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function saveReminder(reminder) {
  const uid = getCurrentUserId() || reminder.userId || '';
  const record = {
    ...reminder,
    local_id:   reminder.local_id || crypto.randomUUID(),
    userId:     uid,
    syncStatus: reminder.syncStatus ?? SYNC.SYNCED,
    updatedAt:  Date.now(),
  };
  await db.reminders.put(record);
  return record;
}

export async function getRemindersForDate(dateStr) {
  const uid = getCurrentUserId();
  const all = uid
    ? await db.reminders.where('userId').equals(uid).toArray()
    : await db.reminders.toArray();
  return all.filter(r => (r.visit_date || r.date || '').startsWith(dateStr));
}

export async function getAllReminders() {
  const uid = getCurrentUserId();
  if (!uid) return [];
  return db.reminders.where('userId').equals(uid).toArray();
}

export async function getPatientByIdOrLocalId(id) {
  if (!id) return null;
  const idStr = String(id);
  const numId = Number(id);
  const isNumeric = !isNaN(numId) && numId > 0;

  // ── 1. Primary key lookup (Fastest O(1)) ─────────────────────────────────
  try {
    const byPk = await db.patients.get(idStr);
    if (byPk) return byPk;
    if (isNumeric) {
      const byPkNum = await db.patients.get(numId);
      if (byPkNum) return byPkNum;
    }
  } catch (e) {
    console.warn('[DB] getPatientByIdOrLocalId PK lookup error:', e);
  }

  // ── 2. Index lookup by server 'id' (Uses the new v4 index) ───────────────
  //      Wrapped in try-catch to fallback safely if the browser is mid-migration.
  try {
    const byId = await db.patients.where('id').equals(idStr).first();
    if (byId) return byId;
    if (isNumeric) {
      const byIdNum = await db.patients.where('id').equals(numId).first();
      if (byIdNum) return byIdNum;
    }
  } catch (indexErr) {
    console.warn('[DB] getPatientByIdOrLocalId index search failed, falling back to scan:', indexErr.message);
  }

  // ── 3. Full-table scan fallback (Fail-safe O(N)) ─────────────────────────
  //      Guarantees patient lookup NEVER crashes even under corrupt store states.
  try {
    const all = await db.patients.toArray();
    const found = all.find(p =>
      String(p.local_id) === idStr ||
      String(p.id)       === idStr ||
      (isNumeric && (p.id === numId || Number(p.local_id) === numId))
    );
    if (found) {
      console.warn(`[DB] getPatientByIdOrLocalId resolved via filter-scan for id="${idStr}".`);
      return found;
    }
  } catch (scanErr) {
    console.error('[DB] getPatientByIdOrLocalId filter-scan failed entirely:', scanErr);
  }

  return null;
}

export async function getVisitByIdOrLocalId(id) {
  if (!id) return null;
  const idStr = String(id);
  const numId = Number(id);
  const isNumeric = !isNaN(numId) && numId > 0;

  // 1. Primary key lookup — O(1), always try first
  try {
    const byPk = await db.visits.get(idStr);
    if (byPk) return byPk;
    // Also try numeric primary key in case local_id was stored as a number
    if (isNumeric) {
      const byPkNum = await db.visits.get(numId);
      if (byPkNum) return byPkNum;
    }
  } catch (e) {
    console.warn('[DB] getVisitByIdOrLocalId pk lookup error:', e);
  }

  // 2. Index lookup by server 'id' field (uses the v3 schema index)
  //    Falls back to .filter() if the index isn't available yet (e.g. mid-migration).
  try {
    const byId = await db.visits.where('id').equals(idStr).first();
    if (byId) return byId;
    if (isNumeric) {
      const byIdNum = await db.visits.where('id').equals(numId).first();
      if (byIdNum) return byIdNum;
    }
  } catch (_indexErr) {
    // Index not available — fall through to filter scan below
  }

  // 3. Full-table filter scan — works regardless of schema, catches all type mismatches
  try {
    const all = await db.visits.toArray();
    const found = all.find(v =>
      String(v.local_id) === idStr ||
      String(v.id)       === idStr ||
      (isNumeric && (v.id === numId || Number(v.local_id) === numId))
    ) || null;
    if (found) {
      console.warn(`[DB] getVisitByIdOrLocalId: found via filter-scan for id="${idStr}". Index may be stale.`);
      return found;
    }
  } catch (e) {
    console.warn('[DB] getVisitByIdOrLocalId filter scan error:', e);
  }

  return null;
}

export async function getReminderByIdOrLocalId(id) {
  if (!id) return null;
  const idStr = String(id);
  const numId = Number(id);
  const isNumeric = !isNaN(numId) && numId > 0;

  // 1. Primary key lookup
  try {
    const byPk = await db.reminders.get(idStr);
    if (byPk) return byPk;
    if (isNumeric) {
      const byPkNum = await db.reminders.get(numId);
      if (byPkNum) return byPkNum;
    }
  } catch (e) {
    console.warn('[DB] getReminderByIdOrLocalId pk lookup error:', e);
  }

  // 2. Index lookup (uses v3 schema index on 'id')
  try {
    const byId = await db.reminders.where('id').equals(idStr).first();
    if (byId) return byId;
    if (isNumeric) {
      const byIdNum = await db.reminders.where('id').equals(numId).first();
      if (byIdNum) return byIdNum;
    }
  } catch (_indexErr) {
    // Index not yet available — fall through
  }

  // 3. Full-table filter scan
  try {
    const all = await db.reminders.toArray();
    return all.find(r =>
      String(r.local_id) === idStr ||
      String(r.id)       === idStr ||
      (isNumeric && (r.id === numId || Number(r.local_id) === numId))
    ) || null;
  } catch (e) {
    console.warn('[DB] getReminderByIdOrLocalId filter scan error:', e);
  }

  return null;
}

export async function bulkUpsertReminders(reminders) {
  const uid = getCurrentUserId() || '';
  let reconciled = 0;
  const reminderRecords = [];
  const visitRecords = [];

  for (const r of reminders) {
    const localId = r.local_id || r.id?.toString() || crypto.randomUUID();

    // ── Reconcile reminder ────────────────────────────────────────────────────
    let existingReminder = await db.reminders.get(localId);
    if (!existingReminder && r.id) {
      existingReminder = await db.reminders.where('id').equals(Number(r.id)).first()
        || await db.reminders.where('id').equals(String(r.id)).first();
    }

    if (existingReminder) {
      const preservedStatus = existingReminder.status === 'COMPLETED'
        ? 'COMPLETED'
        : (r.status || existingReminder.status);

      // If local is completed but server is pending, it's not fully synced yet
      const isSynced = (existingReminder.status === 'COMPLETED' && r.status !== 'COMPLETED')
        ? existingReminder.syncStatus
        : SYNC.SYNCED;

      // TOMBSTONE GUARD: if this reminder's local_id was recently deleted locally,
      // do not re-hydrate it from the server (prevents ghost reminders after deletion).
      if (isVisitTombstoned(existingReminder.local_id)) {
        console.log(`[DB] bulkUpsertReminders: skipping tombstoned reminder ${existingReminder.local_id}`);
        continue;
      }

      await db.reminders.update(existingReminder.local_id, {
        syncStatus: isSynced,
        id:         r.id ?? existingReminder.id,
        status:     preservedStatus,
        updatedAt:  Date.now(),
      });
      reconciled++;
    } else {
      // Not stale or brand new — upsert with fresh server data
      if (isVisitTombstoned(localId)) {
        console.log(`[DB] bulkUpsertReminders: skipping tombstoned new reminder ${localId}`);
        continue;
      }
      reminderRecords.push({
        ...r,
        local_id:   localId,
        userId:     uid,
        syncStatus: SYNC.SYNCED,
        updatedAt:  Date.now(),
      });
    }

    // ── Reconcile linked visit ────────────────────────────────────────────────
    let existingVisit = await db.visits.get(localId);
    if (!existingVisit && r.id) {
      existingVisit = await db.visits.where('id').equals(Number(r.id)).first()
        || await db.visits.where('id').equals(String(r.id)).first();
    }

    if (existingVisit) {
      const preservedStatus = existingVisit.status === 'COMPLETED'
        ? 'COMPLETED'
        : (r.status || existingVisit.status);

      // If local is completed but server is pending, it's not fully synced yet
      const isSynced = (existingVisit.status === 'COMPLETED' && r.status !== 'COMPLETED')
        ? existingVisit.syncStatus
        : SYNC.SYNCED;

      await db.visits.update(existingVisit.local_id, {
        syncStatus: isSynced,
        id:         r.id ?? existingVisit.id,
        status:     preservedStatus,
        updatedAt:  Date.now(),
      });
      reconciled++;
    } else if (!existingReminder) { // Only insert new visit if reminder was also new
      // ── DEDUP GUARD: check if a local visit already exists with this server id ──
      // Without this, bulkPut creates a new record keyed "11" even when a UUID-
      // keyed record for the same server visit already exists in IDB.
      let visitAlreadyExists = false;
      if (r.id) {
        const existingByServerId = await db.visits
          .where('id').equals(Number(r.id))
          .first()
          .catch(() => null)
          || (await db.visits.toArray()).find(x => String(x.id) === String(r.id));
        visitAlreadyExists = !!existingByServerId;
      }
      if (!visitAlreadyExists) {
        visitRecords.push({
          local_id:   localId,
          id:         r.id,
          patientId:  String(r.patient_id || r.patientId || ''),
          patient_id: String(r.patient_id || r.patientId || ''),
          visit_type: r.type || 'General',
          visit_date: r.date,
          date:       r.date,
          time:       r.time || '',
          status:     r.status || 'PENDING',
          severity:   r.severity || null,
          userId:     uid,
          syncStatus: SYNC.SYNCED,
          updatedAt:  Date.now(),
        });
      }
    }
  }

  if (reminderRecords.length > 0) {
    await db.reminders.bulkPut(reminderRecords);
  }
  if (visitRecords.length > 0) {
    await db.visits.bulkPut(visitRecords);
  }

  if (reconciled > 0) {
    console.log(`%c[DB] bulkUpsertReminders: reconciled ${reconciled} PENDING/RETRYING records → SYNCED`, 'color:#22c55e;font-weight:bold');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REPORT FOLDERS  (one per patient – the Reports-tab list view)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Create a report folder automatically when a patient is registered.
 * Idempotent – if the folder already exists it is updated in-place.
 *
 * @param {Object} patient – the patient record (from IDB or server)
 */
export async function createReportFolder(patient) {
  const patientLocalId = patient.local_id;
  const patientId      = patient.id?.toString() || null;

  // ── [Bug C Fix] Dual dedup: check patientLocalId first, then patientId ──────
  // A folder may already exist keyed by the UUID (created at offline registration)
  // but when called after sync its patientId is now set. Without the second check,
  // a second folder is inserted with the numeric patientId key — duplicate card.
  let existing = await db.reportFolders
    .where('patientLocalId').equals(patientLocalId)
    .first();

  // Second pass: if not found by UUID, try by server patientId
  if (!existing && patientId) {
    existing = await db.reportFolders
      .where('patientId').equals(patientId)
      .first();
  }

  if (existing) {
    // Update in-place — preserve original primary key, never insert a new row
    await db.reportFolders.update(existing.local_id, {
      name:          patient.name,
      category:      patient.category || (patient.is_pregnant ? 'Pregnancy' : 'General'),
      village:       patient.village,
      status:        patient.status || 'ACTIVE',
      // Backfill both IDs so the folder is findable by either key going forward
      patientId:     patientId ?? existing.patientId,
      patientLocalId: patientLocalId ?? existing.patientLocalId,
      syncStatus:    patient.syncStatus === SYNC.SYNCED ? SYNC.SYNCED : existing.syncStatus,
      updatedAt:     Date.now(),
    });
    return existing;
  }

  const uid = getCurrentUserId() || patient.userId || '';
  const folder = {
    local_id:      crypto.randomUUID(),
    patientLocalId,
    patientId,
    name:          patient.name,
    category:      patient.category || (patient.is_pregnant ? 'Pregnancy' : 'General'),
    village:       patient.village,
    status:        patient.status || 'ACTIVE',
    health_status: patient.health_status || null,
    last_updated:  patient.createdAt || new Date().toISOString(),
    userId:        uid,
    syncStatus:    patient.syncStatus === SYNC.SYNCED ? SYNC.SYNCED : SYNC.PENDING,
    updatedAt:     Date.now(),
    createdAt:     patient.createdAt || new Date().toISOString(),
  };
  await db.reportFolders.put(folder);
  return folder;
}

/**
 * Get all report folders – used by the Reports tab list view.
 *
 * [Bug D Fix] Applies a last-mile deduplication pass before returning results.
 * Despite the upstream fixes in createReportFolder and bulkUpsertReportFolders,
 * pre-existing duplicate rows in IndexedDB (from before this fix) still need to
 * be collapsed. We group by patient identity and keep the richest record.
 * This also permanently removes orphan rows from IDB so they never reappear.
 */
export async function getAllReportFolders() {
  const uid = getCurrentUserId();
  if (!uid) return [];
  const all = await db.reportFolders.where('userId').equals(uid).toArray();
  if (all.length === 0) return all;

  // Group folders by their canonical patient identity.
  // Priority: patientId (server integer) > patientLocalId (UUID)
  const seen = new Map(); // key → winning folder

  for (const folder of all) {
    // Build a stable identity key: prefer numeric server id, fall back to UUID
    const key = folder.patientId || folder.patientLocalId || folder.local_id;

    if (!seen.has(key)) {
      seen.set(key, folder);
      continue;
    }

    // Conflict: keep the more complete record
    const prev = seen.get(key);
    const prevScore = (prev.patientId ? 2 : 0) + (prev.syncStatus === SYNC.SYNCED ? 1 : 0);
    const currScore = (folder.patientId ? 2 : 0) + (folder.syncStatus === SYNC.SYNCED ? 1 : 0);

    const winner = currScore > prevScore
      ? folder  // current is richer
      : prevScore > currScore
        ? prev  // previous is richer
        : (folder.updatedAt || 0) > (prev.updatedAt || 0) ? folder : prev; // tie → most recent

    const loser = winner === folder ? prev : folder;

    seen.set(key, winner);

    // Tombstone the orphan row — delete it asynchronously so IDB stays clean.
    // Use a fire-and-forget pattern; UI never sees the orphan after this pass.
    db.reportFolders.delete(loser.local_id).catch(() => {});

    console.log(
      `%c[DB] getAllReportFolders: merged duplicate folder for patient key="${key}" (kept local_id=${winner.local_id}, removed local_id=${loser.local_id})`,
      'color:#f59e0b;font-weight:bold',
    );
  }

  return [...seen.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** Get one folder by patient server-id or local_id */
export async function getReportFolder(patientId) {
  const pid = String(patientId);
  // Try server id match first
  const byServerId = await db.reportFolders
    .where('patientId').equals(pid)
    .first();
  if (byServerId) return byServerId;
  // Then try local_id match (patientLocalId = local_id of patient)
  return db.reportFolders
    .where('patientLocalId').equals(pid)
    .first();
}

/**
 * Bulk-upsert report folders fetched from the server.
 * Called after GET /api/reports/patients succeeds.
 */
export async function bulkUpsertReportFolders(serverPatients) {
  const uid = getCurrentUserId() || '';
  let reconciled = 0;
  for (const sp of serverPatients) {
    const patientId     = String(sp.id);
    const serverLocalId = sp.local_id ? String(sp.local_id) : null;

    // ── [Bug B Fix] Two-phase lookup: server patientId first, then patientLocalId ──
    // Offline-created folders have patientId=null but patientLocalId=UUID.
    // A plain .where('patientId').equals(patientId) lookup misses them, causing
    // a second folder to be inserted — duplicate card in Reports.
    let existing = await db.reportFolders
      .where('patientId').equals(patientId)
      .first();

    // Phase 2: look up by the patient's local UUID (present on server response
    // when the client sent local_id during the original POST /api/patients)
    if (!existing && serverLocalId) {
      existing = await db.reportFolders
        .where('patientLocalId').equals(serverLocalId)
        .first();
    }

    // Phase 3: full scan for any folder whose patientLocalId matches (catches
    // edge-cases where the server's local_id field differs in format)
    if (!existing) {
      const allFolders = await db.reportFolders.toArray();
      existing = allFolders.find(f =>
        String(f.patientId) === patientId ||
        (serverLocalId && String(f.patientLocalId) === serverLocalId)
      ) || null;
    }

    if (existing) {
      // Update in-place — reconcile and backfill both ID fields
      await db.reportFolders.update(existing.local_id, {
        syncStatus:    SYNC.SYNCED,
        name:          sp.name         || existing.name,
        category:      sp.category     || existing.category || 'General',
        village:       sp.village      || existing.village  || '',
        status:        sp.status       || existing.status   || 'ACTIVE',
        patientId,
        userId:        uid || existing.userId || '',
        // Preserve the UUID-based patientLocalId if we have it
        patientLocalId: existing.patientLocalId || serverLocalId || patientId,
        updatedAt:     Date.now(),
      });
      if (existing.syncStatus !== SYNC.SYNCED) reconciled++;
      continue;
    }

    // Genuinely new — insert once
    const folder = {
      local_id:       crypto.randomUUID(),
      patientLocalId: serverLocalId || patientId,
      patientId,
      name:          sp.name,
      category:      sp.category || 'General',
      village:       sp.village  || '',
      status:        sp.status   || 'ACTIVE',
      health_status: sp.health_status || null,
      last_updated:  sp.last_updated  || new Date().toISOString(),
      userId:        uid,
      syncStatus:    SYNC.SYNCED,
      updatedAt:     Date.now(),
      createdAt:     new Date().toISOString(),
    };
    await db.reportFolders.put(folder);
  }

  if (reconciled > 0) {
    console.log(`%c[DB] bulkUpsertReportFolders: reconciled ${reconciled} PENDING/RETRYING folders → SYNCED`, 'color:#22c55e;font-weight:bold');
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REPORT ITEMS  (individual medical records inside a folder)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function saveReportItem(report) {
  const uid = getCurrentUserId() || report.userId || '';
  const record = {
    ...report,
    local_id:       report.local_id || crypto.randomUUID(),
    patientId:      String(report.patientId || report.patient_id || ''),
    patientLocalId: String(report.patientLocalId || ''),
    userId:         uid,
    syncStatus:     report.syncStatus ?? SYNC.PENDING,
    createdAt:      report.createdAt || new Date().toISOString(),
    updatedAt:      Date.now(),
  };
  await db.reportItems.put(record);
  return record;
}

export async function getReportItemsForPatient(patientId) {
  const uid = getCurrentUserId();
  const pid = String(patientId);
  const all = uid
    ? await db.reportItems.where('userId').equals(uid).toArray()
    : await db.reportItems.toArray();
  return all.filter(r =>
    String(r.patientId) === pid ||
    String(r.patientLocalId) === pid
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getPendingReportItems() {
  const uid = getCurrentUserId();
  if (!uid) return [];
  return db.reportItems.where('syncStatus').anyOf([SYNC.PENDING, SYNC.RETRYING])
    .and(r => r.userId === uid).toArray();
}

export async function bulkUpsertReportItems(reports, patientId) {
  const uid = getCurrentUserId() || '';
  let reconciled = 0;
  const records = [];
  for (const r of reports) {
    const localId = r.local_id || r.id?.toString() || crypto.randomUUID();
    const existing = await db.reportItems.get(localId);

    if (existing && existing.syncStatus !== SYNC.SYNCED) {
      // ── Reconcile: server confirms this report item exists → SYNCED ─────────
      await db.reportItems.update(localId, {
        syncStatus: SYNC.SYNCED,
        id:         r.id ?? existing.id,
        updatedAt:  Date.now(),
      });
      reconciled++;
      continue;
    }

    records.push({
      ...r,
      local_id:   localId,
      patientId:  String(patientId),
      userId:     uid,
      syncStatus: SYNC.SYNCED,
      updatedAt:  Date.now(),
    });
  }
  if (records.length > 0) {
    await db.reportItems.bulkPut(records);
  }

  if (reconciled > 0) {
    console.log(`%c[DB] bulkUpsertReportItems: reconciled ${reconciled} PENDING/RETRYING items → SYNCED`, 'color:#22c55e;font-weight:bold');
  }
}

export async function markReportItemSynced(local_id, serverId) {
  await db.reportItems.update(local_id, {
    syncStatus: SYNC.SYNCED,
    id: serverId,
    updatedAt: Date.now(),
  });
}

export async function markReportItemFailed(local_id) {
  await db.reportItems.update(local_id, { syncStatus: SYNC.FAILED });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COUNTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function getPendingCount() {
  // Only count records that the CLIENT actively pushes to the server.
  // Reminders and reportFolders are server-sourced (pulled, not pushed) —
  // including them caused the "N changes waiting" false-positive after sync.
  const uid = getCurrentUserId();
  if (!uid) return 0;
  const [p, v, ri, imgs] = await Promise.all([
    db.patients.where('syncStatus').anyOf([SYNC.PENDING, SYNC.RETRYING]).and(x => x.userId === uid).count(),
    db.visits.where('syncStatus').anyOf([SYNC.PENDING, SYNC.RETRYING]).and(x => x.userId === uid).count(),
    db.reportItems.where('syncStatus').anyOf([SYNC.PENDING, SYNC.RETRYING]).and(x => x.userId === uid).count(),
    db.prescriptionImages
      ? db.prescriptionImages.where('syncStatus').anyOf([SYNC.PENDING, SYNC.RETRYING]).and(x => x.userId === uid).count()
      : Promise.resolve(0),
  ]);
  const total = p + v + ri + imgs;
  if (total > 0) {
    console.debug(`%c[DB] getPendingCount → patients=${p} visits=${v} reportItems=${ri} images=${imgs} TOTAL=${total}`, 'color:#94a3b8');
  }
  return total;
}


/**
 * Full diagnostic snapshot of all IDB stores.
 * Called by the SyncDebugPanel to render the debug UI.
 */
export async function getFullDiagnostics() {
  const uid = getCurrentUserId();
  const [patients, visits, reminders, reportFolders, reportItems, prescriptionImages] =
    await Promise.all([
      uid ? db.patients.where('userId').equals(uid).toArray() : Promise.resolve([]),
      uid ? db.visits.where('userId').equals(uid).toArray() : Promise.resolve([]),
      uid ? db.reminders.where('userId').equals(uid).toArray() : Promise.resolve([]),
      uid ? db.reportFolders.where('userId').equals(uid).toArray() : Promise.resolve([]),
      uid ? db.reportItems.where('userId').equals(uid).toArray() : Promise.resolve([]),
      uid ? (db.prescriptionImages?.where('userId').equals(uid).toArray().catch(() => []) ?? Promise.resolve([])) : Promise.resolve([]),
    ]);

  const countByStatus = (arr) => arr.reduce((acc, r) => {
    acc[r.syncStatus] = (acc[r.syncStatus] || 0) + 1;
    return acc;
  }, {});

  const pendingItems = [
    ...patients.filter(r => r.syncStatus === SYNC.PENDING || r.syncStatus === SYNC.RETRYING)
               .map(r => ({ table: 'patients', local_id: r.local_id, name: r.name, syncStatus: r.syncStatus, retryCount: r.retryCount || 0, createdAt: r.createdAt || r.updatedAt })),
    ...visits.filter(r => r.syncStatus === SYNC.PENDING || r.syncStatus === SYNC.RETRYING)
             .map(r => ({ table: 'visits', local_id: r.local_id, name: `Visit ${r.visit_type || r.type || '?'} for patient ${r.patientId}`, syncStatus: r.syncStatus, retryCount: r.retryCount || 0, createdAt: r.visit_date || r.createdAt })),
    ...reminders.filter(r => r.syncStatus === SYNC.PENDING || r.syncStatus === SYNC.RETRYING)
                .map(r => ({ table: 'reminders', local_id: r.local_id, name: `Reminder ${r.type || '?'} on ${r.date || r.visit_date}`, syncStatus: r.syncStatus, retryCount: r.retryCount || 0, createdAt: r.date || r.visit_date })),
    ...reportFolders.filter(r => r.syncStatus === SYNC.PENDING || r.syncStatus === SYNC.RETRYING)
                    .map(r => ({ table: 'reportFolders', local_id: r.local_id, name: `Folder for patient ${r.patientId}`, syncStatus: r.syncStatus, retryCount: 0, createdAt: r.createdAt })),
    ...reportItems.filter(r => r.syncStatus === SYNC.PENDING || r.syncStatus === SYNC.RETRYING)
                  .map(r => ({ table: 'reportItems', local_id: r.local_id, name: r.title || `Report ${r.type}`, syncStatus: r.syncStatus, retryCount: r.retryCount || 0, createdAt: r.createdAt })),
  ];

  return {
    counts: {
      patients:           { total: patients.length,           byStatus: countByStatus(patients) },
      visits:             { total: visits.length,             byStatus: countByStatus(visits) },
      reminders:          { total: reminders.length,          byStatus: countByStatus(reminders) },
      reportFolders:      { total: reportFolders.length,      byStatus: countByStatus(reportFolders) },
      reportItems:        { total: reportItems.length,        byStatus: countByStatus(reportItems) },
      prescriptionImages: { total: prescriptionImages.length, byStatus: countByStatus(prescriptionImages) },
    },
    pendingItems,
    raw: { patients, visits, reminders, reportFolders, reportItems, prescriptionImages },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRESCRIPTION IMAGES  (offline-first base64 blobs, synced to server later)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Save a prescription image locally.
 * @param {string} visitLocalId  – local_id of the associated visit
 * @param {string} dataUrl       – base64 data URL (from FileReader)
 * @returns {Object} saved record with local_id
 */
export async function savePrescriptionImage(visitLocalId, dataUrl) {
  const uid = getCurrentUserId() || '';
  const record = {
    local_id:    crypto.randomUUID(),
    visitLocalId: String(visitLocalId),
    dataUrl,
    url:         null,   // populated after server upload
    userId:      uid,
    syncStatus:  SYNC.PENDING,
    createdAt:   new Date().toISOString(),
    updatedAt:   Date.now(),
  };
  await db.prescriptionImages.put(record);
  return record;
}

/** Get all prescription images for a visit (by visitLocalId) */
export async function getPrescriptionImagesForVisit(visitLocalId) {
  return db.prescriptionImages
    .where('visitLocalId').equals(String(visitLocalId))
    .toArray();
}

/** Get all pending prescription images that need to be uploaded */
export async function getPendingPrescriptionImages() {
  const uid = getCurrentUserId();
  if (!uid) return [];
  return db.prescriptionImages
    .where('syncStatus').anyOf([SYNC.PENDING, SYNC.RETRYING])
    .and(x => x.userId === uid).toArray();
}

/** After a successful server upload, store the URL and mark synced */
export async function markPrescriptionImageSynced(local_id, serverUrl) {
  await db.prescriptionImages.update(local_id, {
    syncStatus: SYNC.SYNCED,
    url:        serverUrl,
    updatedAt:  Date.now(),
  });
}

export async function markPrescriptionImageFailed(local_id) {
  await db.prescriptionImages.update(local_id, { syncStatus: SYNC.FAILED });
}

/**
 * Transactionally deletes successfully synced completed visits and report items older than N days.
 * Capped at 180 days by default to balance history completeness with device capacity.
 */
export async function pruneOldSyncedData(daysToKeep = 180) {
  const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
  let prunedCount = 0;

  try {
    await db.transaction('rw', [db.visits, db.reportItems, db.prescriptionImages], async () => {
      // 1. Find synced visits completed before cutoff
      const oldVisits = await db.visits
        .where('syncStatus').equals(SYNC.SYNCED)
        .and(v => v.status === 'COMPLETED' && (v.updatedAt || 0) < cutoff)
        .toArray();

      if (oldVisits.length > 0) {
        const localIds = oldVisits.map(v => v.local_id);
        // Delete from visits table
        await db.visits.bulkDelete(localIds);
        // Delete associated prescription image blobs to reclaim 90%+ storage
        await db.prescriptionImages.where('visitLocalId').anyOf(localIds).delete();
        prunedCount += localIds.length;
      }

      // 2. Find synced report items older than cutoff
      const oldReports = await db.reportItems
        .where('syncStatus').equals(SYNC.SYNCED)
        .and(r => (r.updatedAt || 0) < cutoff)
        .toArray();

      if (oldReports.length > 0) {
        await db.reportItems.bulkDelete(oldReports.map(r => r.local_id));
      }
    });

    if (prunedCount > 0) {
      console.log(`%c[DB] pruneOldSyncedData: freed ${prunedCount} completed visits & blobs older than ${daysToKeep} days`, 'color:#22c55e;font-weight:bold');
    }
  } catch (err) {
    console.warn('[DB] Pruning cycle encountered an error:', err);
  }
}

/**
 * Completely clears all tables in the local IndexedDB.
 * This is crucial for multi-tenant isolation, ensuring no patient data 
 * leaks or survives across user login/logout sessions.
 */
export async function clearAllLocalData() {
  try {
    await db.transaction('rw', [
      db.patients, 
      db.visits, 
      db.reminders, 
      db.reportFolders, 
      db.reportItems, 
      db.syncQueue, 
      db.prescriptionImages
    ], async () => {
      await Promise.all([
        db.patients.clear(),
        db.visits.clear(),
        db.reminders.clear(),
        db.reportFolders.clear(),
        db.reportItems.clear(),
        db.syncQueue.clear(),
        db.prescriptionImages.clear()
      ]);
    });
    console.log('%c[DB] clearAllLocalData: All IndexedDB stores cleared successfully.', 'color:#3b82f6;font-weight:bold');
  } catch (err) {
    console.error('[DB] Failed to clear local IndexedDB stores:', err);
    throw err;
  }
}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CASCADING PATIENT DELETION  (offline-first)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Delete a patient and every IDB record linked to them in a single transaction.
 *
 * Accepts either the server id (number) or local_id (UUID string) so the call
 * site does not need to know which identifier is available.
 *
 * Stores cleaned up:
 *  - patients
 *  - visits             (patientId or patient_id match)
 *  - reminders          (patientId or patient_id match)
 *  - reportFolders      (patientId or patientLocalId match)
 *  - reportItems        (patientId or patientLocalId match)
 *  - prescriptionImages (visitLocalId matches any visit that belonged to patient)
 *  - syncQueue          (entity payload local_id matches patient or its visits)
 *
 * Returns { deletedVisitLocalIds } so callers can do extra cleanup if needed.
 */
export async function deletePatientAndAllData(patientLocalId, patientServerId) {
  const pidStr    = patientLocalId  ? String(patientLocalId)  : null;
  const serverStr = patientServerId ? String(patientServerId) : null;

  // ── 1. Collect related visit local_ids BEFORE we delete anything ────────────
  const allVisits = await db.visits.toArray();
  const patientVisits = allVisits.filter(v => {
    const vPid = String(v.patientId || v.patient_id || '');
    return (pidStr && vPid === pidStr) || (serverStr && vPid === serverStr);
  });
  const visitLocalIds = patientVisits.map(v => v.local_id).filter(Boolean);

  // ── 2. Collect prescription image local_ids for those visits ────────────────
  let prescriptionImageLocalIds = [];
  if (visitLocalIds.length > 0) {
    const allImages = await db.prescriptionImages.toArray().catch(() => []);
    prescriptionImageLocalIds = allImages
      .filter(img => visitLocalIds.includes(String(img.visitLocalId)))
      .map(img => img.local_id);
  }

  // ── 3. Collect report folder / item local_ids ────────────────────────────────
  const allFolders = await db.reportFolders.toArray();
  const folderLocalIds = allFolders
    .filter(f =>
      (pidStr    && (String(f.patientId) === pidStr    || String(f.patientLocalId) === pidStr))    ||
      (serverStr && (String(f.patientId) === serverStr || String(f.patientLocalId) === serverStr))
    )
    .map(f => f.local_id);

  const allItems = await db.reportItems.toArray();
  const itemLocalIds = allItems
    .filter(r =>
      (pidStr    && (String(r.patientId) === pidStr    || String(r.patientLocalId) === pidStr))    ||
      (serverStr && (String(r.patientId) === serverStr || String(r.patientLocalId) === serverStr))
    )
    .map(r => r.local_id);

  // ── 4. Collect reminder local_ids ───────────────────────────────────────────
  const allReminders = await db.reminders.toArray();
  const reminderLocalIds = allReminders
    .filter(r => {
      const rPid = String(r.patientId || r.patient_id || '');
      return (pidStr && rPid === pidStr) || (serverStr && rPid === serverStr);
    })
    .map(r => r.local_id);

  // ── 5. Transactional deletion ────────────────────────────────────────────────
  const stores = [
    db.patients,
    db.visits,
    db.reminders,
    db.reportFolders,
    db.reportItems,
    db.syncQueue,
  ];
  // prescriptionImages is optional (only exists in v2+ schema)
  if (db.prescriptionImages) stores.push(db.prescriptionImages);

  await db.transaction('rw', stores, async () => {
    // Patient row(s) — delete by primary key (local_id) and by server id index
    if (pidStr)    await db.patients.delete(pidStr);
    if (serverStr && serverStr !== pidStr) {
      const byServer = await db.patients.where('id').equals(Number(serverStr)).first().catch(() => null);
      if (byServer) await db.patients.delete(byServer.local_id);
    }

    // Visits
    if (visitLocalIds.length > 0) {
      await db.visits.bulkDelete(visitLocalIds);
    }

    // Reminders
    if (reminderLocalIds.length > 0) {
      await db.reminders.bulkDelete(reminderLocalIds);
    }

    // Report folders
    if (folderLocalIds.length > 0) {
      await db.reportFolders.bulkDelete(folderLocalIds);
    }

    // Report items
    if (itemLocalIds.length > 0) {
      await db.reportItems.bulkDelete(itemLocalIds);
    }

    // Prescription image blobs
    if (prescriptionImageLocalIds.length > 0 && db.prescriptionImages) {
      await db.prescriptionImages.bulkDelete(prescriptionImageLocalIds);
    }

    // Sync queue: remove any entries whose payload references this patient
    const queueItems = await db.syncQueue.toArray();
    const staleQueueIds = queueItems
      .filter(q => {
        try {
          const p = typeof q.payload === 'string' ? JSON.parse(q.payload) : (q.payload || {});
          const lid = String(p.local_id || p.patientId || '');
          return (pidStr && lid === pidStr) || (serverStr && lid === serverStr);
        } catch { return false; }
      })
      .map(q => q.id);
    if (staleQueueIds.length > 0) {
      await db.syncQueue.bulkDelete(staleQueueIds);
    }
  });

  console.log(
    `%c[DB] deletePatientAndAllData: removed patient local_id=${pidStr} server_id=${serverStr} ` +
    `| visits=${visitLocalIds.length} reminders=${reminderLocalIds.length} ` +
    `folders=${folderLocalIds.length} items=${itemLocalIds.length} ` +
    `images=${prescriptionImageLocalIds.length}`,
    'color:#ef4444;font-weight:bold',
  );

  return { deletedVisitLocalIds: visitLocalIds };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VISIT DELETION TOMBSTONE
// Prevents bulkUpsertReminders from re-hydrating reminders for visits that
// were just deleted locally. Tombstones expire after 24 hours.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TOMBSTONE_KEY = 'ak_deleted_visit_ids';
const TOMBSTONE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function _getTombstones() {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch { return {}; }
}

function _setTombstones(obj) {
  try { localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(obj)); } catch {}
}

export function tombstoneVisitId(localId, serverId) {
  const ts = _getTombstones();
  const now = Date.now();
  if (localId) ts[String(localId)] = now;
  if (serverId) ts[String(serverId)] = now;
  // Prune expired entries
  for (const key of Object.keys(ts)) {
    if (now - ts[key] > TOMBSTONE_TTL) delete ts[key];
  }
  _setTombstones(ts);
}

export function isVisitTombstoned(id) {
  if (!id) return false;
  const ts = _getTombstones();
  const entry = ts[String(id)];
  if (!entry) return false;
  if (Date.now() - entry > TOMBSTONE_TTL) return false;
  return true;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SINGLE VISIT DELETION  (keeps patient + other visits intact)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Delete one visit from IDB and all directly related data:
 *   - visit row
 *   - the reminder that shares the same local_id (reminderEngine sets reminder.local_id = visit.local_id)
 *   - any reminders that have visitId / visit_id pointing to this visit
 *   - prescription image blobs for this visit
 *   - sync-queue items referencing this visit local_id
 *
 * The patient record and all other visits are left untouched.
 *
 * @param {string} visitLocalId  - IDB primary key (UUID)
 * @param {number|string|null} visitServerId - server integer id (if synced)
 */
export async function deleteVisitAndRelated(visitLocalId, visitServerId) {
  const lidStr = visitLocalId  ? String(visitLocalId)  : null;
  const sidStr = visitServerId ? String(visitServerId) : null;

  // Tombstone so bulkUpsertReminders never re-hydrates this visit's reminder
  tombstoneVisitId(lidStr, sidStr);

  // Collect reminder local_ids:
  //  1. The reminder that SHARES the visit's local_id (primary pattern — reminderEngine)
  //  2. Any reminder with visitId / visit_id / visit_local_id pointing here
  //  3. Any reminder whose server id matches visitServerId
  const allReminders = await db.reminders.toArray();
  const reminderLocalIds = allReminders
    .filter(r => {
      const rLid  = String(r.local_id || '');
      const rVid  = String(r.visitId || r.visit_id || r.visit_local_id || '');
      const rId   = String(r.id || '');
      return (
        // Same local_id as visit (most common — reminderEngine pattern)
        (lidStr && rLid === lidStr) ||
        // visitId field on reminder
        (lidStr && rVid === lidStr) ||
        (sidStr && rVid === sidStr) ||
        // reminder server id matches visit server id (for server-created reminders)
        (sidStr && rId  === sidStr)
      );
    })
    .map(r => r.local_id)
    .filter(Boolean);

  // Collect prescription image local_ids for this visit
  const allImages = await db.prescriptionImages?.toArray().catch(() => []) ?? [];
  const imageLocalIds = allImages
    .filter(img => lidStr && String(img.visitLocalId) === lidStr)
    .map(img => img.local_id);

  // Collect matching sync-queue items
  const queueItems = await db.syncQueue.toArray();
  const staleQueueIds = queueItems
    .filter(q => {
      try {
        const p = typeof q.payload === 'string' ? JSON.parse(q.payload) : (q.payload || {});
        const lid = String(p.local_id || '');
        return (lidStr && lid === lidStr) || (sidStr && lid === sidStr);
      } catch { return false; }
    })
    .map(q => q.id);

  const stores = [db.visits, db.reminders, db.syncQueue];
  if (db.prescriptionImages) stores.push(db.prescriptionImages);

  await db.transaction('rw', stores, async () => {
    // Visit
    if (lidStr) await db.visits.delete(lidStr);

    // Reminders (may include the one sharing local_id with the visit)
    if (reminderLocalIds.length > 0) await db.reminders.bulkDelete(reminderLocalIds);

    // Prescription images
    if (imageLocalIds.length > 0 && db.prescriptionImages) {
      await db.prescriptionImages.bulkDelete(imageLocalIds);
    }

    // Sync queue
    if (staleQueueIds.length > 0) await db.syncQueue.bulkDelete(staleQueueIds);
  });

  console.log(
    `%c[DB] deleteVisitAndRelated: local_id=${lidStr} server_id=${sidStr} ` +
    `| reminders=${reminderLocalIds.length} images=${imageLocalIds.length}`,
    'color:#f97316;font-weight:bold',
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DASHBOARD ANALYTICS — computed entirely from local IndexedDB
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Returns the same shape as GET /api/dashboard/analytics but computed locally.
 * Used as the instant offline-first layer — replaced by backend data once online.
 */
export async function getLocalDashboardAnalytics() {
  const uid = getCurrentUserId();
  if (!uid) {
    return {
      stats: {
        totalPatients: 0, todayVisits: 0, pendingVisitsToday: 0,
        followUpsDue: 0, overdueFollowUps: 0, highRiskCount: 0,
        visitsCompletedCount: 0, highRisk: 0, remindersCount: 0,
      },
      distribution: { general: 0, maternal: 0, child: 0, chronic: 0, highRisk: 0 },
      conditions: [], monthlyTrend: [], recentActivities: [], todaySchedule: [], alerts: [],
    };
  }

  const [patients, visits, reminders, reportItems] = await Promise.all([
    db.patients.where('userId').equals(uid).toArray(),
    db.visits.where('userId').equals(uid).toArray(),
    db.reminders.where('userId').equals(uid).toArray(),
    db.reportItems.where('userId').equals(uid).toArray(),
  ]);

  const getLocalDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const extractDateOnly = (dStr) => {
    if (!dStr) return '';
    return dStr.split('T')[0];
  };

  const todayStr = getLocalDateString();
  const now      = new Date();

  // ── STATS ──────────────────────────────────────────────────────────────────
  const totalPatients = patients.length;

  const todayVisitsList = visits.filter(v => {
    const d = extractDateOnly(v.visit_date || v.visit_datetime || v.date || '');
    return d === todayStr;
  });
  const todayCompleted = todayVisitsList.filter(v =>
    (v.status || '').toUpperCase() === 'COMPLETED'
  );
  const todayPending = todayVisitsList.filter(v =>
    (v.status || '').toUpperCase() === 'PENDING'
  );

  const allCompleted = visits.filter(v =>
    (v.status || '').toUpperCase() === 'COMPLETED'
  );

  // Overdue visits (pending, date < today)
  const overdueVisits = visits.filter(v =>
    (v.status || '').toUpperCase() === 'PENDING' &&
    extractDateOnly(v.visit_date || v.date) < todayStr
  );

  // Pending reminders (due <= today)
  const pendingReminders = reminders.filter(r =>
    (r.status || '').toUpperCase() === 'PENDING' &&
    extractDateOnly(r.due_date || r.visit_date || r.date) <= todayStr
  );

  // Overdue reminders (due < today)
  const overdueReminders = reminders.filter(r =>
    (r.status || '').toUpperCase() === 'PENDING' &&
    extractDateOnly(r.due_date || r.visit_date || r.date) < todayStr
  );

  // Scheduled / upcoming follow-ups
  const upcomingFollowups = reminders.filter(r =>
    (r.status || '').toUpperCase() === 'PENDING' &&
    extractDateOnly(r.due_date || r.visit_date || r.date) > todayStr
  );

  // High risk patients check
  const isHighRiskPatient = (p) => {
    if ((p.risk_level || '').toLowerCase() === 'high' || p.is_high_risk === true) {
      return true;
    }
    const disease = (p.disease || '').toLowerCase();
    if (disease.includes('severe') || disease.includes('complication') || disease.includes('critical') || disease.includes('ebola') || disease.includes('malaria') || disease.includes('tb')) {
      return true;
    }
    if (p.risk_flags && typeof p.risk_flags === 'object') {
      const flags = Object.values(p.risk_flags);
      if (flags.some(v => v === true || v === 'true')) {
        return true;
      }
    }
    return false;
  };

  const highRiskPatients = patients.filter(isHighRiskPatient);

  const stats = {
    totalPatients,
    todayVisits:          todayVisitsList.length === 0 ? null : todayCompleted.length,
    pendingVisitsToday:   todayPending.length,
    followUpsDue:         overdueVisits.length + pendingReminders.length + upcomingFollowups.length,
    overdueFollowUps:     overdueVisits.length + overdueReminders.length,
    highRiskCount:        patients.length === 0 ? null : highRiskPatients.length,
    visitsCompletedCount: allCompleted.length,
    // Legacy compat
    highRisk:       patients.length === 0 ? null : highRiskPatients.length,
    remindersCount: todayPending.length + overdueVisits.length + pendingReminders.length,
  };

  // ── PATIENT DISTRIBUTION ───────────────────────────────────────────────────
  let general = 0, maternal = 0, child = 0, chronic = 0, highRisk = 0;
  for (const p of patients) {
    const cat = (p.category || 'General').trim();
    if (cat === 'Pregnancy' || cat === 'Maternal') maternal++;
    else if (p.age != null && Number(p.age) <= 12) child++;
    else if (cat === 'Chronic' || cat === 'NCD') chronic++;
    else if (isHighRiskPatient(p)) highRisk++;
    else general++;
  }
  const distribution = { general, maternal, child, chronic, highRisk };

  // ── TOP HEALTH CONDITIONS ──────────────────────────────────────────────────
  const conditionMap = {};
  for (const p of patients) {
    const addCondition = (name) => {
      const k = name.trim();
      if (!k) return;
      conditionMap[k] = (conditionMap[k] || 0) + 1;
    };
    if (p.disease) addCondition(p.disease);
    if (p.risk_flags && typeof p.risk_flags === 'object') {
      for (const [flag, val] of Object.entries(p.risk_flags)) {
        if (val) addCondition(flag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
      }
    }
  }
  const conditions = Object.entries(conditionMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── MONTHLY TREND (last 6 months) ─────────────────────────────────────────
  const monthlyMap = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'short' });
    monthlyMap[key] = { month: label, patientsAdded: 0, visitsCompleted: 0 };
  }
  for (const p of patients) {
    const ts = p.createdAt || p.created_at || '';
    const key = ts.slice(0, 7);
    if (monthlyMap[key]) monthlyMap[key].patientsAdded++;
  }
  for (const v of allCompleted) {
    const ts = v.completedAt || v.completed_at || v.visit_date || v.visit_datetime || '';
    const key = ts.slice(0, 7);
    if (monthlyMap[key]) monthlyMap[key].visitsCompleted++;
  }
  const monthlyTrend = Object.values(monthlyMap);

  // ── RECENT ACTIVITIES ──────────────────────────────────────────────────────
  const activityList = [];
  const patientById  = Object.fromEntries(patients.map(p => [p.local_id, p]));

  for (const p of patients) {
    activityList.push({
      type:      'patient_registered',
      title:     'New patient registered',
      detail:    `${p.name || 'Patient'} • ${p.village || 'Village'}`,
      timestamp: p.createdAt || p.created_at || '',
    });
  }
  for (const v of visits) {
    const pat = patientById[v.patientId] || patientById[v.patient_id];
    if ((v.status || '').toUpperCase() === 'COMPLETED') {
      activityList.push({
        type:      'visit_completed',
        title:     'Visit completed',
        detail:    `${pat?.name || 'Patient'} • ${v.visit_type || 'General Checkup'}`,
        timestamp: v.completedAt || v.completed_at || v.visit_date || '',
      });
    } else {
      activityList.push({
        type:      'visit_scheduled',
        title:     'Visit scheduled',
        detail:    `${pat?.name || 'Patient'} • ${v.visit_type || 'General Checkup'}`,
        timestamp: v.createdAt || v.created_at || v.visit_date || '',
      });
    }
  }
  for (const ri of reportItems) {
    activityList.push({
      type:      'report_added',
      title:     'Health record updated',
      detail:    ri.title || 'Report',
      timestamp: ri.createdAt || ri.created_at || '',
    });
  }
  for (const r of reminders) {
    const pat = patientById[r.patientId] || patientById[r.patient_id];
    if ((r.status || '').toUpperCase() === 'COMPLETED') {
      activityList.push({
        type:      'reminder_done',
        title:     'Follow-up completed',
        detail:    `${pat?.name || 'Patient'} • ${r.reminder_type || r.type || 'Follow-up'}`,
        timestamp: r.completedAt || r.updatedAt || '',
      });
    } else {
      activityList.push({
        type:      'reminder_generated',
        title:     'Reminder generated',
        detail:    `${pat?.name || 'Patient'} • ${r.reminder_type || r.type || 'Follow-up'}`,
        timestamp: r.createdAt || '',
      });
    }
  }

  const validActivities = activityList.filter(a => a.timestamp);
  validActivities.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const recentActivities = validActivities.slice(0, 8);

  // ── TODAY'S SCHEDULE ───────────────────────────────────────────────────────
  const scheduleItems = [];

  // 1. Scheduled visits for today, or past pending visits (overdue)
  const scheduleVisits = visits.filter(v => {
    const vDate = extractDateOnly(v.visit_date || v.visit_datetime || v.date || '');
    const isCompleted = (v.status || '').toUpperCase() === 'COMPLETED';
    return vDate === todayStr || (!isCompleted && vDate < todayStr);
  });

  for (const v of scheduleVisits) {
    const pat = patientById[v.patientId] || patientById[v.patient_id];
    const dt  = v.visit_date || v.visit_datetime || v.date || '';
    const time = v.time || (dt.length >= 16
      ? new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '09:00 AM');
    const isCompleted = (v.status || '').toUpperCase() === 'COMPLETED';
    
    let status = 'upcoming';
    if (isCompleted) {
      status = 'completed';
    } else {
      const vDate = extractDateOnly(dt);
      if (vDate === todayStr) {
        status = 'pending';
      } else if (vDate < todayStr) {
        status = 'overdue';
      } else {
        status = 'upcoming';
      }
    }

    scheduleItems.push({
      time,
      sortKey: dt + (v.time || '09:00'),
      title: v.visit_type || 'Home Visit',
      place: `${pat?.name || 'Patient'}${pat?.village ? ' • ' + pat.village : ''}`,
      status,
      visitId: v.local_id || v.id,
    });
  }

  // 2. Reminders for today, or past pending reminders (overdue)
  for (const r of reminders) {
    const due = extractDateOnly(r.due_date || r.visit_date || r.date || '');
    const isCompleted = (r.status || '').toUpperCase() === 'COMPLETED';
    if (due === todayStr || (!isCompleted && due < todayStr)) {
      const pat = patientById[r.patientId] || patientById[r.patient_id];
      
      let status = 'upcoming';
      if (isCompleted) {
        status = 'completed';
      } else {
        if (due === todayStr) {
          status = 'pending';
        } else if (due < todayStr) {
          status = 'overdue';
        } else {
          status = 'upcoming';
        }
      }

      // Check if we already added a visit for the same local_id / id to avoid duplicates
      const isDuplicate = scheduleItems.some(item => 
        String(item.visitId) === String(r.local_id) || 
        String(item.visitId) === String(r.id)
      );

      if (!isDuplicate) {
        scheduleItems.push({
          time: r.time || '09:00 AM',
          sortKey: due + 'T' + (r.time || '09:00'),
          title: r.reminder_type || r.type || 'Follow-up',
          place: `${pat?.name || 'Patient'}${pat?.village ? ' • ' + pat.village : ''}`,
          status,
          reminderId: r.local_id || r.id,
        });
      }
    }
  }

  scheduleItems.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const todaySchedule = scheduleItems.slice(0, 8);

  // ── ALERTS ─────────────────────────────────────────────────────────────────
  const alerts = [];
  if (highRiskPatients.length > 0) {
    alerts.push({
      type:    'high_risk',
      count:   highRiskPatients.length,
      message: `${highRiskPatients.length} high risk patient${highRiskPatients.length > 1 ? 's' : ''} need attention`,
    });
  }
  if (overdueVisits.length > 0) {
    alerts.push({
      type:    'overdue_followup',
      count:   overdueVisits.length,
      message: `${overdueVisits.length} scheduled visit${overdueVisits.length > 1 ? 's' : ''} overdue/missed`,
    });
  }
  if (todayPending.length > 0) {
    alerts.push({
      type:    'followup_due',
      count:   todayPending.length,
      message: `${todayPending.length} visit${todayPending.length > 1 ? 's are' : ' is'} scheduled for today`,
    });
  }
  if (overdueReminders.length > 0) {
    alerts.push({
      type:    'overdue_followup',
      count:   overdueReminders.length,
      message: `${overdueReminders.length} follow-up reminder${overdueReminders.length > 1 ? 's' : ''} overdue`,
    });
  }

  return { stats, distribution, conditions, monthlyTrend, recentActivities, todaySchedule, alerts };
}

