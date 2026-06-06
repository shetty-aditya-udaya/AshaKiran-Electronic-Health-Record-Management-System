import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useReminders } from '../hooks/useReminders';
import { useDeleteVisit } from '../hooks/useDeleteVisit';
import DeleteVisitModal from '../components/DeleteVisitModal';
import { SYNC } from '../lib/db';
import BrandLogo from '../components/BrandLogo';
import { manualSyncReminders } from '../lib/syncService';

// urgency-based visit type → material symbol
function typeIcon(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('anc') || t.includes('maternal')) return 'pregnant_woman';
  if (t.includes('vacc') || t.includes('immun'))   return 'child_care';
  if (t.includes('hyper') || t.includes('bp'))     return 'vital_signs';
  if (t.includes('ncd') || t.includes('chronic'))  return 'monitor_heart';
  if (t.includes('follow'))                         return 'event_repeat';
  return 'stethoscope';
}

function PendingCard({ r, navigate, t, onDeleteRequest }) {
  const getDaysDifferenceLabel = (visitDateStr) => {
    if (!visitDateStr) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const visitDate = new Date(visitDateStr);
    visitDate.setHours(0, 0, 0, 0);

    const diffTime = visitDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const abs = Math.abs(diffDays);
      return abs > 1 ? t('reminders.daysOverduePlural', { count: abs }) : t('reminders.daysOverdue', { count: abs });
    } else if (diffDays === 0) {
      return t('reminders.today');
    } else {
      return diffDays > 1 ? t('reminders.inDaysPlural', { count: diffDays }) : t('reminders.inDays', { count: diffDays });
    }
  };

  const statusLabel = r.computedStatus === 'overdue' ? t('reminders.badgeOverdue') : r.computedStatus === 'today' ? t('reminders.badgeToday') : t('reminders.badgeUpcoming');
  
  const style = {
    overdue: {
      border: 'border-l-red-500',
      badge: 'bg-red-50 text-red-700 border-red-200',
      daysBadge: 'bg-red-100 text-red-800',
      btn: 'bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow-red-600/20'
    },
    today: {
      border: 'border-l-blue-500',
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      daysBadge: 'bg-blue-100 text-blue-800',
      btn: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-blue-600/20'
    },
    upcoming: {
      border: 'border-l-emerald-500',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      daysBadge: 'bg-emerald-100 text-emerald-800',
      btn: 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm hover:shadow-teal-600/20'
    }
  }[r.computedStatus] || {
    border: 'border-l-slate-300',
    badge: 'bg-slate-50 text-slate-700 border-slate-200',
    daysBadge: 'bg-slate-100 text-slate-800',
    btn: 'bg-primary text-white hover:opacity-90'
  };

  const categoryClass = {
    pregnancy: 'chip-pregnancy',
    chronic: 'chip-chronic',
    childcare: 'chip-childcare',
    general: 'chip-general'
  }[r.patientCategory.toLowerCase()] || 'chip-general';

  const formatDisplayDate = (dStr) => {
    if (!dStr) return '';
    try {
      return new Date(dStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch { return dStr; }
  };

  return (
    <div
      className={`glass-card p-6 border-l-8 ${style.border} flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:-translate-y-0.5 transition-all`}
    >
      <div className="flex-grow space-y-3 min-w-0 w-full">
        {/* Row 1: Badges & Patient Name */}
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-xl font-bold text-slate-800 leading-none">{r.patientName}</h3>
          
          <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${style.badge}`}>
            {statusLabel}
          </span>
          
          <span className={`px-2.5 py-0.5 text-[10px] font-medium rounded-full ${style.daysBadge}`}>
            {getDaysDifferenceLabel(r.visit_date)}
          </span>

          <span className={`px-2.5 py-0.5 text-[10px] font-medium rounded-full border ${categoryClass}`}>
            {t(`category.${r.patientCategory.toLowerCase()}`, r.patientCategory)}
          </span>
        </div>

        {/* Row 2: Visit Type, Village, Date/Time */}
        <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-slate-500 text-sm font-body">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-primary">{typeIcon(r.visit_type)}</span>
            {t(`visitType.${(r.visit_type || 'General').toLowerCase()}`, r.visit_type || 'General')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">location_on</span>
            {r.village}
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="material-symbols-outlined text-base">calendar_today</span>
            {formatDisplayDate(r.visit_date)} at {r.time}
          </span>
          {r.syncStatus === SYNC.PENDING && (
            <span className="flex items-center gap-1.5 text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded-lg text-xs">
              <span className="material-symbols-outlined text-base animate-pulse">cloud_queue</span>
              {t('reminders.offlinePending')}
            </span>
          )}
        </div>

        {/* Row 3: Remarks/Notes */}
        {r.notes && (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 p-2.5 rounded-xl max-w-2xl truncate">
            <strong className="text-slate-600 mr-1">{t('reminders.notesLabel')}</strong> {r.notes}
          </p>
        )}
      </div>

      {/* Row 4: CTAs */}
      <div className="flex items-center gap-3 w-full md:w-auto flex-shrink-0">
        <button
          onClick={() => navigate(`/visits/${r.local_id || r.id}/complete`)}
          className={`flex-grow md:flex-none px-6 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${style.btn}`}
        >
          <span className="material-symbols-outlined text-lg">edit_document</span>
          {t('reminders.startVisit')}
        </button>
        {onDeleteRequest && (
          <button
            onClick={() => onDeleteRequest({ ...r, visit_date: r.visit_date, visit_type: r.visit_type, patient_name: r.patientName })}
            aria-label="Delete visit"
            title="Delete this visit"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-100 transition-all active:scale-90"
          >
            <span className="material-symbols-outlined text-lg">delete</span>
          </button>
        )}
      </div>
    </div>
  );
}

function CompletedCard({ r, navigate, t, onDeleteRequest }) {
  const categoryClass = {
    pregnancy: 'chip-pregnancy',
    chronic: 'chip-chronic',
    childcare: 'chip-childcare',
    general: 'chip-general'
  }[r.patientCategory.toLowerCase()] || 'chip-general';

  const formatDisplayDate = (dStr) => {
    if (!dStr) return '';
    try {
      return new Date(dStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch { return dStr; }
  };

  return (
    <div
      className="glass-card p-6 border-l-8 border-l-slate-400 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:-translate-y-0.5 transition-all opacity-95 hover:opacity-100"
    >
      <div className="flex-grow space-y-3 min-w-0 w-full">
        {/* Row 1: Badges & Patient Name */}
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-xl font-bold text-slate-700 leading-none">{r.patientName}</h3>
          
          <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border bg-slate-100 text-slate-600 border-slate-200">
            {t('reminders.badgeCompleted')}
          </span>

          <span className={`px-2.5 py-0.5 text-[10px] font-medium rounded-full border ${categoryClass}`}>
            {t(`category.${r.patientCategory.toLowerCase()}`, r.patientCategory)}
          </span>
        </div>

        {/* Row 2: Visit Type, Village, Date/Time */}
        <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-slate-500 text-sm font-body">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base text-primary">{typeIcon(r.visit_type)}</span>
            {t(`visitType.${(r.visit_type || 'General').toLowerCase()}`, r.visit_type || 'General')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">location_on</span>
            {r.village}
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="material-symbols-outlined text-base">check_circle</span>
            {t('reminders.completedOn', { date: formatDisplayDate(r.visit_date) })}
          </span>
        </div>

        {/* Row 3: Remarks/Notes */}
        {r.notes && (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 p-2.5 rounded-xl max-w-2xl truncate">
            <strong className="text-slate-600 mr-1">{t('reminders.remarksLabel')}</strong> {r.notes}
          </p>
        )}
      </div>

      {/* Row 4: CTAs */}
      <div className="flex items-center gap-3 w-full md:w-auto flex-shrink-0">
        <button
          onClick={() => navigate(`/reports/${r.patientId}`)}
          className="flex-grow md:flex-none px-6 py-2.5 rounded-xl font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">visibility</span>
          {t('reminders.viewRecord')}
        </button>
        {onDeleteRequest && (
          <button
            onClick={() => onDeleteRequest({ ...r, visit_date: r.visit_date, visit_type: r.visit_type, patient_name: r.patientName })}
            aria-label="Delete visit"
            title="Delete this visit"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-100 transition-all active:scale-90"
          >
            <span className="material-symbols-outlined text-lg">delete</span>
          </button>
        )}
      </div>
    </div>
  );
}

const getLocalDateString = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStartOfWeek = (d) => {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

export default function Reminders() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { reminders, stats, loading, refresh, fetchFromServer } = useReminders();

  const [lastSyncText, setLastSyncText] = useState('');
  const [manualSyncing, setManualSyncing] = useState(false);

  useEffect(() => {
    const updateText = () => {
      const ts = localStorage.getItem('last_sync_reminders');
      if (!ts) {
        setLastSyncText('');
        return;
      }
      const diff = Date.now() - Number(ts);
      if (diff < 60_000) {
        setLastSyncText(t('reminders.lastSyncedJustNow'));
      } else {
        const mins = Math.floor(diff / 60_000);
        if (mins < 60) {
          setLastSyncText(mins > 1 ? t('reminders.lastSyncedMinutesAgoPlural', { count: mins }) : t('reminders.lastSyncedMinutesAgo', { count: mins }));
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

  const [activeTab, setActiveTab] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'yesterday', 'this-week', 'this-month', 'custom'
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all', 'pregnancy', 'chronic', 'childcare', 'general'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'overdue', 'today', 'upcoming'

  const { deleteTarget, isDeleting, requestDelete, cancelDelete, confirmDelete } =
    useDeleteVisit({ onDeleted: refresh });

  // ── Client-side Filter Logic ────────────────────────────────────────────────
  const filteredReminders = reminders.filter(r => {
    // 1. Tab Separation
    if (activeTab === 'pending') {
      if (r.status === 'COMPLETED') return false;
    } else {
      if (r.status !== 'COMPLETED') return false;
    }

    // 2. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        (r.patientName || '').toLowerCase().includes(q) ||
        (r.village || '').toLowerCase().includes(q) ||
        (r.visit_type || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }

    // 3. Category Filter
    if (categoryFilter !== 'all') {
      if ((r.patientCategory || '').toLowerCase() !== categoryFilter.toLowerCase()) return false;
    }

    // 4. Status Filter (Only applies to Pending tab)
    if (activeTab === 'pending' && statusFilter !== 'all') {
      if (r.computedStatus !== statusFilter) return false;
    }

    // 5. Date Filter
    if (dateFilter !== 'all') {
      const todayStr = getLocalDateString(new Date());
      const visitDate = r.visit_date; // YYYY-MM-DD

      if (dateFilter === 'today') {
        if (visitDate !== todayStr) return false;
      } else if (dateFilter === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = getLocalDateString(yesterday);
        if (visitDate !== yesterdayStr) return false;
      } else if (dateFilter === 'this-week') {
        const monday = getStartOfWeek(new Date());
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        if (!visitDate) return false;
        const vDateObj = new Date(visitDate);
        if (vDateObj < monday || vDateObj > sunday) return false;
      } else if (dateFilter === 'this-month') {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

        if (!visitDate) return false;
        const vDateObj = new Date(visitDate);
        if (vDateObj < firstDay || vDateObj > lastDay) return false;
      } else if (dateFilter === 'custom') {
        if (!visitDate) return false;
        if (customStart && visitDate < customStart) return false;
        if (customEnd && visitDate > customEnd) return false;
      }
    }

    return true;
  });

  // Count filtered lists to show in tabs dynamically
  const pendingCount = reminders.filter(r => r.status !== 'COMPLETED').length;
  const completedCount = reminders.filter(r => r.status === 'COMPLETED').length;

  return (
    <div className="max-w-screen-xl mx-auto px-6 pt-10 pb-28 font-body">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-5xl font-headline font-bold tracking-tight text-slate-800 mb-2">
            {t('reminders', 'Reminders')}
          </h1>
          <p className="text-slate-500 text-lg font-light">
            {t('reminders.subtitle')}
          </p>
        </div>

        {/* Sync/Refresh Action */}
        <div className="flex flex-col items-end gap-1 self-start md:self-auto">
          <button
            id="btn-sync-reminders"
            disabled={manualSyncing}
            onClick={async () => {
              setManualSyncing(true);
              const toastId = toast.loading(t('reminders.syncingReminders'));
              try {
                const result = await manualSyncReminders();
                let msg = result.message;
                if (result.status === 'success') {
                  msg = t('reminders.syncSuccess', 'Reminders synced successfully');
                  toast.success(msg, { id: toastId });
                  await fetchFromServer();
                } else if (result.status === 'partial') {
                  msg = t('reminders.syncPartial', 'Some reminders synced, some failed. Please try again.');
                  toast.error(msg, { id: toastId });
                  await fetchFromServer();
                } else if (result.status === 'nothing-to-sync') {
                  msg = t('reminders.syncNothing', 'All reminders already synced');
                  toast.success(msg, { id: toastId });
                } else if (result.status === 'offline') {
                  msg = t('reminders.syncOffline', 'You are offline. Connect to the internet to sync pending data.');
                  toast.error(msg, { id: toastId });
                } else if (result.status === 'locked') {
                  msg = t('reminders.syncLocked', 'Sync already in progress.');
                  toast.error(msg, { id: toastId });
                } else {
                  msg = t('reminders.syncFailed', 'Sync failed. Please try again.');
                  toast.error(msg, { id: toastId });
                }
              } catch (err) {
                toast.error(`${t('reminders.syncFailed', 'Sync failed. Please try again.')}: ${err.message}`, { id: toastId });
              } finally {
                setManualSyncing(false);
              }
            }}
            className="flex items-center gap-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200/50 px-5 py-2.5 rounded-xl font-body font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-95"
          >
            <span className={`material-symbols-outlined text-[20px] ${manualSyncing ? 'animate-spin' : ''}`}>sync</span>
            <span>{manualSyncing ? t('reminders.syncingReminders') : t('reminders.syncReminders')}</span>
          </button>
          {lastSyncText && (
            <span className="text-[10px] text-slate-400 font-medium self-end">{lastSyncText}</span>
          )}
        </div>
      </div>

      {/* ── Stats Bar ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {/* Total Card */}
        <div className="glass-card p-5 relative overflow-hidden flex flex-col justify-between min-h-[110px]">
          <div className="flex justify-between items-start">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{t('reminders.statsTotal')}</span>
            <span className="material-symbols-outlined text-slate-400 text-xl">event_note</span>
          </div>
          <span className="text-3xl font-extrabold text-slate-800 mt-2">{loading ? 'NA' : stats.total}</span>
        </div>

        {/* Overdue Card */}
        <div className="glass-card p-5 border-l-4 border-l-red-500 relative overflow-hidden flex flex-col justify-between min-h-[110px]">
          <div className="flex justify-between items-start">
            <span className="text-red-500 text-xs font-bold uppercase tracking-wider">{t('reminders.statsOverdue')}</span>
            <span className="material-symbols-outlined text-red-400 text-xl animate-pulse">warning</span>
          </div>
          <span className="text-3xl font-extrabold text-red-600 mt-2">{loading ? 'NA' : stats.overdue}</span>
        </div>

        {/* Today Card */}
        <div className="glass-card p-5 border-l-4 border-l-blue-500 relative overflow-hidden flex flex-col justify-between min-h-[110px]">
          <div className="flex justify-between items-start">
            <span className="text-blue-500 text-xs font-bold uppercase tracking-wider">{t('reminders.statsToday')}</span>
            <span className="material-symbols-outlined text-blue-400 text-xl">today</span>
          </div>
          <span className="text-3xl font-extrabold text-blue-600 mt-2">{loading ? 'NA' : stats.today}</span>
        </div>

        {/* Upcoming Card */}
        <div className="glass-card p-5 border-l-4 border-l-emerald-500 relative overflow-hidden flex flex-col justify-between min-h-[110px]">
          <div className="flex justify-between items-start">
            <span className="text-emerald-500 text-xs font-bold uppercase tracking-wider">{t('reminders.statsUpcoming')}</span>
            <span className="material-symbols-outlined text-emerald-400 text-xl">event_upcoming</span>
          </div>
          <span className="text-3xl font-extrabold text-emerald-600 mt-2">{loading ? 'NA' : stats.upcoming}</span>
        </div>

        {/* Completed Card */}
        <div className="glass-card p-5 border-l-4 border-l-slate-400 relative overflow-hidden flex flex-col justify-between min-h-[110px]">
          <div className="flex justify-between items-start">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{t('reminders.statsCompleted')}</span>
            <span className="material-symbols-outlined text-slate-400 text-xl">task_alt</span>
          </div>
          <span className="text-3xl font-extrabold text-slate-700 mt-2">{loading ? 'NA' : stats.completed}</span>
        </div>
      </div>

      {/* ── Segmented Tabs ─────────────────────────────────────────────────── */}
      <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8 max-w-sm">
        <button
          onClick={() => {
            setActiveTab('pending');
            setStatusFilter('all');
          }}
          className={`flex-1 py-3 text-center rounded-xl font-bold text-sm transition-all ${
            activeTab === 'pending'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {loading ? t('reminders.tabLoading') : t('reminders.tabPending', { count: pendingCount })}
        </button>
        <button
          onClick={() => {
            setActiveTab('done');
          }}
          className={`flex-1 py-3 text-center rounded-xl font-bold text-sm transition-all ${
            activeTab === 'done'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {loading ? t('reminders.tabLoading') : t('reminders.tabCompleted', { count: completedCount })}
        </button>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <div className="glass-card p-6 mb-8 space-y-4">
        {/* Search & Date Filter Selection */}
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
          <div className="relative flex-grow">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              search
            </span>
            <input
              type="text"
              placeholder={t('reminders.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-100/50 hover:bg-slate-100 focus:bg-white text-slate-800 pl-12 pr-10 py-3 rounded-2xl border border-slate-200/50 focus:border-primary/50 outline-none transition-all font-body text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200/50 transition-all"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            )}
          </div>

          {/* Quick Date Selector */}
          <div className="flex flex-wrap items-center bg-slate-100/50 rounded-2xl border border-slate-200/40 p-1 self-start lg:self-auto overflow-x-auto max-w-full">
            {['all', 'today', 'yesterday', 'this-week', 'this-month', 'custom'].map((dOpt) => (
              <button
                key={dOpt}
                onClick={() => {
                  setDateFilter(dOpt);
                }}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                  dateFilter === dOpt
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {dOpt === 'all' ? t('reminders.dateFilterAll') :
                 dOpt === 'today' ? t('reminders.dateFilterToday') :
                 dOpt === 'yesterday' ? t('reminders.dateFilterYesterday') :
                 dOpt === 'this-week' ? t('reminders.dateFilterWeek') :
                 dOpt === 'this-month' ? t('reminders.dateFilterMonth') :
                 t('reminders.dateFilterCustom')}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Inputs if custom is selected */}
        {dateFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 bg-slate-50/50 p-3 rounded-2xl border border-slate-200/50 animate-fadeIn">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('reminders.dateRangeLabel')}</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-sm outline-none text-slate-700"
            />
            <span className="text-slate-400 text-sm">{t('reminders.dateFilterTo')}</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-sm outline-none text-slate-700"
            />
            {(customStart || customEnd) && (
              <button
                onClick={() => {
                  setCustomStart('');
                  setCustomEnd('');
                }}
                className="text-xs text-rose-600 font-bold hover:underline ml-auto"
              >
                {t('reminders.clearRange')}
              </button>
            )}
          </div>
        )}

        {/* Filter Chips for Category and Status */}
        <div className="flex flex-col gap-3 pt-3 border-t border-slate-100">
          {/* Category Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">{t('reminders.categoryLabel')}</span>
            {['all', 'pregnancy', 'chronic', 'childcare', 'general'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                  categoryFilter === cat
                    ? 'bg-teal-700 text-white border-teal-700 shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}
              >
                {cat === 'all' ? t('reminders.statusAll') : t(`category.${cat.toLowerCase()}`, cat.charAt(0).toUpperCase() + cat.slice(1))}
              </button>
            ))}
          </div>

          {/* Status Chips (only for pending tab) */}
          {activeTab === 'pending' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2">{t('reminders.statusLabel')}</span>
              {['all', 'overdue', 'today', 'upcoming'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                    statusFilter === st
                      ? st === 'overdue'
                        ? 'bg-red-500 text-white border-red-500 shadow-sm'
                        : st === 'today'
                        ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                        : 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {st === 'all' ? t('reminders.statusAll') : st === 'overdue' ? t('reminders.statusOverdue') : st === 'today' ? t('reminders.statsToday') : t('reminders.statsUpcoming')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Loading Skeletons ───────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-surface-container rounded-2xl animate-pulse border-l-8 border-slate-200/50" />
          ))}
        </div>
      )}

      {/* ── List Content ───────────────────────────────────────────────────── */}
      {!loading && (
        <>
          {filteredReminders.length === 0 ? (
            /* Empty State */
            <div className="mt-12 flex flex-col items-center justify-center text-center p-12 bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 bg-slate-50 border border-slate-100 shadow-inner">
                {activeTab === 'pending' ? (
                  <svg className="w-10 h-10 text-teal-600/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                ) : (
                  <svg className="w-10 h-10 text-amber-500/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                )}
              </div>
              <h3 className="text-2xl font-bold text-slate-700 mb-2">
                {activeTab === 'pending' ? t('reminders.noPendingVisits') : t('reminders.noCompletedVisits')}
              </h3>
              <p className="text-slate-400 max-w-md mx-auto text-sm mb-6">
                {activeTab === 'pending' 
                  ? t('reminders.allCaughtUp') 
                  : t('reminders.noCompletedVisitsDesc')}
              </p>
              {activeTab === 'pending' && (
                <button
                  onClick={() => navigate('/')}
                  className="btn-primary"
                >
                  <span className="material-symbols-outlined text-lg">add_circle</span>
                  {t('reminders.scheduleAVisit')}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {activeTab === 'pending'
                ? filteredReminders.map((r) => (
                    <PendingCard key={r.local_id || r.id} r={r} navigate={navigate} t={t} onDeleteRequest={requestDelete} />
                  ))
                : filteredReminders.map((r) => (
                    <CompletedCard key={r.local_id || r.id} r={r} navigate={navigate} t={t} onDeleteRequest={requestDelete} />
                  ))}
            </div>
          )}
        </>
      )}

      {/* Delete Visit Confirmation Modal */}
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
