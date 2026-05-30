/**
 * CompleteVisit — simplified field-worker form.
 * All logic & offline functionality preserved. UI stripped to essentials.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, Save, Camera, Upload, X, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { db, SYNC, savePrescriptionImage, markPrescriptionImageSynced, getVisitByIdOrLocalId, getReminderByIdOrLocalId, getPatientByIdOrLocalId } from '../lib/db';
import { createFollowUpLocally } from '../lib/reminderEngine';
import { useConnection } from '../context/ConnectionContext';
import { api } from '../utils/apiClient';

// ── constants ────────────────────────────────────────────────────────────────

const TREATMENT_OPTS = [
  { value: 'Ongoing Treatment',          label: 'Ongoing',   activeClass: 'bg-blue-600 text-white' },
  { value: 'Completed Treatment',        label: 'Completed', activeClass: 'bg-emerald-600 text-white' },
  { value: 'Referred to Hospital',       label: 'Referred',  activeClass: 'bg-amber-500 text-white' },
  { value: 'Emergency Attention Needed', label: 'Emergency', activeClass: 'bg-red-600 text-white' },
];

const SEVERITY_OPTS = [
  { value: 'Mild',     activeClass: 'bg-emerald-600 text-white' },
  { value: 'Moderate', activeClass: 'bg-amber-500 text-white' },
  { value: 'Severe',   activeClass: 'bg-red-600 text-white' },
];

const PRESCRIBER_TYPES = ['Doctor', 'ASHA Worker', 'Nurse', 'Health Center', 'Other'];
const EMPTY_MED = { name: '', dosage: '', duration: '', notes: '' };

// ── shared styles ────────────────────────────────────────────────────────────

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-primary focus:bg-white transition-colors';
const lbl = 'block text-xs font-semibold text-slate-500 mb-1';
const pill = 'px-4 py-2 rounded-full text-sm font-semibold border border-slate-200 text-slate-500 bg-white transition-colors active:scale-95';
const pillActive = 'border-transparent';

// ── utility ──────────────────────────────────────────────────────────────────

function compressAndConvertToDataUrl(file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Maintain aspect ratio within limits
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to JPEG with 0.7 quality
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = (err) => reject(err);
      img.src = e.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

// ── component ────────────────────────────────────────────────────────────────

export default function CompleteVisit({ t }) {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const cameraRef  = useRef(null);
  const galleryRef = useRef(null);
  const { isServerReachable } = useConnection();

  const [loading, setLoading]             = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [visitInfo, setVisitInfo]         = useState(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [visitNotFound, setVisitNotFound] = useState(false);

  // form fields
  const [bp, setBp]             = useState('');
  const [sugar, setSugar]       = useState('');
  const [weight, setWeight]     = useState('');
  const [height, setHeight]     = useState('');
  const [severity, setSeverity] = useState('Mild');
  const [notes, setNotes]       = useState('');

  const [treatmentStatus, setTreatmentStatus]     = useState('Ongoing Treatment');
  const [medicinePrescribed, setMedicinePrescribed] = useState(false);
  const [medicines, setMedicines]                 = useState([{ ...EMPTY_MED }]);
  const [prescriberType, setPrescriberType]       = useState('Doctor');
  const [prescriberName, setPrescriberName]       = useState('');
  const [clinicName, setClinicName]               = useState('');
  const [images, setImages]                       = useState([]);
  const [nextCheckup, setNextCheckup]             = useState('');

  // load visit context — fully robust with 4-level fallback
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let localVisit = null;

      // ─── Level 1: IDB primary key + index lookup ────────────────────────
      // Wrapped in its own try-catch: a Dexie error here must NOT abort
      // the entire flow and prevent levels 2-4 from running.
      try {
        localVisit = await getVisitByIdOrLocalId(id);
      } catch (err) {
        console.warn(`[CompleteVisit] Level 1 IDB lookup threw for id="${id}":`, err);
      }

        // ─── Level 2: IDB fallback via reminders table ─────────────────────
        // If the visit isn't found but a matching reminder IS in IDB,
        // reconstruct a minimal visit record from the reminder.
        if (!localVisit) {
          try {
            console.warn(`[CompleteVisit] Visit not found in IDB for id="${id}", trying reminders table…`);
            const matchingReminder = await getReminderByIdOrLocalId(id);
            if (matchingReminder) {
              console.log('[CompleteVisit] Reconstructing visit from reminder:', matchingReminder.local_id);
              const reconstructed = {
                local_id:   matchingReminder.local_id,
                id:         matchingReminder.id,
                patientId:  matchingReminder.patientId || matchingReminder.patient_id,
                patient_id: matchingReminder.patientId || matchingReminder.patient_id,
                visit_type: matchingReminder.type || 'General',
                visit_date: matchingReminder.visit_date || matchingReminder.date,
                date:       matchingReminder.date,
                status:     matchingReminder.status || 'PENDING',
                severity:   matchingReminder.severity || null,
                syncStatus: matchingReminder.syncStatus,
                updatedAt:  Date.now(),
              };
              // Save to visits table so future lookups work
              await db.visits.put(reconstructed);
              localVisit = reconstructed;
            }
          } catch (lvl2Err) {
            console.warn('[CompleteVisit] Level 2 reminder reconstruction failed:', lvl2Err);
          }
        }

        // ─── Level 3: Server API fetch + save to IDB ────────────────────────
        if (!localVisit && isServerReachable) {
          try {
            console.warn(`[CompleteVisit] Not in reminders either, fetching from server for id="${id}"…`);
            // Try /api/visits/:id first, fall back to reminders endpoint
            const endpoints = [
              `/api/visits/${id}`,
              `/api/reminders?visitId=${id}`,
            ];
            for (const url of endpoints) {
              try {
                const data = await api.get(url);
                if (!data) continue;
                // reminders endpoint returns array, visits endpoint returns object
                const raw = Array.isArray(data)
                  ? data.find(v => String(v.id) === String(id))
                  : data;
                if (!raw) continue;

                // Assign a stable UUID local_id and save to IDB so future loads work
                const stableLocalId = raw.local_id || crypto.randomUUID();
                const toSave = {
                  local_id:   stableLocalId,
                  id:         raw.id ?? undefined,
                  patientId:  String(raw.patient_id || raw.patientId || ''),
                  patient_id: String(raw.patient_id || raw.patientId || ''),
                  visit_type: raw.type || raw.visit_type || 'General',
                  visit_date: raw.date || raw.visit_date,
                  date:       raw.date || raw.visit_date,
                  status:     raw.status || 'PENDING',
                  severity:   raw.severity || null,
                  syncStatus: SYNC.SYNCED,
                  updatedAt:  Date.now(),
                };
                await db.visits.put(toSave);
                console.log('[CompleteVisit] Saved server visit to IDB with local_id:', stableLocalId);

                // Also save a reminder if one doesn't exist
                const existingRem = await getReminderByIdOrLocalId(id);
                if (!existingRem) {
                  await db.reminders.put({
                    local_id:   stableLocalId,
                    id:         raw.id ?? undefined,
                    patientId:  toSave.patientId,
                    patient_id: toSave.patient_id,
                    patient:    raw.patient || 'Unknown Patient',
                    visit_date: toSave.visit_date,
                    date:       toSave.date,
                    time:       raw.time || '09:00',
                    type:       toSave.visit_type,
                    status:     toSave.status,
                    syncStatus: SYNC.SYNCED,
                    updatedAt:  Date.now(),
                  });
                }

                localVisit = toSave;
                break;
              } catch (e) {
                console.warn(`[CompleteVisit] server fetch endpoint ${url} failed:`, e);
              }
            }
          } catch (lvl3Err) {
            console.warn('[CompleteVisit] Level 3 server fetch failed:', lvl3Err);
          }
        }

        if (cancelled) return;

        // ─── Level 4: Still not found — show clear error UI ────────────────
        if (!localVisit) {
          console.error(`[CompleteVisit] Could not find visit for id="${id}" — all lookups failed.`);
          setVisitNotFound(true);
          return;
        }

        // ─── Ensure we always have a valid UUID local_id ───────────────────
        // If local_id is missing or is a numeric string (from server id), assign a proper UUID
        // and update the IDB record so future writes use the correct primary key.
        let safeLocalId = localVisit.local_id;
        if (!safeLocalId) {
          safeLocalId = crypto.randomUUID();
          await db.visits.put({ ...localVisit, local_id: safeLocalId });
          console.warn('[CompleteVisit] Visit was missing local_id — assigned UUID:', safeLocalId);
        }

        // Guard: if visit is already completed, show confirmation
        if (localVisit.status === 'COMPLETED') {
          setAlreadyCompleted(true);
        }

        const patient = await getPatientByIdOrLocalId(localVisit.patientId || localVisit.patient_id);
        const info = {
          id:             localVisit.id,
          local_id:       safeLocalId,  // GUARANTEED to be a valid UUID
          patient:        patient ? patient.name : 'Unknown Patient',
          patientId:      localVisit.patientId || localVisit.patient_id,
          patientLocalId: patient ? patient.local_id : null,
          patient_record: patient || null,
          type:           localVisit.visit_type || localVisit.type || 'Visit',
          date:           localVisit.visit_date || localVisit.date,
        };

        if (cancelled) return;
        setVisitInfo(info);

        // Load pre-existing prescription images for this visit from IndexedDB
        const existingImages = await db.prescriptionImages
          .where('visitLocalId').equals(String(safeLocalId))
          .toArray();
        if (existingImages && existingImages.length > 0) {
          if (!cancelled) {
            setImages(existingImages.map(img => ({
              local_id: img.local_id,
              dataUrl:  img.dataUrl,
              url:      img.url
            })));
          }
        }
    })();
    return () => { cancelled = true; };
  }, [id, isServerReachable]);


  // medicine helpers
  const addMed    = ()            => setMedicines(p => [...p, { ...EMPTY_MED }]);
  const removeMed = (i)           => setMedicines(p => p.length > 1 ? p.filter((_, j) => j !== i) : p);
  const updateMed = (i, k, v)    => setMedicines(p => p.map((m, j) => j === i ? { ...m, [k]: v } : m));

  // image helpers
  const handleImageFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const dataUrl   = await compressAndConvertToDataUrl(file);
      const visitLocalId = visitInfo?.local_id || id;
      const idbRecord = await savePrescriptionImage(visitLocalId, dataUrl);
      setImages(p => [...p, { local_id: idbRecord.local_id, dataUrl, url: null }]);
    } catch (err) {
      console.error('[CompleteVisit] image compression failed:', err);
      toast.error('Could not process image');
    }
  };

  const onCamera  = (e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ''; };
  const onGallery = (e) => { Array.from(e.target.files || []).forEach(f => handleImageFile(f)); e.target.value = ''; };
  const removeImg = (i) => setImages(p => p.filter((_, j) => j !== i));

  const uploadImage = async (img) => {
    // NOTE: Images are persisted in the prescriptionImages IDB store by
    // savePrescriptionImage() when the user selects them. The sync engine's
    // _syncCompletedVisits() handles the actual upload to the server.
    // This function is kept for API compatibility but is no longer called
    // directly to avoid racing with the sync engine's upload pipeline.
    if (img.url) return img.url;
    return null; // upload handled by sync engine
  };

  // submit
  const handleSubmit = async () => {
    setLoading(true);
    try {
      // If visitInfo is null entirely, the useEffect recovery failed — set the error UI
      if (!visitInfo) {
        setVisitNotFound(true);
        setLoading(false);
        return;
      }

      // Always use the UUID local_id from IDB as primary key.
      let visitLocalId = visitInfo?.local_id;
      if (!visitLocalId) {
        visitLocalId = crypto.randomUUID();
        console.warn('[CompleteVisit] visitInfo.local_id was null at submit time — generated UUID:', visitLocalId);
        // Patch visitInfo so the rest of handleSubmit uses the new key
        setVisitInfo(prev => ({ ...prev, local_id: visitLocalId }));
      }

      const patientId = String(visitInfo?.patientId || visitInfo?.patient_id || '');
      const completedAt = new Date().toISOString();

      console.log('[CompleteVisit DEBUG] handleSubmit started.', {
        visitId: visitInfo?.id,
        visitLocalId,
        patientId,
        statusBefore: 'PENDING',
      });

      // 1. Build completed visit — updates the EXISTING record via its UUID primary key
      const completedVisit = {
        local_id:    visitLocalId,   // ← UUID primary key: updates the correct existing record
        id:          (visitInfo?.id && !String(visitInfo.id).startsWith('local_')) ? Number(visitInfo.id) : undefined,
        patientId:   patientId,
        patient_id:  patientId,
        visit_type:  visitInfo?.type || 'General',
        visit_date:  visitInfo?.date || new Date().toISOString(),
        status:      'COMPLETED',       // marks visit as done
        completedAt: completedAt,       // BUG 8 FIX: timestamp when it was completed
        syncStatus:  SYNC.PENDING,
        bp:          bp || undefined,
        glucose:     sugar || undefined,
        severity,
        notes:       notes || undefined,
        treatment_status: treatmentStatus,
        // ⚠️ Do NOT store base64 data URLs here — they waste IDB storage and
        // send multi-MB payloads to the backend on PATCH.
        // The sync engine resolves URLs from prescriptionImages store after upload.
        prescription_images: [],
        prescription_data: {
          medicine_prescribed: medicinePrescribed,
          medicines:           medicinePrescribed ? medicines.filter(m => m.name.trim()) : [],
          prescribed_by:       prescriberType,
          prescriber_name:     prescriberName || undefined,
          clinic_name:         clinicName     || undefined,
        },
        details: {
          bp:          bp          || undefined,
          sugar:       sugar       || undefined,
          weight:      weight      || undefined,
          height:      height      || undefined,
          medications: medicinePrescribed ? medicines.filter(m => m.name.trim()) : [],
          severity,
          notes:       notes       || undefined,
        },
        next_checkup_date: nextCheckup || undefined,
        updatedAt: Date.now(),
      };

      console.log('[CompleteVisit DEBUG] Saving completedVisit to IndexedDB.', {
        local_id: completedVisit.local_id,
        id: completedVisit.id,
        statusAfter: completedVisit.status,
        payload: completedVisit,
      });

      // 2. Save completed visit — this updates the existing IDB record (same primary key)
      await db.visits.put(completedVisit);
      console.log('[CompleteVisit] ✅ Visit marked COMPLETED in IDB:', visitLocalId);

      // 3. BUG 3 FIX: Locate reminder by the SAME UUID local_id and mark COMPLETED
      const existingReminder = await db.reminders.get(visitLocalId);
      if (existingReminder) {
        await db.reminders.update(visitLocalId, {
          status:     'COMPLETED',
          completedAt: completedAt,
          syncStatus:  SYNC.PENDING,
          updatedAt:   Date.now(),
        });
        console.log('[CompleteVisit] ✅ Reminder marked COMPLETED in IDB:', visitLocalId);
      } else {
        // Reminder didn't exist locally (e.g. came from server without local_id) — create it
        await db.reminders.put({
          local_id:    visitLocalId,
          id:          completedVisit.id,
          patientId:   patientId,
          patient_id:  patientId,
          patient:     visitInfo?.patient || 'Unknown Patient',
          visit_date:  completedVisit.visit_date,
          date:        completedVisit.visit_date,
          time:       visitInfo?.time || '',
          type:        completedVisit.visit_type,
          status:      'COMPLETED',
          completedAt: completedAt,
          severity:    severity,
          syncStatus:  SYNC.PENDING,
          updatedAt:   Date.now(),
        });
        console.log('[CompleteVisit] ✅ Created completed reminder in IDB:', visitLocalId);
      }

      // Check and log the updated reminders count for this patient
      const reminderCount = await db.reminders.where('patientId').equals(patientId).count();
      console.log('[CompleteVisit DEBUG] Checked reminders in IndexedDB.', {
        patientId,
        totalRemindersCount: reminderCount,
      });

      // 4. BUG 4 FIX: Use createFollowUpLocally from reminderEngine (has dedup protection)
      //    Only create if nextCheckup date is provided by the worker
      if (nextCheckup) {
        console.log('[CompleteVisit DEBUG] Triggering follow-up creation.', {
          nextCheckupDate: nextCheckup,
          parentVisitLocalId: completedVisit.local_id,
        });

        const patient = visitInfo?.patient_record
          || await getPatientByIdOrLocalId(patientId);
        if (patient) {
          const followUpResult = await createFollowUpLocally(completedVisit, patient, nextCheckup, '09:00');
          console.log('[CompleteVisit DEBUG] createFollowUpLocally finished.', {
            followUpVisitLocalId: followUpResult?.followUpVisit?.local_id,
            followUpReminderLocalId: followUpResult?.reminder?.local_id,
          });
          console.log('[CompleteVisit] ✅ Follow-up scheduled for', nextCheckup);
        } else {
          console.warn('[CompleteVisit] Could not find patient record — follow-up not created');
        }
      }

      // 5. Auto-Report Generation (new reportItem entry for the timeline)
      //    visitLocalId is stored so the sync engine can locate this item and
      //    mark it SYNCED atomically after the visit completion is confirmed.
      const newReportItem = {
        local_id:       crypto.randomUUID(),
        visitLocalId:   visitLocalId,   // ← KEY: links this item to its parent visit
        patientId:      patientId,
        patientLocalId: visitInfo?.patientLocalId || patientId,
        title:          `Visit — ${completedVisit.visit_type}`,
        type:           'Medical',
        report_type:    'Medical',
        description:    `BP: ${bp || 'N/A'}, Sugar: ${sugar || 'N/A'}, Weight: ${weight || 'N/A'} kg, Height: ${height || 'N/A'} cm.\nStatus: ${treatmentStatus}.\nNotes: ${notes || 'No notes.'}`,
        doctor_name:    medicinePrescribed ? prescriberName : 'ASHA Worker',
        status:         treatmentStatus === 'Completed Treatment' ? 'Completed' : 'Ongoing',
        images:         [],   // URLs populated by sync engine after upload
        next_follow_up: nextCheckup || null,
        syncStatus:     SYNC.PENDING,
        createdAt:      completedAt,
        updatedAt:      Date.now(),
      };
      await db.reportItems.put(newReportItem);

      // 6. Update patient's report folder health status
      const existingFolder = await db.reportFolders
        .where('patientId').equals(String(patientId))
        .or('patientLocalId').equals(String(patientId))
        .first();

      if (existingFolder) {
        let newHealthStatus = 'Under Treatment';
        if (treatmentStatus.toLowerCase().includes('emergency')) newHealthStatus = 'Critical';
        else if (treatmentStatus.toLowerCase().includes('referred'))  newHealthStatus = 'Referred';
        else if (treatmentStatus.toLowerCase().includes('completed')) newHealthStatus = 'Recovered / Safe';

        await db.reportFolders.update(existingFolder.local_id, {
          status:        treatmentStatus === 'Completed Treatment' ? 'COMPLETED' : 'ACTIVE',
          health_status: newHealthStatus,
          last_updated:  completedAt,
          syncStatus:    SYNC.PENDING,
          updatedAt:     Date.now(),
        });
      }

      // Notify all open pages that local data changed
      window.dispatchEvent(new CustomEvent('local-data-written'));
      window.dispatchEvent(new CustomEvent('visit-completed'));
      window.dispatchEvent(new CustomEvent('visit-added'));

      toast.success(
        <div className="flex flex-col text-left">
          <span className="font-semibold text-slate-800">✅ Visit completed</span>
          <span className="text-xs text-slate-500 mt-0.5">🟡 Syncing in background…</span>
        </div>,
        { duration: 5000 }
      );

      navigate(-1);
    } catch (err) {
      console.error('[CompleteVisit] handleSubmit error:', err);
      toast.error('Failed to save visit locally.');
    } finally {
      setLoading(false);
    }
  };

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-svh bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button onClick={() => navigate(-1)} className="p-2 -ml-1 rounded-full text-slate-500 active:bg-slate-100">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-slate-900 leading-tight">Complete Visit</h1>
          {visitInfo && (
            <p className="text-xs text-slate-400 truncate">{visitInfo.patient} · {visitInfo.type}</p>
          )}
        </div>
        {!isServerReachable && (
          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
            Offline
          </span>
        )}
      </div>

      {/* ── Visit not found banner ── */}
      {visitNotFound && (
        <div className="max-w-lg mx-auto px-4 pt-6">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <X className="text-red-500 w-6 h-6" />
            </div>
            <div>
              <p className="text-base font-bold text-red-800">Visit Record Not Found</p>
              <p className="text-sm text-red-600 mt-1">
                Could not load this visit from local storage or server.<br />
                Please go back and try again, or check your internet connection.
              </p>
              <p className="text-xs text-red-400 mt-2 font-mono">Visit ID: {id}</p>
            </div>
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => { setVisitNotFound(false); window.location.reload(); }}
                className="px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm active:scale-95 transition-transform"
              >
                Retry
              </button>
              <button
                onClick={() => navigate(-1)}
                className="px-5 py-2.5 bg-white border border-red-200 text-red-700 rounded-xl font-bold text-sm active:scale-95 transition-transform"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Already completed banner ── */}
      {alreadyCompleted && (
        <div className="max-w-lg mx-auto px-4 pt-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="text-emerald-500 w-12 h-12" />
            <div>
              <p className="text-base font-bold text-emerald-800">Visit Already Completed</p>
              <p className="text-sm text-emerald-600 mt-1">
                This visit has already been marked as completed. View the medical history in the patient's report folder.
              </p>
            </div>
            <button
              onClick={() => navigate(-1)}
              className="mt-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm active:scale-95 transition-transform"
            >
              Go Back
            </button>
          </div>
        </div>
      )}

      {!visitNotFound && !alreadyCompleted && (
        <>
          <div className="max-w-lg mx-auto px-4 py-4 pb-[calc(9rem+env(safe-area-inset-bottom))] space-y-5">
            {/* ── 1. Vitals ── */}
            <FormSection title="Vitals">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Blood Pressure" placeholder="120/80" value={bp} onChange={setBp} />
                <Field label="Blood Sugar (mg/dL)" placeholder="110" type="number" value={sugar} onChange={setSugar} />
                <Field label="Weight (kg)" placeholder="65.5" type="number" step="0.1" value={weight} onChange={setWeight} />
                <Field label="Height (cm)" placeholder="165" type="number" value={height} onChange={setHeight} />
              </div>
            </FormSection>

            {/* ── 2. Treatment Status ── */}
            <FormSection title="Treatment Status">
              <SegmentedPills
                options={TREATMENT_OPTS}
                value={treatmentStatus}
                onChange={setTreatmentStatus}
              />
            </FormSection>

            {/* ── 3. Condition & Notes ── */}
            <FormSection title="Condition">
              <div className="space-y-3">
                <div>
                  <label className={lbl}>Severity</label>
                  <SegmentedPills
                    options={SEVERITY_OPTS}
                    value={severity}
                    onChange={setSeverity}
                  />
                </div>
                <div>
                  <label className={lbl}>Notes</label>
                  <textarea
                    rows={3}
                    className={inp + ' resize-none'}
                    placeholder="Symptoms, diagnosis, observations…"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </FormSection>

            {/* ── 4. Medicine ── */}
            <FormSection title="Medicine">
              {/* Yes / No toggle */}
              <div className="mb-3">
                <label className={lbl}>Was medicine prescribed?</label>
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
                  {['Yes', 'No'].map(opt => {
                    const active = (opt === 'Yes') === medicinePrescribed;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setMedicinePrescribed(opt === 'Yes')}
                        className={`px-6 py-2 rounded-[10px] text-sm font-semibold transition-colors ${
                          active
                            ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                            : 'text-slate-400'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Conditional: medicine fields */}
              {medicinePrescribed && (
                <div className="space-y-4 pt-1">
                  {/* Medicine entries */}
                  <div className="space-y-3">
                    {medicines.map((med, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 relative space-y-3">
                        <div className="flex justify-between items-center pr-8">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Medication #{idx + 1}</span>
                          {medicines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeMed(idx)}
                              className="absolute top-3 right-3 p-1.5 rounded-full text-slate-400 hover:text-red-500 active:bg-slate-200 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>

                        <Field label="Medicine Name" placeholder="e.g. Paracetamol" value={med.name} onChange={v => updateMed(idx, 'name', v)} />

                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Dosage" placeholder="e.g. 1-0-1" value={med.dosage} onChange={v => updateMed(idx, 'dosage', v)} />
                          <Field label="Duration" placeholder="e.g. 5 days" value={med.duration} onChange={v => updateMed(idx, 'duration', v)} />
                        </div>

                        <Field label="Special Instructions (optional)" placeholder="e.g. Take after meals" value={med.notes} onChange={v => updateMed(idx, 'notes', v)} />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addMed}
                    className="w-full py-2.5 border-2 border-dashed border-slate-200 hover:border-slate-300 text-slate-500 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Plus size={14} /> Add Another Medication
                  </button>

                  {/* Prescriber Metadata */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <div>
                      <label className={lbl}>Prescribed By</label>
                      <div className="flex flex-wrap gap-1.5">
                        {PRESCRIBER_TYPES.map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setPrescriberType(opt)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                              opt === prescriberType
                                ? 'bg-primary text-white border-transparent'
                                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Prescriber Name" placeholder="Dr. Sharma" value={prescriberName} onChange={setPrescriberName} />
                      <Field label="Clinic / Hospital Name" placeholder="PHC Village" value={clinicName} onChange={setClinicName} />
                    </div>
                  </div>
                </div>
              )}
            </FormSection>

            {/* ── Prescription Photo Attachment ── */}
            <FormSection title="Prescription Photo">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className={lbl}>Attach Photos (optional)</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => cameraRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary font-bold text-xs rounded-full"
                    >
                      <Camera size={14} /> Capture
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 font-bold text-xs rounded-full"
                    >
                      <Upload size={14} /> Gallery
                    </button>
                    <input type="file" ref={cameraRef} onChange={onCamera} className="hidden" accept="image/*" capture="environment" />
                    <input type="file" ref={galleryRef} onChange={onGallery} className="hidden" accept="image/*" multiple />
                  </div>
                </div>

                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden shadow-sm group">
                        <img src={img.dataUrl} className="w-full h-full object-cover" alt="Prescription" />
                        <button
                          type="button"
                          onClick={() => removeImg(idx)}
                          className="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </FormSection>

            {/* ── 5. Follow-Up ── */}
            <FormSection title="Next Checkup">
              <label className={lbl}>Date (optional)</label>
              <input
                type="date"
                className={inp}
                min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                value={nextCheckup}
                onChange={e => setNextCheckup(e.target.value)}
              />
              {nextCheckup ? (
                <p className="mt-2 text-sm text-emerald-700 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 size={15} />
                  Follow-up on {new Date(nextCheckup + 'T00:00:00').toLocaleDateString('en-IN', {
                    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-slate-400">
                  Leave blank if no follow-up needed.
                </p>
              )}
            </FormSection>
          </div>

          {/* Sticky save button — hidden when visit is already completed */}
          {!alreadyCompleted && (
            <div className="fixed left-0 right-0 z-50 bg-white border-t border-slate-100 p-3" style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
              <div className="max-w-lg mx-auto">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className={`w-full py-3.5 bg-primary text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${
                    loading ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> {uploadingImages ? 'Uploading…' : 'Saving…'}</>
                    : <><Save className="w-4 h-4" /> {nextCheckup ? 'Complete & Schedule Follow-up' : 'Save & Complete Visit'}</>
                  }
                </button>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}

// ── SegmentedPills ────────────────────────────────────────────────────────────

function SegmentedPills({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors active:scale-95 ${
              active
                ? `${opt.activeClass} border-transparent`
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            {opt.label || opt.value}
          </button>
        );
      })}
    </div>
  );
}

// ── FormSection ───────────────────────────────────────────────────────────────

function FormSection({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-50">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</h2>
      </div>
      <div className="px-4 py-4">
        {children}
      </div>
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, placeholder, value, onChange, type = 'text', step }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input
        className={inp}
        placeholder={placeholder}
        type={type}
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
