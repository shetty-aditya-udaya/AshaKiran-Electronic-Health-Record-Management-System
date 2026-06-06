/**
 * Reports – offline-first Reports tab.
 * Reads from IndexedDB first, server in background.
 * Never shows empty state if local data exists.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { db } from '../lib/db';
import { useReports } from '../hooks/useReports';
import { useConnection } from '../context/ConnectionContext';
import BrandLogo from '../components/BrandLogo';
import { useTranslation } from 'react-i18next';
import { manualSyncReports } from '../lib/syncService';

// ─── helpers ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 6;

function statusBadge(status) {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':    return 'bg-primary-container text-on-primary-container';
    case 'COMPLETED': return 'bg-surface-container-high text-on-surface-variant';
    case 'CRITICAL':  return 'bg-error-container text-error';
    default:          return 'bg-surface-container-high text-on-surface-variant';
  }
}

function progressWidth(status) {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':    return 'w-[65%]';
    case 'CRITICAL':  return 'w-[90%]';
    case 'COMPLETED': return 'w-full';
    default:          return 'w-[40%]';
  }
}

function progressColour(status) {
  switch ((status || '').toUpperCase()) {
    case 'ACTIVE':    return 'bg-primary';
    case 'CRITICAL':  return 'bg-error';
    case 'COMPLETED': return 'bg-outline-variant';
    default:          return 'bg-primary';
  }
}

function patientSubtitle(p, t) {
  const cat = p.category;
  const status = p.health_status;
  let displayStatus = status;
  if (status) {
    displayStatus = t(`status.${status.toLowerCase()}`, status);
  }
  if (cat === 'Pregnancy') return displayStatus || t('healthStatus.anc', 'Antenatal Care');
  if (cat === 'Childcare') return displayStatus || t('healthStatus.vaccination', 'Child Vaccination');
  if (cat === 'Chronic')   return displayStatus || t('healthStatus.chronic', 'Chronic Wellness');
  return displayStatus || t(`category.${cat?.toLowerCase()}`, cat || 'General');
}

function subtitleColour(p) {
  if (p.category === 'Pregnancy') return 'text-on-primary-container';
  if (p.category === 'Chronic')   return 'text-tertiary';
  if (p.category === 'Childcare') return 'text-secondary';
  return 'text-on-surface-variant';
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return '—'; }
}

function avatarBg(idx) {
  const colours = [
    'bg-primary-container text-on-primary-container',
    'bg-secondary-container text-on-secondary-container',
    'bg-tertiary-container text-on-tertiary-container',
    'bg-surface-container-highest text-on-surface',
  ];
  return colours[(idx || 0) % colours.length];
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

// ─── SYNC STATUS BADGE ───────────────────────────────────────────────────────

function SyncBadge({ syncStatus }) {
  if (!syncStatus || syncStatus === 'synced') return null;
  const meta = {
    pending: { icon: '⏳', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
    syncing: { icon: '🔄', cls: 'bg-sky-50 text-sky-600 border-sky-200'    },
    failed:  { icon: '❌', cls: 'bg-rose-50 text-rose-600 border-rose-200'  },
  }[syncStatus];
  if (!meta) return null;
  return (
    <span className={`ml-1 px-2 py-0.5 text-[9px] font-bold rounded-full border ${meta.cls}`}>
      {meta.icon} {syncStatus}
    </span>
  );
}

// ─── component ──────────────────────────────────────────────────────────────

const CATEGORIES = ['All', 'Pregnancy', 'Chronic', 'Childcare', 'General'];

export default function Reports() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { folders, loading, syncing, error, fetchFromServer } = useReports();
  const { isServerReachable } = useConnection();

  const [lastSyncText, setLastSyncText] = useState('');
  const [manualSyncing, setManualSyncing] = useState(false);

  useEffect(() => {
    const updateText = () => {
      const ts = localStorage.getItem('last_sync_records');
      if (!ts) {
        setLastSyncText('');
        return;
      }
      const diff = Date.now() - Number(ts);
      if (diff < 60_000) {
        setLastSyncText(t('reports.lastSyncedJustNow'));
      } else {
        const mins = Math.floor(diff / 60_000);
        if (mins < 60) {
          setLastSyncText(t('reports.lastSyncedMinutesAgo', { count: mins }));
        } else {
          const hours = Math.floor(mins / 60);
          setLastSyncText(hours > 1 ? t('reminders.lastSyncedHoursAgoPlural', { count: hours }) : t('reminders.lastSyncedHoursAgo', { count: hours }));
        }
      }
    };
    updateText();
    const interval = setInterval(updateText, 30000);
    return () => clearInterval(interval);
  }, []);

  const [searchTerm, setSearchTerm]         = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [visibleCount, setVisibleCount]     = useState(PAGE_SIZE);
  const isOffline = !isServerReachable;

  // ── filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return folders.filter(p => {
      const matchSearch =
        !q ||
        (p.name     || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.health_status || '').toLowerCase().includes(q);
      const matchCat = activeCategory === 'All' || p.category === activeCategory;
      return matchSearch && matchCat;
    });
  }, [folders, searchTerm, activeCategory]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchTerm, activeCategory]);

  // ── export ──────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    const toastId = toast.loading(t('reports.generatingWorkbook'));
    try {
      // 1. Fetch full data from Dexie
      const patients = await db.patients.toArray();
      const visits = await db.visits.toArray();
      const reminders = await db.reminders.toArray();
      const reportItems = await db.reportItems.toArray();
      const images = await db.prescriptionImages.toArray();

      // 2. Prepare Patients sheet
      const patientHeaders = [
        'Patient Name', 'Patient ID', 'Age', 'Gender', 'Village', 
        'Category', 'Risk Level', 'Pregnancy Weeks', 'Phone Number',
        'Registration Date', 'Last Updated', 'Current Status', 
        'Total Visits', 'Completed Visits', 'Pending Visits', 'Sync Status'
      ];
      
      const patientRows = patients.map(p => {
        const pVisits = visits.filter(v => 
          String(v.patientId) === String(p.id) || 
          String(v.patientId) === String(p.local_id) ||
          String(v.patient_id) === String(p.id) ||
          String(v.patient_id) === String(p.local_id)
        );
        const totalVisits = pVisits.length;
        const completedVisits = pVisits.filter(v => v.status === 'COMPLETED').length;
        const pendingVisits = pVisits.filter(v => v.status !== 'COMPLETED').length;
        
        return [
          p.name || 'NA',
          p.id || 'NA',
          p.age ? `${p.age} Yrs` : 'NA',
          p.gender || 'NA',
          p.village || 'NA',
          p.category || 'NA',
          p.risk_level || 'NA',
          p.weeks_of_pregnancy || 'NA',
          p.phone || 'NA',
          fmtDate(p.createdAt || p.created_at),
          fmtDate(p.updatedAt || p.updated_at),
          p.status || 'ACTIVE',
          totalVisits,
          completedVisits,
          pendingVisits,
          p.syncStatus || 'synced'
        ];
      });

      // 3. Prepare Visits sheet
      const visitHeaders = [
        'Patient Name', 'Patient ID', 'Visit Date', 'Visit Type', 
        'Completion Status', 'Blood Pressure', 'Blood Sugar', 'Weight (kg)', 
        'Height (cm)', 'Condition Severity', 'ASHA Worker Notes', 
        'Prescription Prescribed', 'Prescribed By', 'Prescriber Name', 
        'Clinic/Hospital', 'Prescription Images Uploaded', 'Offline Created', 
        'Follow-up Date', 'Sync Status'
      ];

      const visitRows = visits.map(v => {
        const p = patients.find(pat => 
          String(pat.id) === String(v.patientId) || 
          String(pat.local_id) === String(v.patientId) ||
          String(pat.id) === String(v.patient_id) ||
          String(pat.local_id) === String(v.patient_id)
        );
        
        const hasImages = images.some(img => img.visitLocalId === v.local_id) || (v.prescription_images || []).length > 0;
        const pd = v.prescription_data || {};
        
        return [
          p ? p.name : 'Unknown',
          p ? (p.id || 'NA') : 'NA',
          fmtDate(v.visit_date || v.date),
          v.visit_type || v.type || 'General',
          v.status || 'PENDING',
          v.bp || v.details?.bp || 'NA',
          v.glucose || v.details?.sugar || 'NA',
          v.details?.weight || 'NA',
          v.details?.height || 'NA',
          v.severity || 'NA',
          v.notes || 'NA',
          pd.medicine_prescribed ? 'Yes' : 'No',
          pd.prescribed_by || 'NA',
          pd.prescriber_name || 'NA',
          pd.clinic_name || 'NA',
          hasImages ? 'Yes' : 'No',
          (!v.id || String(v.id).startsWith('local_')) ? 'Yes' : 'No',
          fmtDate(v.next_checkup_date || v.next_follow_up),
          v.syncStatus || 'synced'
        ];
      });

      // 4. Prepare Sync Status sheet
      const syncHeaders = [
        'Entity Type', 'Local ID', 'Server ID', 'Record Details', 
        'Sync Status', 'Retry Count', 'Created Date'
      ];

      const syncRows = [
        ...patients.map(p => ['Patient', p.local_id, p.id || 'Pending', p.name, p.syncStatus, p.retryCount || 0, fmtDate(p.createdAt)]),
        ...visits.map(v => {
          const p = patients.find(pat => String(pat.id) === String(v.patientId) || String(pat.local_id) === String(v.patientId));
          return ['Visit', v.local_id, v.id || 'Pending', `${p?.name || 'Unknown'} - ${v.visit_type || 'Visit'}`, v.syncStatus, v.retryCount || 0, fmtDate(v.visit_date || v.date)];
        }),
        ...reminders.map(r => ['Reminder', r.local_id, r.id || 'Pending', `${r.patient || 'Unknown'} - ${r.reminder_type || r.type || 'Reminder'}`, r.syncStatus, r.retryCount || 0, fmtDate(r.visit_date || r.date)]),
        ...reportItems.map(ri => ['Report Item', ri.local_id, ri.id || 'Pending', ri.title, ri.syncStatus, ri.retryCount || 0, fmtDate(ri.createdAt)]),
        ...images.map(img => ['Prescription Image', img.local_id, img.url ? 'Uploaded' : 'Pending', `Visit: ${img.visitLocalId}`, img.syncStatus, img.retryCount || 0, fmtDate(img.createdAt)])
      ];

      // 5. Compile XLSX Workbook using SheetJS
      const wb = XLSX.utils.book_new();

      const wsPatients = XLSX.utils.aoa_to_sheet([patientHeaders, ...patientRows]);
      const wsVisits = XLSX.utils.aoa_to_sheet([visitHeaders, ...visitRows]);
      const wsSync = XLSX.utils.aoa_to_sheet([syncHeaders, ...syncRows]);

      // Set beautiful column widths
      const setColWidths = (ws, headers, rows) => {
        ws['!cols'] = headers.map((h, i) => {
          const maxLen = Math.max(
            h.toString().length,
            ...rows.map(r => r[i] ? r[i].toString().length : 0)
          );
          return { wch: Math.min(Math.max(maxLen + 2, 10), 40) }; // cap at 40, min 10
        });
      };

      setColWidths(wsPatients, patientHeaders, patientRows);
      setColWidths(wsVisits, visitHeaders, visitRows);
      setColWidths(wsSync, syncHeaders, syncRows);

      XLSX.utils.book_append_sheet(wb, wsPatients, 'Patients');
      XLSX.utils.book_append_sheet(wb, wsVisits, 'Visits');
      XLSX.utils.book_append_sheet(wb, wsSync, 'Sync Status');

      XLSX.writeFile(wb, 'AshaKiran_Healthcare_Workbook.xlsx');
      toast.success(t('reports.workbookExported'), { id: toastId });
    } catch (err) {
      console.error('[Export Error]', err);
      toast.error(t('reports.workbookExportFailed'), { id: toastId });
    }
  };

  // ── loading (only when IDB has nothing) ────────────────────────────────────
  if (loading && folders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <BrandLogo compact={true} size="sm" className="opacity-40 animate-pulse pointer-events-none" />
        <div className="w-14 h-14 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-on-surface-variant font-body font-medium tracking-tight">
          {t('reports.openingArchives', 'Opening Medical Archives…')}
        </p>
      </div>
    );
  }

  // ── error (only when IDB is also empty) ────────────────────────────────────
  if (error && folders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-6">
        <BrandLogo size="md" className="opacity-50 select-none pointer-events-none mb-2" />
        <div className="flex items-center gap-2 text-amber-500 font-semibold bg-amber-50 px-4 py-2 rounded-full border border-amber-100">
          <WifiOff className="w-5 h-5 animate-pulse" />
          <span>{t('reports.couldNotLoad', 'Could not load reports')}</span>
        </div>
        <p className="text-on-surface-variant text-sm max-w-sm mt-1">
          {error === 'unauthorized'
            ? t('reports.sessionExpired', 'Your session expired. Please log in again.')
            : t('reports.connectAndRetry', 'Connect to the internet and tap Retry.')}
        </p>
        <button
          onClick={() => fetchFromServer()}
          className="px-8 py-3 bg-primary text-on-primary font-body font-semibold rounded-full shadow-md hover:opacity-90 active:scale-95 transition-all mt-2"
        >
          {t('retry', 'Retry')}
        </button>
      </div>
    );
  }

  // ── main ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex-grow pt-8 pb-16 px-6 md:px-12 max-w-screen-2xl mx-auto w-full">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="mb-10">
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-5xl md:text-6xl font-headline font-bold text-on-surface tracking-tight">
            {t('medicalHistory', 'Medical History')}
          </h1>
          {syncing ? (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full border border-amber-100 uppercase tracking-wider">
              <Loader2 size={11} className="animate-spin" /> {t('syncing', 'Syncing')}
            </span>
          ) : isOffline ? (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-500 text-[10px] font-bold rounded-full border border-slate-200 uppercase tracking-wider">
              <WifiOff size={11} /> {t('offline', 'Offline')}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-100 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {t('online', 'Online')}
            </span>
          )}
        </div>
        <p className="text-on-surface-variant text-lg max-w-2xl font-body">
          {t('reports.subtitle', 'Auto-generated medical records from completed visits. Select a patient to view their full health timeline.')}
        </p>
      </header>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        {/* Search */}
        <div className="relative w-full md:max-w-xs">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
            search
          </span>
          <input
            id="reports-search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('reports.searchPlaceholder', 'Search reports…')}
            className="pl-10 pr-4 py-2.5 bg-surface-container-low rounded-full border border-outline-variant/20 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-body w-full transition-all"
          />
        </div>

        {/* Category pills + actions */}
        <div className="flex flex-wrap items-center gap-3">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              id={`filter-${cat.toLowerCase()}`}
              onClick={() => setActiveCategory(cat)}
              className={`px-6 py-2 rounded-full font-body font-medium text-sm transition-all active:scale-95 ${
                activeCategory === cat
                  ? 'bg-primary text-on-primary shadow-md'
                  : 'bg-transparent border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {cat === 'All' ? t('reminders.statusAll') : t(`category.${cat.toLowerCase()}`, cat)}
            </button>
          ))}
          <div className="flex flex-col items-end gap-1 ml-2">
            <button
              id="btn-sync-records"
              disabled={manualSyncing}
              onClick={async () => {
                setManualSyncing(true);
                const toastId = toast.loading(t('reports.syncingRecordsLoading'));
                try {
                  const result = await manualSyncReports();
                  let msg = result.message;
                  if (result.status === 'success') {
                    msg = t('reports.syncSuccess', 'Healthcare records synced successfully');
                    toast.success(msg, { id: toastId });
                    await fetchFromServer();
                  } else if (result.status === 'partial') {
                    msg = t('reminders.syncPartial', 'Some records synced, some failed. Please try again.');
                    toast.error(msg, { id: toastId });
                    await fetchFromServer();
                  } else if (result.status === 'nothing-to-sync') {
                    msg = t('reminders.syncNothing', 'All records already synced');
                    toast.success(msg, { id: toastId });
                  } else if (result.status === 'offline') {
                    msg = t('reminders.syncOffline', 'You are offline. Connect to the internet to sync pending data.');
                    toast.error(msg, { id: toastId });
                  } else if (result.status === 'locked') {
                    msg = t('reminders.syncLocked', 'Sync already in progress.');
                    toast.error(msg, { id: toastId });
                  } else {
                    msg = t('reports.syncFailed', 'Failed to sync healthcare records');
                    toast.error(msg, { id: toastId });
                  }
                } catch (err) {
                  toast.error(`${t('reports.syncFailed', 'Failed to sync healthcare records')}: ${err.message}`, { id: toastId });
                } finally {
                  setManualSyncing(false);
                }
              }}
              className="flex items-center gap-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200/50 px-5 py-2.5 rounded-xl font-body font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-95"
            >
              <span className={`material-symbols-outlined text-[20px] ${manualSyncing ? 'animate-spin' : ''}`}>sync</span>
              <span>{manualSyncing ? t('reports.syncingRecords') : t('reports.syncRecords')}</span>
            </button>
            {lastSyncText && (
              <span className="text-[10px] text-slate-400 font-medium">{lastSyncText}</span>
            )}
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 text-primary font-body font-semibold hover:bg-primary-container/20 px-4 py-2 rounded-lg transition-all ml-2"
          >
            <span className="material-symbols-outlined text-[20px]">download</span>
            <span className="hidden sm:inline">{t('reports.export', 'Export')}</span>
          </button>
        </div>
      </section>

      {/* ── Cards Grid ────────────────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-on-surface-variant">
          <BrandLogo compact={true} size="md" className="opacity-15 select-none pointer-events-none mb-2 animate-bounce" />
          <p className="font-body font-semibold text-lg">{t('reports.noReportsFound', 'No patient records found')}</p>
          <p className="text-sm">
            {searchTerm
              ? t('reports.noResultsFor', 'No results for "{{term}}"', { term: searchTerm })
              : activeCategory !== 'All'
                ? t('reports.noPatientsInCategory', 'No patients in the "{{category}}" category', { category: t(activeCategory.toLowerCase(), activeCategory) })
                : t('reports.noReportsDesc', 'Complete visits to automatically generate patient medical histories here.')}
          </p>
          {(searchTerm || activeCategory !== 'All') && (
            <button
              onClick={() => { setSearchTerm(''); setActiveCategory('All'); }}
              className="mt-2 px-6 py-2 border border-outline-variant/40 rounded-full text-sm font-body font-medium hover:bg-surface-container-high transition-all"
            >
              {t('clearFilters', 'Clear filters')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {visible.map((p, idx) => (
            <ReportFolderCard
              key={p.local_id}
              folder={p}
              idx={idx}
              onClick={() => {
                // Navigate using server id if available, else local_id
                const navId = p.patientId || p.patientLocalId || p.local_id;
                navigate(`/reports/${navId}`);
              }}
            />
          ))}
        </div>
      )}

      {/* ── Load More ─────────────────────────────────────────────────────── */}
      {(hasMore || visible.length > 0) && (
        <div className="mt-16 flex flex-col items-center gap-3">
          {hasMore && (
            <button
              onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
              className="px-10 py-3 bg-surface-container-high text-primary font-body font-bold rounded-full hover:bg-primary hover:text-on-primary transition-all duration-300 active:scale-95"
            >
              {t('reports.loadMoreRecords', 'Load More Records')}
            </button>
          )}
          <p className="text-on-surface-variant text-sm font-body">
            {t('reports.showingCount', 'Showing {{visible}} of {{total}} patient(s)', {
              visible: Math.min(visibleCount, filtered.length),
              total: filtered.length,
            })}
            {activeCategory !== 'All' || searchTerm ? ` ${t('reports.filteredFromTotal', { count: folders.length })}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── ReportFolderCard ────────────────────────────────────────────────────────

function ReportFolderCard({ folder: p, idx, onClick }) {
  const { t } = useTranslation();
  const subtitle    = patientSubtitle(p, t);
  const subtitleCls = subtitleColour(p);
  const badgeCls    = statusBadge(p.status);
  const progressW   = progressWidth(p.status);
  const progressC   = progressColour(p.status);
  const avatarCls   = avatarBg(idx);

  return (
    <article
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      aria-label={`Open report for ${p.name}`}
      className="group bg-surface-container-lowest p-6 rounded shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all duration-300 cursor-pointer relative overflow-hidden border border-transparent hover:border-surface-container-high"
    >
      {/* Top row */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-headline font-bold shrink-0 ${avatarCls}`}
            aria-hidden="true"
          >
            {initials(p.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-headline font-bold text-on-surface group-hover:text-primary transition-colors leading-tight">
                {p.name}
              </h3>
              <SyncBadge syncStatus={p.syncStatus} />
            </div>
            <span className={`text-xs font-body font-bold tracking-widest uppercase ${subtitleCls}`}>
              {subtitle}
            </span>
          </div>
        </div>
        <span className={`px-3 py-1 text-[10px] font-body font-bold rounded-full tracking-wider shrink-0 ${badgeCls}`}>
          {(p.status || 'ACTIVE').toUpperCase()}
        </span>
      </div>

      {/* Body */}
      <div className="space-y-3">
        <div className="flex justify-between text-sm font-body">
          <span className="text-on-surface-variant">{t('reports.lastUpdated', 'Last updated')}</span>
          <span className="text-on-surface font-medium">{fmtDate(p.last_updated || p.updatedAt)}</span>
        </div>
        <div className="w-full h-1.5 bg-surface-container-low rounded-full overflow-hidden">
          <div className={`${progressC} h-full rounded-full transition-all duration-700 ${progressW}`} />
        </div>
        <div className="flex justify-between items-center text-[10px] font-body font-bold text-on-surface-variant uppercase tracking-widest pt-1">
          <span>{p.village || '—'}</span>
          <span>{p.patientId ? `ID #${p.patientId}` : `⏳ ${t('reports.pending', 'Pending')}`}</span>
        </div>
      </div>

      {/* Arrow on hover */}
      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">
        <span className="material-symbols-outlined text-primary">arrow_forward</span>
      </div>
    </article>
  );
}
