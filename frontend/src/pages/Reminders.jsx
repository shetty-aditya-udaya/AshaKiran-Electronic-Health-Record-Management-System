import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config';
import { getAllReminders, getRemindersForDate, bulkUpsertReminders, getPatientByIdOrLocalId } from '../lib/db';
import { useConnection } from '../context/ConnectionContext';
import BrandLogo from '../components/BrandLogo';
import { useDeleteVisit } from '../hooks/useDeleteVisit';
import DeleteVisitModal from '../components/DeleteVisitModal';

// ─── urgency classification ───────────────────────────────────────────────────

function urgencyOf(r) {
  if (r.status === 'COMPLETED') return 'done';
  
  const sev = (r.severity || '').toLowerCase();
  
  // 1. Post-assessment clinical severity (explicitly marked by health worker)
  if (sev === 'critical' || sev === 'emergency') return 'critical';
  if (sev === 'severe') return 'severe';
  if (sev === 'moderate') return 'moderate';
  if (sev === 'mild' || sev === 'stable') return 'mild';
  
  // 2. Pre-assessment scheduled visits
  const isOverdue = r.date && new Date(r.date) < new Date();
  if (isOverdue) return 'overdue';
  
  return 'pending';
}

// border colour + badge style per urgency
const URGENCY_STYLE = {
  critical: {
    border:     'border-red-500',
    radioColor: 'text-red-500 opacity-60',
    badge:      'bg-red-50 text-red-800 border border-red-200',
    label:      'Critical Emergency',
    btnClass:   'bg-gradient-to-br from-red-600 to-red-800 text-white shadow-md hover:shadow-red-500/20 hover:opacity-95',
  },
  severe: {
    border:     'border-orange-500',
    radioColor: 'text-orange-500 opacity-60',
    badge:      'bg-orange-50 text-orange-800 border border-orange-200',
    label:      'Severe Alert',
    btnClass:   'bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-md hover:shadow-orange-500/20 hover:opacity-95',
  },
  moderate: {
    border:     'border-amber-400',
    radioColor: 'text-amber-500 opacity-60',
    badge:      'bg-amber-50 text-amber-800 border border-amber-200',
    label:      'Moderate Alert',
    btnClass:   'bg-surface-container-high text-primary hover:bg-primary-container border border-outline-variant/10',
  },
  mild: {
    border:     'border-emerald-400',
    radioColor: 'text-emerald-500 opacity-60',
    badge:      'bg-emerald-50 text-emerald-800 border border-emerald-200',
    label:      'Stable',
    btnClass:   'bg-surface-container-high text-primary hover:bg-primary-container border border-outline-variant/10',
  },
  overdue: {
    border:     'border-slate-300',
    radioColor: 'text-slate-400 opacity-60',
    badge:      'bg-slate-100 text-slate-700 border border-slate-200',
    label:      'Overdue Awaiting Visit',
    btnClass:   'bg-gradient-to-br from-primary to-primary-dim text-on-primary shadow-lg hover:shadow-primary/20',
  },
  pending: {
    border:     'border-slate-200',
    radioColor: 'text-slate-300 opacity-60',
    badge:      'bg-slate-50 text-slate-600 border border-slate-100',
    label:      'Awaiting Visit',
    btnClass:   'bg-surface-container-high text-primary hover:bg-primary-container border border-outline-variant/10',
  },
};

// visit-type → material symbol
function typeIcon(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('anc') || t.includes('maternal')) return 'medical_services';
  if (t.includes('vacc') || t.includes('immun'))   return 'child_care';
  if (t.includes('hyper') || t.includes('bp'))     return 'vital_signs';
  if (t.includes('ncd') || t.includes('chronic'))  return 'monitor_heart';
  if (t.includes('follow'))                         return 'event_repeat';
  return 'stethoscope';
}

function fmtTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return ''; }
}

function fmtDateLabel(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const isOverdue = d < now && d.toDateString() !== now.toDateString();
    const label = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return isOverdue ? `${label} (Overdue)` : label;
  } catch { return ''; }
}

function isOverdue(iso) {
  return iso && new Date(iso) < new Date();
}

// ─── PendingCard ─────────────────────────────────────────────────────────────

function PendingCard({ r, navigate, onDeleteRequest }) {
  const urgency = urgencyOf(r);
  const sty     = URGENCY_STYLE[urgency] || URGENCY_STYLE.pending;
  const timeLabel = fmtDateLabel(r.date);
  const overdue   = isOverdue(r.date);

  return (
    <div
      className={`bg-surface-container-lowest rounded-lg p-6 shadow-sm border-l-8 ${sty.border} flex flex-col md:flex-row items-center gap-6 group hover:shadow-md transition-shadow`}
    >
      {/* Radio icon */}
      <div className="flex-shrink-0">
        <span className={`material-symbols-outlined text-4xl ${sty.radioColor}`}>
          radio_button_unchecked
        </span>
      </div>

      {/* Content */}
      <div className="flex-grow space-y-1 min-w-0 w-full">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xl font-headline font-bold text-on-surface">{r.patient}</h3>
          <span className={`px-3 py-1 text-[10px] font-body font-bold uppercase tracking-wider rounded-full ${sty.badge}`}>
            {sty.label}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-on-surface-variant text-sm font-body">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-base">{typeIcon(r.type)}</span>
            {r.type || 'General Visit'}
          </span>
          <span className={`flex items-center gap-1 font-semibold ${overdue ? 'text-error' : 'text-primary'}`}>
            <span className="material-symbols-outlined text-base">schedule</span>
            {timeLabel}
          </span>
        </div>
      </div>

      {/* Action */}
      <div className="flex-shrink-0 w-full md:w-auto flex items-center gap-2">
        <button
          onClick={() => navigate(`/visits/${r.local_id || r.id}/complete`)}
          className={`flex-1 md:flex-initial px-8 py-3 rounded-full font-body font-bold transition-all active:scale-95 ${sty.btnClass}`}
        >
          Start Visit
        </button>
        {onDeleteRequest && (
          <button
            onClick={() => onDeleteRequest({ ...r, visit_date: r.date, visit_type: r.type, patient_name: r.patient })}
            aria-label="Delete visit"
            title="Delete this visit"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-100 transition-all active:scale-90"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
          </button>
        )}
      </div>

    </div>
  );
}

// ─── CompletedCard ───────────────────────────────────────────────────────────

function CompletedCard({ r, navigate, onDeleteRequest }) {
  return (
    <div
      className="bg-surface-container-low/50 rounded-lg p-4 flex items-center gap-4 opacity-70 cursor-pointer hover:opacity-100 transition-opacity"
    >
      <div
        onClick={() => navigate(`/reports/${r.patient_id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && navigate(`/reports/${r.patient_id}`)}
        className="flex items-center gap-4 flex-1 min-w-0"
      >
        <div className="bg-primary/20 p-2 rounded-full flex-shrink-0">
          <span
            className="material-symbols-outlined text-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body font-bold text-on-surface leading-tight truncate">{r.patient}</p>
          <p className="text-xs text-on-surface-variant font-body">
            {r.type || 'General Visit'} • {fmtTime(r.date)}
          </p>
        </div>
        <span className="material-symbols-outlined text-outline flex-shrink-0">chevron_right</span>
      </div>
      {onDeleteRequest && (
        <button
          onClick={() => onDeleteRequest({ ...r, visit_date: r.date, visit_type: r.type, patient_name: r.patient })}
          aria-label="Delete visit"
          title="Delete this visit"
          className="w-8 h-8 flex items-center justify-center rounded-full text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-90 flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
        </button>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Reminders({ t }) {
  const navigate = useNavigate();
  const { isServerReachable } = useConnection();

  const [reminders, setReminders]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [showAll, setShowAll]       = useState(false);
  const [activeTab, setActiveTab]   = useState('pending');

  const { deleteTarget, isDeleting, requestDelete, cancelDelete, confirmDelete } =
    useDeleteVisit({ onDeleted: () => fetchReminders() });

  // ── fetch ───────────────────────────────────────────────────────────────────
  const fetchReminders = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Always load from local IndexedDB first for instant UI response
      let localData = [];
      if (showAll) {
        localData = await getAllReminders();
      } else {
        localData = await getRemindersForDate(targetDate);
      }
      
      // Map localData to have consistent patient names
      const mappedLocal = [];
      for (const r of localData) {
        let patientName = r.patient;
        if (!patientName) {
          const patient = await getPatientByIdOrLocalId(r.patient_id || r.patientId);
          patientName = patient ? patient.name : 'Unknown Patient';
        }
        mappedLocal.push({
          ...r,
          id: r.id || r.local_id, // ensure ID is set for routing/key
          patient: patientName,
        });
      }

      // Sort: overdue PENDING first, then pending, then completed
      mappedLocal.sort((a, b) => {
        const aPending = a.status !== 'COMPLETED';
        const bPending = b.status !== 'COMPLETED';
        if (aPending && !bPending) return -1;
        if (!aPending && bPending) return 1;
        return new Date(a.date) - new Date(b.date);
      });

      setReminders(mappedLocal);
      setLoading(false); // Stop loading skeleton since we have cached data

      // 2. If online, fetch from backend in the background to update the local db
      if (isServerReachable) {
        const token = localStorage.getItem('token');
        const url   = showAll
          ? `${API_BASE_URL}/api/reminders/all`
          : `${API_BASE_URL}/api/reminders?date=${targetDate}`;
        
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        
        if (res.ok) {
          const data = await res.json();
          const serverReminders = Array.isArray(data) ? data : [];
          
          // Bulk-upsert into local IndexedDB
          await bulkUpsertReminders(serverReminders);
          
          // Load from IndexedDB again to show the most up-to-date synced data
          let freshLocal = [];
          if (showAll) {
            freshLocal = await getAllReminders();
          } else {
            freshLocal = await getRemindersForDate(targetDate);
          }
          
          const freshMapped = [];
          for (const r of freshLocal) {
            let patientName = r.patient;
            if (!patientName) {
              const patient = await getPatientByIdOrLocalId(r.patient_id || r.patientId);
              patientName = patient ? patient.name : 'Unknown Patient';
            }
            freshMapped.push({
              ...r,
              id: r.id || r.local_id,
              patient: patientName,
            });
          }
          
          freshMapped.sort((a, b) => {
            const aPending = a.status !== 'COMPLETED';
            const bPending = b.status !== 'COMPLETED';
            if (aPending && !bPending) return -1;
            if (!aPending && bPending) return 1;
            return new Date(a.date) - new Date(b.date);
          });
          
          setReminders(freshMapped);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch reminders online/offline", err);
    } finally {
      setLoading(false);
    }
  }, [targetDate, showAll, isServerReachable]);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);

  // re-fetch when tab regains focus or when local database writes occur
  useEffect(() => {
    const handleUpdate = () => fetchReminders();
    window.addEventListener('focus',               handleUpdate);
    window.addEventListener('local-data-written',  handleUpdate);
    window.addEventListener('visit-added',         handleUpdate);
    window.addEventListener('visit-completed',     handleUpdate);
    window.addEventListener('visit-deleted',       handleUpdate);
    return () => {
      window.removeEventListener('focus',               handleUpdate);
      window.removeEventListener('local-data-written',  handleUpdate);
      window.removeEventListener('visit-added',         handleUpdate);
      window.removeEventListener('visit-completed',     handleUpdate);
      window.removeEventListener('visit-deleted',       handleUpdate);
    };
  }, [fetchReminders]);

  // ── derived ─────────────────────────────────────────────────────────────────
  const pending   = reminders.filter((r) => r.status !== 'COMPLETED');
  const completed = reminders.filter((r) => r.status === 'COMPLETED');

  const displayDate = new Date(targetDate).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-screen-xl mx-auto px-6 pt-10 pb-28 font-body">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="mb-10">
        <h1 className="text-5xl font-headline font-bold tracking-tight text-on-surface mb-2">
          Reminders
        </h1>
        <p className="text-on-surface-variant text-lg font-light">
          Prioritized by urgency and timing
        </p>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="bg-surface-container-low p-4 rounded-xl mb-8 flex flex-wrap md:flex-nowrap items-center gap-4 shadow-sm">

        {/* Date picker */}
        <label
          htmlFor="reminder-date"
          className="flex items-center bg-surface-container-lowest px-4 py-2 rounded-full grow md:grow-0 gap-3 border border-outline-variant/10 cursor-pointer"
        >
          <span className="material-symbols-outlined text-primary">calendar_month</span>
          <input
            id="reminder-date"
            type="date"
            value={targetDate}
            onChange={(e) => { setTargetDate(e.target.value); setShowAll(false); }}
            className="bg-transparent border-none text-sm font-body font-medium text-on-surface outline-none cursor-pointer"
          />
        </label>

        {/* All visits toggle */}
        <button
          onClick={() => setShowAll((v) => !v)}
          className={`flex items-center bg-surface-container-lowest px-4 py-2 rounded-full grow md:grow-0 gap-3 border transition-all ${
            showAll
              ? 'border-primary bg-primary-container/20 text-primary'
              : 'border-outline-variant/10 text-on-surface-variant hover:border-primary/30'
          }`}
        >
          <span className="material-symbols-outlined text-primary">priority_high</span>
          <span className="font-medium text-sm">{showAll ? 'All Visits' : 'By Date'}</span>
          <span className="material-symbols-outlined text-outline">expand_more</span>
        </button>

        {/* Refresh */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={fetchReminders}
            aria-label="Refresh reminders"
            className="bg-primary-container text-on-primary-container p-3 rounded-full flex items-center justify-center transition-transform active:scale-95 shadow-sm hover:opacity-90"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              notifications_active
            </span>
          </button>
        </div>
      </div>

      {/* ── Segmented tabs ─────────────────────────────────────────────────── */}
      <div className="flex gap-4 mb-10 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-3 px-6 py-3 rounded-full border transition-all whitespace-nowrap ${
            activeTab === 'pending'
              ? 'bg-tertiary-container/50 border-primary-container/20 font-bold text-on-surface'
              : 'bg-surface-container-high border-transparent hover:bg-surface-container-highest font-medium text-on-surface-variant'
          }`}
        >
          <span className={`w-3 h-3 rounded-full ring-4 ${loading ? 'bg-outline-variant ring-outline-variant/10' : 'bg-primary ring-primary/10'}`} />
          {loading ? '…' : pending.length} Pending
        </button>
        <button
          onClick={() => setActiveTab('done')}
          className={`flex items-center gap-3 px-6 py-3 rounded-full border transition-all whitespace-nowrap ${
            activeTab === 'done'
              ? 'bg-tertiary-container/50 border-primary-container/20 font-bold text-on-surface'
              : 'bg-surface-container-high border-transparent hover:bg-surface-container-highest font-medium text-on-surface-variant'
          }`}
        >
          <span className="w-3 h-3 rounded-full bg-primary ring-4 ring-primary/10" />
          {loading ? '…' : completed.length} Completed
        </button>
      </div>

      {/* ── Loading skeletons ───────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-surface-container rounded-lg animate-pulse border-l-8 border-outline-variant/30" />
          ))}
        </div>
      )}

      {/* ── Pending tab ────────────────────────────────────────────────────── */}
      {!loading && activeTab === 'pending' && (
        <>
          {pending.length === 0 ? (
            /* All caught up */
            <div className="mt-12 flex flex-col items-center justify-center text-center p-12 bg-surface-container-lowest rounded-xl border border-dashed border-outline-variant">
              <div className="bg-teal-50/50 w-24 h-24 rounded-full flex items-center justify-center mb-6 border border-teal-100/50 shadow-inner">
                <BrandLogo compact={true} size="md" className="opacity-75 select-none pointer-events-none animate-bounce" />
              </div>
              <h3 className="text-2xl font-headline font-bold text-on-surface mb-2">All Caught Up!</h3>
              <p className="text-on-surface-variant max-w-md mx-auto font-body">
                {showAll
                  ? 'No visits have been scheduled yet.'
                  : `No pending visits for ${displayDate}. Take a moment to review your records.`}
              </p>
              <button
                onClick={() => setShowAll(true)}
                className="mt-8 px-6 py-2 bg-secondary text-on-secondary rounded-full font-body font-medium"
              >
                View All Visits
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {pending.map((r) => (
                <PendingCard key={r.id} r={r} navigate={navigate} onDeleteRequest={requestDelete} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Completed tab ───────────────────────────────────────────────────── */}
      {!loading && activeTab === 'done' && (
        <>
          {/* Section heading */}
          <div className="flex items-center gap-4 mb-8">
            <h2 className="text-2xl font-headline font-bold text-on-surface/50 whitespace-nowrap">
              Completed {showAll ? '' : 'Today'}
            </h2>
            <div className="h-px flex-grow bg-outline-variant/30" />
          </div>

          {completed.length === 0 ? (
            <div className="mt-4 flex flex-col items-center justify-center text-center p-12 bg-surface-container-lowest rounded-xl border border-dashed border-outline-variant">
              <div className="bg-teal-50/50 w-24 h-24 rounded-full flex items-center justify-center mb-6 border border-teal-100/50 shadow-inner">
                <BrandLogo compact={true} size="md" className="opacity-40 select-none pointer-events-none" />
              </div>
              <h3 className="text-2xl font-headline font-bold text-on-surface mb-2">No Completed Visits</h3>
              <p className="text-on-surface-variant max-w-md mx-auto font-body">
                Complete pending visits and they will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completed.map((r) => (
                <CompletedCard key={r.id} r={r} navigate={navigate} onDeleteRequest={requestDelete} />
              ))}
            </div>
          )}
        </>
      )}
      
      {/* Delete visit modal */}
      {deleteTarget && (
        <DeleteVisitModal
          visit={deleteTarget}
          loading={isDeleting}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </div>
  );
}
