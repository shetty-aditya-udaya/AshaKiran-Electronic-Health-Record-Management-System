import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RefreshCw, AlertTriangle, WifiOff, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import AddPatient from './AddPatient';
import PatientCard from '../components/PatientCard';
import PatientDetailsPanel from '../components/PatientDetailsPanel';
import { usePatients } from '../hooks/usePatients';
import { SYNC } from '../lib/db';
import BrandLogo from '../components/BrandLogo';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../context/ConnectionContext';
import { manualSyncPatients } from '../lib/syncService';

const PAGE_SIZE = 9;

const CATEGORY_FILTERS = [
  { label: 'All Patients', key: 'allPatients' },
  { label: 'Critical', key: 'critical' },
  { label: 'Pregnancy', key: 'pregnancy' },
  { label: 'Chronic Care', key: 'chronicCare' }
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function matchesFilter(p, filter) {
  if (filter === 'All Patients') return true;
  if (filter === 'Critical')    return p.risk_level === 'high' || p.is_high_risk;
  if (filter === 'Pregnancy')   return (p.category || '').toLowerCase() === 'pregnancy' || p.is_pregnant;
  if (filter === 'Chronic Care') return (p.category || '').toLowerCase() === 'chronic';
  return true;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function PatientList({ onOpenAddVisit }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isServerReachable } = useConnection();

  const [lastSyncText, setLastSyncText] = useState('');
  const [manualSyncing, setManualSyncing] = useState(false);

  useEffect(() => {
    const updateText = () => {
      const ts = localStorage.getItem('last_sync_patients');
      if (!ts) {
        setLastSyncText('');
        return;
      }
      const diff = Date.now() - Number(ts);
      if (diff < 60_000) {
        setLastSyncText('Last synced just now');
      } else {
        const mins = Math.floor(diff / 60_000);
        if (mins < 60) {
          setLastSyncText(`Last synced ${mins} min${mins > 1 ? 's' : ''} ago`);
        } else {
          const hours = Math.floor(mins / 60);
          setLastSyncText(`Last synced ${hours} hour${hours > 1 ? 's' : ''} ago`);
        }
      }
    };
    updateText();
    const interval = setInterval(updateText, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Offline-first data ─────────────────────────────────────────────────────
  const {
    patients,
    loading,
    syncing,
    error,
    addPatient,
    deletePatient,
    fetchFromServer,
  } = usePatients();

  const isOnline                        = isServerReachable;
  const [searchTerm, setSearchTerm]     = useState('');
  const [activeFilter, setActiveFilter] = useState('All Patients');
  const [villageFilter, setVillageFilter] = useState('All');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [isAddModalOpen, setIsAddModalOpen]     = useState(false);
  const [selectedPatient, setSelectedPatient]   = useState(null);
  const [isDetailsOpen, setIsDetailsOpen]       = useState(false);
  const [deleteTarget, setDeleteTarget]         = useState(null);   // patient to delete
  const [deleteLoading, setDeleteLoading]       = useState(false);

  // reset pagination on filter change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchTerm, activeFilter, villageFilter]);

  const detailsRef = useRef(null);

  // Auto scroll to details on mobile/tablet when a patient is selected
  useEffect(() => {
    if (selectedPatient) {
      const isMobileOrTablet = window.innerWidth < 1280; // 'xl' breakpoint is 1280px
      if (isMobileOrTablet) {
        setTimeout(() => {
          detailsRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }, 150); // Comfortable delay to ensure browser completes DOM rendering
      }
    }
  }, [selectedPatient]);

  // ── Delete handler ──────────────────────────────────────────────
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deletePatient(deleteTarget);
      // Close side panel if it was showing the deleted patient
      if (
        selectedPatient &&
        (selectedPatient.local_id === deleteTarget.local_id ||
         selectedPatient.id       === deleteTarget.id)
      ) {
        setSelectedPatient(null);
        setIsDetailsOpen(false);
      }
      toast.success(`${deleteTarget.name} and all records deleted.`);
    } catch (err) {
      console.error('[PatientList] delete failed:', err);
      toast.error('Failed to delete patient. Please try again.');
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deletePatient, selectedPatient]);

  // ── derived data ───────────────────────────────────────────────────────────
  const safe = Array.isArray(patients) ? patients : [];

  const villages = useMemo(
    () => ['All', ...new Set(safe.map((p) => p.village).filter(Boolean))],
    [safe],
  );

  const filtered = useMemo(() => safe.filter((p) => {
    if (!p) return false;
    const q = searchTerm.toLowerCase();
    const matchSearch = !q
      || (p.name   || '').toLowerCase().includes(q)
      || (p.phone  || '').includes(q)
      || (p.village|| '').toLowerCase().includes(q);
    const matchVillage = villageFilter === 'All' || p.village === villageFilter;
    return matchSearch && matchVillage && matchesFilter(p, activeFilter);
  }), [safe, searchTerm, villageFilter, activeFilter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // ── loading ────────────────────────────────────────────────────────────────
  if (loading && patients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <BrandLogo compact={true} size="sm" className="opacity-40 animate-pulse pointer-events-none" />
        <div className="w-14 h-14 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-on-surface-variant font-body font-medium">Accessing Patient Records…</p>
      </div>
    );
  }

  // ── hard error (no data at all) ────────────────────────────────────────────
  if (error && patients.length === 0) {
    const isNetwork = error === 'network';
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-6 max-w-md mx-auto">
        <BrandLogo size="md" className="opacity-50 select-none pointer-events-none mb-2" />
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center ${isNetwork ? 'bg-amber-50' : 'bg-error-container'}`}>
          {isNetwork
            ? <WifiOff className="w-10 h-10 text-amber-500" />
            : <AlertTriangle className="w-10 h-10 text-error" />}
        </div>
        <h2 className="text-2xl font-headline font-bold text-on-surface">
          {error === 'unauthorized' ? 'Session Expired' : 'Server Unreachable'}
        </h2>
        <p className="text-on-surface-variant text-sm font-body leading-relaxed">
          {error === 'unauthorized'
            ? 'Your session has expired. Please log in again.'
            : 'Could not connect to the medical server. The app will keep retrying automatically.'}
        </p>
        <div className="flex gap-3 w-full">
          <button
            onClick={() => fetchFromServer()}
            className="flex-1 bg-primary text-on-primary px-6 py-3 rounded-xl font-body font-semibold flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all"
          >
            <RefreshCw size={18} />
            Retry Now
          </button>
          {error === 'unauthorized' && (
            <a
              href="/login"
              className="flex-1 bg-surface-container-high text-on-surface px-6 py-3 rounded-xl font-body font-semibold flex items-center justify-center"
            >
              Login
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── main ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex-grow pt-6 pb-24 px-6 md:px-12 max-w-screen-2xl mx-auto w-full">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-5xl md:text-6xl font-headline font-bold text-on-surface tracking-tight">
              {t('patients') || 'Patients'}
            </h1>
            {/* Sync Status / Connectivity */}
            {syncing ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 text-[10px] font-body font-bold rounded-full border border-amber-100 uppercase tracking-wider">
                <Loader2 size={12} className="animate-spin" />
                {t('syncing', 'Syncing')}
              </span>
            ) : (
              <span className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-body font-bold rounded-full border uppercase tracking-wider ${isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {isOnline ? t('serverOnline', 'Server Online') : t('offline', 'Offline')}
              </span>
            )}
          </div>
          <p className="text-on-surface-variant text-lg font-body">
            {t('patientListTagline', 'Manage and monitor community health profiles.')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
              search
            </span>
            <input
              id="patient-search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchPlaceholder', 'Search by name, ID or village…')}
              className="pl-10 pr-4 py-2.5 bg-white border border-outline-variant/30 rounded-xl focus:ring-2 focus:ring-primary/20 text-sm w-64 md:w-80 transition-all outline-none font-body"
            />
          </div>

          {/* Sync Patients */}
          <div className="flex flex-col items-end gap-1">
            <button
              id="btn-sync-patients"
              disabled={manualSyncing}
              onClick={async () => {
                setManualSyncing(true);
                const toastId = toast.loading('Syncing patients...');
                try {
                  const result = await manualSyncPatients();
                  if (result.status === 'success') {
                    toast.success(result.message, { id: toastId });
                    await fetchFromServer();
                  } else if (result.status === 'partial') {
                    toast.error(result.message, { id: toastId });
                    await fetchFromServer();
                  } else if (result.status === 'nothing-to-sync') {
                    toast.success(result.message, { id: toastId });
                  } else if (result.status === 'offline') {
                    toast.error(result.message, { id: toastId });
                  } else {
                    toast.error(result.message || 'Sync failed', { id: toastId });
                  }
                } catch (err) {
                  toast.error(`Sync failed: ${err.message}`, { id: toastId });
                } finally {
                  setManualSyncing(false);
                }
              }}
              className="flex items-center gap-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200/50 px-5 py-2.5 rounded-xl font-body font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-95"
            >
              <span className={`material-symbols-outlined text-[20px] ${manualSyncing ? 'animate-spin' : ''}`}>sync</span>
              <span>{manualSyncing ? 'Syncing Patients...' : 'Sync Patients'}</span>
            </button>
            {lastSyncText && (
              <span className="text-[10px] text-slate-400 font-medium">{lastSyncText}</span>
            )}
          </div>

          {/* Add patient */}
          <button
            id="btn-add-patient"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-body font-semibold shadow-lg hover:opacity-90 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            <span>{t('addPatient', 'Add Patient')}</span>
          </button>
        </div>
      </header>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex flex-wrap gap-2 items-center">
          {CATEGORY_FILTERS.map((f) => (
            <button
              key={f.key}
              id={`filter-${f.key}`}
              onClick={() => setActiveFilter(f.label)}
              className={`px-6 py-2 rounded-full text-sm font-body font-medium transition-all active:scale-95 ${
                activeFilter === f.label
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-white border border-outline-variant/20 text-on-surface-variant hover:border-primary/40'
              }`}
            >
              {t(f.key, f.label)}
            </button>
          ))}

          {/* Refresh */}
          <button
            onClick={() => fetchFromServer()}
            aria-label="Refresh patient list"
            className="p-2 bg-white border border-outline-variant/20 rounded-full text-on-surface-variant hover:text-primary hover:border-primary/30 transition-all"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Village filter */}
        <div className="relative min-w-[200px]">
          <select
            id="village-filter"
            value={villageFilter}
            onChange={(e) => setVillageFilter(e.target.value)}
            className="appearance-none w-full bg-white border border-outline-variant/20 px-4 py-2 pr-10 rounded-xl text-sm font-body font-medium text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/10"
          >
            {villages.map((v) => (
              <option key={v} value={v}>{v === 'All' ? t('allVillages', 'All Villages') : v}</option>
            ))}
          </select>
          <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant text-[20px]">
            expand_more
          </span>
        </div>
      </section>

      {/* ── Main layout: grid + side panel ───────────────────────────────── */}
      <div className="grid grid-cols-12 gap-6 items-start">

        {/* Patient cards */}
        <div className={`col-span-12 space-y-4 ${selectedPatient ? 'xl:col-span-7' : 'xl:col-span-12'}`}>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4 text-on-surface-variant">
              <BrandLogo compact={true} size="md" className="opacity-15 select-none pointer-events-none mb-2 animate-bounce" />
              <p className="font-body font-semibold text-lg">{t('noPatientsFound', 'No Patients Found')}</p>
              <p className="text-sm font-body text-on-surface-variant">
                {searchTerm
                  ? t('noResultsFor', 'No results for "{{term}}"', { term: searchTerm })
                  : t('noPatientsInCategory', 'No patients in the "{{category}}" category', { category: t(CATEGORY_FILTERS.find(cf => cf.label === activeFilter)?.key || activeFilter, activeFilter) })}
              </p>
              {(searchTerm || activeFilter !== 'All Patients' || villageFilter !== 'All') && (
                <button
                  onClick={() => { setSearchTerm(''); setActiveFilter('All Patients'); setVillageFilter('All'); }}
                  className="px-6 py-2 border border-outline-variant/30 rounded-full text-sm font-body hover:bg-surface-container-high transition-all"
                >
                  {t('clearFilters', 'Clear Filters')}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {visible.map((p) => (
                  <PatientCard
                    key={p.id || p.local_id}
                    patient={p}
                    isActive={(selectedPatient?.id && selectedPatient.id === p.id) || (selectedPatient?.local_id && selectedPatient.local_id === p.local_id)}
                    onClick={() => {
                      setSelectedPatient(p);
                      setIsDetailsOpen(true);
                    }}
                    onDeleteRequest={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(p);
                    }}
                  />
                ))}
              </div>

              {/* Load more / count */}
              <div className="mt-8 flex flex-col items-center gap-3">
                {hasMore && (
                  <button
                    onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                    className="px-10 py-3 bg-surface-container-high text-primary font-body font-bold rounded-full hover:bg-primary hover:text-on-primary transition-all duration-300 active:scale-95"
                  >
                    {t('loadMorePatients', 'Load More Patients')}
                  </button>
                )}
                <p className="text-on-surface-variant text-sm font-body">
                  {t('showingPatientsCount', 'Showing {{visible}} of {{total}} patients', { visible: Math.min(visibleCount, filtered.length), total: filtered.length })}
                  {(activeFilter !== 'All Patients' || searchTerm || villageFilter !== 'All')
                    ? ` ${t('filteredFromTotal', '(filtered from {{total}} total)', { total: safe.length })}`
                    : ''}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Patient details panel */}
        {selectedPatient && (
          <div 
            ref={detailsRef} 
            key={selectedPatient.id || selectedPatient.local_id}
            className="col-span-12 xl:col-span-5 sticky top-28 mb-36 xl:mb-0 transition-all duration-500 animate-in fade-in slide-in-from-bottom-6 details-glow-highlight"
            style={{ scrollMarginTop: '110px' }}
          >
            {/* Custom scoped details glow keyframes */}
            <style>{`
              @keyframes detailsGlowHighlight {
                0% {
                  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05), 0 0 0 0px rgba(15, 118, 110, 0);
                }
                15% {
                  box-shadow: 0 20px 48px -10px rgba(15, 118, 110, 0.2), 0 0 0 4px rgba(15, 118, 110, 0.15);
                  transform: translateY(-2px);
                }
                100% {
                  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05), 0 0 0 0px rgba(15, 118, 110, 0);
                  transform: translateY(0);
                }
              }
              .details-glow-highlight {
                animation: detailsGlowHighlight 1.8s cubic-bezier(0.25, 1, 0.5, 1);
              }
            `}</style>

            <PatientDetailsPanel
              patient={selectedPatient}
              isOpen={isDetailsOpen}
              onClose={() => {
                setIsDetailsOpen(false);
                setSelectedPatient(null);
              }}
              onAddVisit={() => onOpenAddVisit(selectedPatient.id || selectedPatient.local_id)}
              onDeleteRequest={() => setDeleteTarget(selectedPatient)}
              t={t}
            />
          </div>
        )}
      </div>

      {/* ── Add Patient Modal ─────────────────────────────────────────────── */}
      <AddPatient
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddPatient={addPatient}
        onSuccess={(_saved) => {}}
      />

      {/* ── Delete Confirmation Modal ─────────────────────────────── */}
      {deleteTarget && (
        <DeleteConfirmModal
          patient={deleteTarget}
          loading={deleteLoading}
          onConfirm={handleConfirmDelete}
          onCancel={() => !deleteLoading && setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ─── DeleteConfirmModal ────────────────────────────────────────────────────────

function DeleteConfirmModal({ patient, loading, onConfirm, onCancel }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ animation: 'deleteModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)' }}
      >
        {/* Red danger header strip */}
        <div className="bg-gradient-to-r from-rose-500 to-red-600 px-6 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Trash2 size={20} className="text-white" />
            </div>
            <div>
              <h2 id="delete-modal-title" className="text-white font-headline font-bold text-lg leading-tight">
                Delete Patient Record
              </h2>
              <p className="text-rose-100 text-xs font-body mt-0.5">Permanent &amp; irreversible action</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-on-surface font-body text-sm leading-relaxed">
            Are you sure you want to permanently delete patient{' '}
            <span className="font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
              {patient.name}
            </span>
            ?
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
              This will also permanently remove:
            </p>
            {[
              'All visit records &amp; medical history',
              'All reports &amp; uploaded files',
              'All reminders &amp; follow-up schedules',
              'All prescription photos',
              'All offline cached data',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm font-body text-on-surface-variant">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                <span dangerouslySetInnerHTML={{ __html: item }} />
              </div>
            ))}
          </div>

          <p className="text-[11px] font-bold text-rose-500 text-center pt-1">
            ⚠ This action cannot be undone.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            id="btn-cancel-delete"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-outline-variant/30 text-on-surface-variant font-body font-semibold text-sm hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            id="btn-confirm-delete"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-body font-bold text-sm shadow-lg hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 size={15} className="animate-spin" /> Deleting…</>
            ) : (
              <><Trash2 size={15} /> Delete Permanently</>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes deleteModalIn {
          from { opacity: 0; transform: scale(0.88) translateY(16px); }
          to   { opacity: 1; transform: scale(1)   translateY(0); }
        }
      `}</style>
    </div>
  );
}
