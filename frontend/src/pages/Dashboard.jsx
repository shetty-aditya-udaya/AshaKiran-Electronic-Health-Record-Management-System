/**
 * AshaKiran Dashboard — Fully Dynamic Real-Time Analytics
 *
 * Data strategy:
 *  1. IndexedDB (instant, offline-first) → local analytics computed from Dexie
 *  2. Backend GET /api/dashboard/analytics → authoritative server data when online
 *
 * ZERO hardcoded values. Every card, chart, feed, and alert
 * comes from authenticated real data for the logged-in ASHA worker.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { getLocalDashboardAnalytics } from '../lib/db';
import { syncAll } from '../lib/syncService';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../context/ConnectionContext';
import {
  Users, Bell, FolderHeart, Activity, AlertTriangle, CheckCircle2,
  ChevronRight, Calendar, MapPin, Clock, RefreshCw, UserPlus,
  Stethoscope, ClipboardList, Syringe, Heart, CalendarDays,
  FilePlus2, PlusCircle, Wifi, WifiOff, TrendingUp, Inbox,
} from 'lucide-react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getDateStr() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function pctOf(val, total) {
  return total > 0 ? Math.min(100, Math.max(0, Math.round((val / total) * 100))) : 0;
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = (Date.now() - new Date(ts)) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hrs ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SPARKLINE (inline SVG mini-chart)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Sparkline({ data, color = '#14b8a6', width = 80, height = 28 }) {
  if (!data || data.length < 2) {
    // Flat line placeholder when no trend data
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2}
          stroke="#E2E8F0" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const areaPath = `M${pts[0]} L${pts.join(' L')} L${width},${height} L0,${height} Z`;
  const uid = `sg${color.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${uid})`} />
      <polyline points={pts.join(' ')} stroke={color} strokeWidth="1.8"
        fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DONUT CHART
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DonutChart({ segments, size = 130, strokeWidth = 22, label, sublabel, isEmpty }) {
  const r     = (size - strokeWidth) / 2;
  const circ  = 2 * Math.PI * r;
  const cx = size / 2, cy = size / 2;
  const gapFrac = 1.5 / 360;
  let offset = 0;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={strokeWidth} />
        {!isEmpty && segments.map((seg, i) => {
          const frac = Math.max(0, seg.pct / 100 - gapFrac);
          const dash = frac * circ;
          const el = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circ}`}
              strokeDashoffset={-offset * circ}
              strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)' }}
            />
          );
          offset += seg.pct / 100;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {isEmpty
          ? <span className="text-[10px] text-slate-400 font-medium text-center px-2 leading-tight">No data</span>
          : <>
              {label && <span className="text-xl font-bold text-slate-800 leading-none">{label}</span>}
              {sublabel && <span className="text-[10px] text-slate-400 font-medium mt-0.5">{sublabel}</span>}
            </>
        }
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LINE CHART (Monthly Overview)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LineChart({ series, labels, width = 340, height = 160, empty }) {
  const padL = 32, padR = 12, padT = 12, padB = 28;
  const W = width - padL - padR;
  const H = height - padT - padB;

  if (empty) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-slate-400 font-medium">
        No monthly data available yet
      </div>
    );
  }

  const allVals = series.flatMap(s => s.data);
  const maxV = Math.max(...allVals, 1);
  const xOf = (i) => padL + (i / Math.max(labels.length - 1, 1)) * W;
  const yOf = (v) => padT + H - (v / maxV) * H;
  const makePath = (data) =>
    data.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const makeArea = (data) => {
    const line = makePath(data);
    const end = `L${xOf(data.length - 1).toFixed(1)},${(padT + H).toFixed(1)} L${padL},${(padT + H).toFixed(1)} Z`;
    return line + ' ' + end;
  };
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * maxV));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`lca${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.14" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
          </linearGradient>
        ))}
      </defs>
      {gridLines.map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={yOf(v)} x2={padL + W} y2={yOf(v)} stroke="#F1F5F9" strokeWidth="1" />
          <text x={padL - 4} y={yOf(v) + 4} textAnchor="end" fontSize="9" fill="#94A3B8">{v}</text>
        </g>
      ))}
      {labels.map((lbl, i) => {
        const show = i === 0 || i === Math.floor((labels.length - 1) / 2) || i === labels.length - 1;
        return show ? (
          <text key={i} x={xOf(i)} y={padT + H + 16} textAnchor="middle" fontSize="9" fill="#94A3B8">{lbl}</text>
        ) : null;
      })}
      {series.map((s, i) => (
        <path key={i} d={makeArea(s.data)} fill={`url(#lca${i})`} />
      ))}
      {series.map((s, i) => (
        <path key={i} d={makePath(s.data)} stroke={s.color} strokeWidth="2"
          fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {series.map((s, i) => (
        <circle key={i} cx={xOf(s.data.length - 1)} cy={yOf(s.data[s.data.length - 1])}
          r="3" fill={s.color} stroke="white" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SKELETON
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Skel({ className = '' }) {
  return <div className={`rounded-xl animate-pulse bg-slate-100 ${className}`} />;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EMPTY STATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function EmptyState({ icon: Icon, message, action, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-2">
        <Icon size={18} className="text-slate-400" />
      </div>
      <p className="text-xs font-medium text-slate-400 leading-snug">{message}</p>
      {action && (
        <button onClick={onAction}
          className="mt-2 text-[11px] font-semibold text-teal-600 hover:text-teal-800 transition-colors">
          {action}
        </button>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACTIVITY ICON MAP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ACTIVITY_META = {
  patient_registered: { icon: UserPlus,     bg: '#EFF8F7', color: '#0F766E' },
  visit_completed:    { icon: CheckCircle2, bg: '#F0FDF4', color: '#16A34A' },
  report_added:       { icon: FilePlus2,    bg: '#EFF6FF', color: '#2563EB' },
  reminder_done:      { icon: Bell,         bg: '#FFFBEB', color: '#D97706' },
  default:            { icon: Activity,     bg: '#F5F3FF', color: '#7C3AED' },
};

const ALERT_META = {
  high_risk:       { icon: AlertTriangle, bg: '#FFF1F2', color: '#F43F5E', path: '/patients' },
  overdue_followup:{ icon: Clock,         bg: '#FFF1F2', color: '#F43F5E', path: '/reminders' },
  followup_due:    { icon: Clock,         bg: '#FFFBEB', color: '#D97706', path: '/reminders' },
  default:         { icon: Bell,          bg: '#EFF6FF', color: '#2563EB', path: '/reminders' },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STAT CARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StatCard({ label, value, sub, subColor, icon: Icon, iconBg, iconColor, sparkData, sparkColor, onClick }) {
  const displayValue = value === null || value === undefined ? 'NA' : String(value).padStart(2, '0');
  return (
    <button onClick={onClick}
      className="group w-full text-left bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md hover:border-slate-200 transition-all duration-200 flex flex-col gap-3"
      style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <Icon size={17} style={{ color: iconColor }} />
        </div>
        <span className="text-xs font-semibold text-slate-500">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-3xl font-bold text-slate-900 tabular-nums leading-none">{displayValue}</span>
        <Sparkline data={sparkData} color={sparkColor} width={80} height={28} />
      </div>
      <p className="text-[11px] font-semibold" style={{ color: subColor || '#64748B' }}>{sub}</p>
    </button>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NULL STATE for analytics (first time user, no data at all)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NULL_ANALYTICS = {
  stats: {
    totalPatients: 0, todayVisits: 0, pendingVisitsToday: 0,
    followUpsDue: 0, overdueFollowUps: 0, highRiskCount: 0,
    visitsCompletedCount: 0, highRisk: 0, remindersCount: 0,
  },
  distribution: { general: 0, maternal: 0, child: 0, chronic: 0, highRisk: 0 },
  conditions:    [],
  monthlyTrend:  [],
  recentActivities: [],
  todaySchedule: [],
  alerts:        [],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isServerReachable, serverStatus } = useConnection();
  const [user, setUser] = useState(null);

  // Analytics state
  const [analytics, setAnalytics] = useState(NULL_ANALYTICS);
  const [loading,   setLoading]   = useState(true);
  const [lastSync,  setLastSync]  = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dataSource, setDataSource] = useState('local'); // 'local' | 'server'

  useEffect(() => {
    setUser(JSON.parse(localStorage.getItem('user')) || null);
  }, []);

  // ── Local IndexedDB calculation (Single Source of Truth) ──────────────────
  const fetchAnalytics = useCallback(async (source = 'direct') => {
    console.log(`[Dashboard DEBUG] fetchAnalytics called from source: ${source}`);
    try {
      const local = await getLocalDashboardAnalytics();
      setAnalytics(local);
      setLastSync(new Date());
      setDataSource('local');
    } catch (err) {
      console.warn('[Dashboard] Local analytics calculation failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAnalytics('mount'); }, [fetchAnalytics]);

  // Refresh on local DB writes and vital patient/visit mutations
  useEffect(() => {
    const handleEvent = (e) => fetchAnalytics(`event:${e.type}`);
    window.addEventListener('local-data-written', handleEvent);
    window.addEventListener('visit-added', handleEvent);
    window.addEventListener('visit-completed', handleEvent);
    window.addEventListener('visit-deleted', handleEvent);
    window.addEventListener('patient-added', handleEvent);
    window.addEventListener('patient-deleted', handleEvent);
    window.addEventListener('user-logged-in', handleEvent);
    window.addEventListener('user-logged-out', handleEvent);
    return () => {
      window.removeEventListener('local-data-written', handleEvent);
      window.removeEventListener('visit-added', handleEvent);
      window.removeEventListener('visit-completed', handleEvent);
      window.removeEventListener('visit-deleted', handleEvent);
      window.removeEventListener('patient-added', handleEvent);
      window.removeEventListener('patient-deleted', handleEvent);
      window.removeEventListener('user-logged-in', handleEvent);
      window.removeEventListener('user-logged-out', handleEvent);
    };
  }, [fetchAnalytics]);

  // Auto-refresh when server comes back online
  useEffect(() => {
    const handleServerOnline = () => { if (isServerReachable) fetchAnalytics('server-online-event'); };
    window.addEventListener('server-online', handleServerOnline);
    return () => window.removeEventListener('server-online', handleServerOnline);
  }, [fetchAnalytics, isServerReachable]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (isServerReachable) {
        await syncAll();
      }
    } catch (err) {
      console.warn('[Dashboard] Refresh sync failed:', err);
    }
    await fetchAnalytics('manual-refresh');
    setTimeout(() => setRefreshing(false), 700);
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const { stats, distribution, conditions, monthlyTrend, recentActivities, todaySchedule, alerts } = analytics;

  const displayName  = user?.name || 'ASHA Worker';
  const locationText = [user?.village, user?.district].filter(Boolean).join(', ') || null;

  // Sparkline data from monthly trend
  const patientsMonthly  = monthlyTrend.map(m => m.patientsAdded  || 0);
  const visitsMonthly    = monthlyTrend.map(m => m.visitsCompleted || 0);

  // Patient distribution donut
  const distTotal = distribution.general + distribution.maternal + distribution.child + distribution.chronic + distribution.highRisk;
  const donutEmpty = distTotal === 0;
  const donutSegments = donutEmpty ? [] : [
    { pct: pctOf(distribution.general,  distTotal), color: '#14B8A6' },
    { pct: pctOf(distribution.maternal, distTotal), color: '#6366F1' },
    { pct: pctOf(distribution.child,    distTotal), color: '#F97316' },
    { pct: pctOf(distribution.chronic,  distTotal), color: '#A855F7' },
    { pct: pctOf(distribution.highRisk, distTotal), color: '#F43F5E' },
  ];

  // Monthly chart
  const monthLabels   = monthlyTrend.map(m => m.month);
  const chartEmpty    = monthlyTrend.length === 0 || (patientsMonthly.every(v => v === 0) && visitsMonthly.every(v => v === 0));

  // Quick actions
  const quickActions = [
    { icon: UserPlus,      label: 'Register Patient', color: '#0F766E', bg: '#EFF8F7', path: '/patients' },
    { icon: PlusCircle,    label: 'Add Visit',        color: '#2563EB', bg: '#EFF6FF', path: '/patients' },
    { icon: FolderHeart,   label: 'Health Record',    color: '#7C3AED', bg: '#F5F3FF', path: '/reports' },
    { icon: Bell,          label: 'Reminders',        color: '#D97706', bg: '#FFFBEB', path: '/reminders' },
    { icon: Activity,      label: 'Reports',          color: '#F43F5E', bg: '#FFF1F2', path: '/reports' },
    { icon: ClipboardList, label: 'Programs',         color: '#0EA5E9', bg: '#F0F9FF', path: '/programmes' },
  ];

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-2"><Skel className="h-8 w-64" /><Skel className="h-4 w-40" /></div>
          <Skel className="h-8 w-44" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0,1,2,3].map(i=><Skel key={i} className="h-36"/>)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {[0,1,2].map(i=><Skel key={i} className="h-72"/>)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {[0,1,2].map(i=><Skel key={i} className="h-64"/>)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>
      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-5 pb-28 md:pb-10 space-y-5">

        {/* ══════════════════════════════════════════════════════════════════
            HEADER
        ══════════════════════════════════════════════════════════════════ */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl md:text-[26px] font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Namaste, {displayName} <span>👋</span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
              {locationText && <MapPin size={12} className="text-slate-400 flex-shrink-0" />}
              Here&apos;s what&apos;s happening
              {locationText ? ` in ${locationText}` : ''} today.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Sync status pill */}
            <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${
              serverStatus === 'online'   ? 'bg-emerald-50 text-emerald-700' :
              serverStatus === 'checking' ? 'bg-sky-50 text-sky-700' :
                                           'bg-amber-50 text-amber-700'
            }`}>
              {serverStatus === 'online' ? (
                <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{dataSource === 'server' ? '● Server Online · All Synced' : '● Server Online'}</>
              ) : serverStatus === 'checking' ? (
                <><RefreshCw size={10} className="animate-spin" /> Checking…</>
              ) : (
                <><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Offline · Local Data</>
              )}
            </div>

            <button onClick={handleRefresh}
              className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-all"
              title="Refresh dashboard">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>

            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
              style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <CalendarDays size={14} className="text-slate-400" />
              {getDateStr()}
            </div>
          </div>
        </header>

        {/* ══════════════════════════════════════════════════════════════════
            STAT CARDS — all from real backend data
        ══════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Patients"
            value={stats.totalPatients}
            sub={stats.totalPatients === 0 ? 'No patients registered' : `${stats.totalPatients} in registry`}
            subColor={stats.totalPatients === 0 ? '#94A3B8' : '#16A34A'}
            icon={Users} iconBg="#EFF8F7" iconColor="#0F766E"
            sparkData={patientsMonthly}
            sparkColor="#14B8A6"
            onClick={() => navigate('/patients')}
          />
          <StatCard
            label="Today's Visits"
            value={stats.todayVisits}
            sub={stats.todayVisits === null
              ? 'No visits scheduled'
              : stats.pendingVisitsToday > 0
              ? `+${stats.pendingVisitsToday} pending today`
              : 'All completed'}
            subColor={stats.todayVisits === null ? '#94A3B8' : stats.pendingVisitsToday > 0 ? '#D97706' : '#16A34A'}
            icon={CalendarDays} iconBg="#EFF6FF" iconColor="#2563EB"
            sparkData={visitsMonthly}
            sparkColor="#6366F1"
            onClick={() => navigate('/reminders')}
          />
          <StatCard
            label="Follow-ups Due"
            value={stats.followUpsDue}
            sub={stats.overdueFollowUps > 0
              ? `${stats.overdueFollowUps} overdue`
              : stats.followUpsDue === 0 ? 'None due' : 'Requires attention'}
            subColor={stats.overdueFollowUps > 0 ? '#F43F5E' : stats.followUpsDue > 0 ? '#D97706' : '#16A34A'}
            icon={Clock} iconBg="#FFFBEB" iconColor="#D97706"
            sparkData={[]}
            sparkColor="#F97316"
            onClick={() => navigate('/reminders')}
          />
          <StatCard
            label="High Risk Cases"
            value={stats.highRiskCount}
            sub={stats.highRiskCount === null 
              ? 'No patients registered' 
              : stats.highRiskCount === 0 
              ? 'All patients stable' 
              : 'Under monitoring'}
            subColor={stats.highRiskCount > 0 ? '#F43F5E' : '#16A34A'}
            icon={AlertTriangle} iconBg="#FFF1F2" iconColor="#F43F5E"
            sparkData={[]}
            sparkColor="#F43F5E"
            onClick={() => navigate('/patients')}
          />
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            MIDDLE ROW: Activities | Schedule | Quick Actions + Alerts
        ══════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Recent Activities (real from DB) ── */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5"
            style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800">Recent Activities</h2>
              <button onClick={() => navigate('/reminders')}
                className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition-colors">
                View all
              </button>
            </div>

            {recentActivities.length === 0 ? (
              <EmptyState icon={Inbox} message="No recent activity yet.&#10;Register a patient to get started."
                action="Register Patient" onAction={() => navigate('/patients/add')} />
            ) : (
              <div className="space-y-0">
                {recentActivities.map((a, i) => {
                  const meta = ACTIVITY_META[a.type] || ACTIVITY_META.default;
                  const Icon = meta.icon;
                  return (
                    <div key={i} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: meta.bg }}>
                        <Icon size={14} style={{ color: meta.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold text-slate-800 leading-tight">{a.title}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{a.detail}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium flex-shrink-0 whitespace-nowrap">
                        {timeAgo(a.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Today's Schedule (real visits + reminders) ── */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5"
            style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800">Today&apos;s Schedule</h2>
              <button onClick={() => navigate('/reminders')}
                className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition-colors">
                View calendar
              </button>
            </div>

            {todaySchedule.length === 0 ? (
              <EmptyState icon={Calendar} message="No visits or follow-ups scheduled for today."
                action="Add Visit" onAction={() => navigate('/reminders')} />
            ) : (
              <div className="space-y-0">
                {todaySchedule.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
                    <span className="text-[10.5px] font-semibold text-slate-400 w-[68px] flex-shrink-0 pt-0.5">
                      {s.time}
                    </span>
                    <div className="flex flex-col items-center flex-shrink-0 pt-1">
                      <span className="w-2.5 h-2.5 rounded-full"
                        style={{
                          background: s.status === 'completed' ? '#14B8A6' :
                                      s.status === 'missed'    ? '#F43F5E' : '#CBD5E1'
                        }}
                      />
                      {i < todaySchedule.length - 1 && (
                        <div className="w-px mt-1" style={{ height: 20, background: '#F1F5F9' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[12.5px] font-semibold text-slate-800 leading-tight">{s.title}</p>
                        <p className="text-[10.5px] text-slate-400 mt-0.5 truncate">{s.place}</p>
                      </div>
                      <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 border ${
                        s.status === 'completed'
                          ? 'bg-teal-50 text-teal-700 border-teal-200'
                          : s.status === 'overdue'
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : s.status === 'pending'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                        {s.status === 'completed' ? 'Completed' : 
                         s.status === 'overdue' ? 'Overdue' : 
                         s.status === 'pending' ? 'Today/Pending' : 'Upcoming'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Quick Actions + Real Alerts ── */}
          <div className="flex flex-col gap-5">

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5"
              style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
              <h2 className="text-sm font-bold text-slate-800 mb-3">Quick Actions</h2>
              <div className="grid grid-cols-3 gap-2">
                {quickActions.map((qa, i) => (
                  <button key={i} onClick={() => navigate(qa.path)}
                    className="group flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-slate-50 transition-all">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"
                      style={{ background: qa.bg }}>
                      <qa.icon size={17} style={{ color: qa.color }} />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">{qa.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Alerts & Notifications — REAL data only */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 flex-1"
              style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-800">Alerts &amp; Notifications</h2>
                {alerts.length > 0 && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                    {alerts.length} alert{alerts.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {alerts.length === 0 ? (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle2 size={13} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[11.5px] font-semibold text-emerald-800">All clear!</p>
                    <p className="text-[10.5px] text-emerald-600 mt-0.5">No alerts for your patients today.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {alerts.map((a, i) => {
                    const meta = ALERT_META[a.type] || ALERT_META.default;
                    const Icon = meta.icon;
                    return (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: meta.bg }}>
                          <Icon size={13} style={{ color: meta.color }} />
                        </div>
                        <div>
                          <p className="text-[11.5px] font-medium text-slate-700 leading-snug">{a.message}</p>
                          <button onClick={() => navigate(meta.path)}
                            className="text-[10.5px] font-semibold mt-0.5 hover:opacity-80 transition-opacity"
                            style={{ color: meta.color }}>
                            View details →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            BOTTOM ROW: Distribution | Monthly Overview | Conditions
        ══════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Patient Distribution (real categories) ── */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5"
            style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Patient Distribution</h2>

            {donutEmpty ? (
              <div className="flex flex-col items-center gap-4">
                <DonutChart segments={[]} size={130} strokeWidth={22} isEmpty />
                <p className="text-xs text-slate-400 text-center font-medium">
                  No patient data available.
                  <br />Register patients to see distribution.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-5">
                <DonutChart segments={donutSegments} size={130} strokeWidth={22}
                  label={distTotal} sublabel="Total" />
                <div className="flex flex-col gap-2.5 flex-1">
                  {[
                    { label: 'General',        count: distribution.general,  pct: pctOf(distribution.general,  distTotal), color: '#14B8A6' },
                    { label: 'Maternal Health', count: distribution.maternal, pct: pctOf(distribution.maternal, distTotal), color: '#6366F1' },
                    { label: 'Child Health',   count: distribution.child,    pct: pctOf(distribution.child,    distTotal), color: '#F97316' },
                    { label: 'Chronic Care',   count: distribution.chronic,  pct: pctOf(distribution.chronic,  distTotal), color: '#A855F7' },
                    { label: 'High Risk',      count: distribution.highRisk, pct: pctOf(distribution.highRisk, distTotal), color: '#F43F5E' },
                  ].filter(r => r.count > 0).map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: row.color }} />
                      <span className="text-[11px] font-medium text-slate-600 flex-1">{row.label}</span>
                      <span className="text-[11px] font-bold text-slate-800 tabular-nums">
                        {row.count} <span className="text-slate-400 font-normal">({row.pct}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Monthly Overview (real trend from DB) ── */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5"
            style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-slate-800">Monthly Overview</h2>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                  <span className="w-2.5 h-1 rounded-full inline-block" style={{ background: '#14B8A6' }} />
                  Patients Added
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                  <span className="w-2.5 h-1 rounded-full inline-block" style={{ background: '#6366F1' }} />
                  Visits Done
                </span>
              </div>
            </div>
            <LineChart
              series={[
                { data: patientsMonthly, color: '#14B8A6' },
                { data: visitsMonthly,   color: '#6366F1' },
              ]}
              labels={monthLabels}
              width={340} height={168}
              empty={chartEmpty}
            />
            {lastSync && (
              <p className="text-[10px] text-slate-400 mt-1 text-right">
                Updated {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          {/* ── Top Health Conditions (real diseases from patient records) ── */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5"
            style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Top Health Conditions</h2>

            {conditions.length === 0 ? (
              <EmptyState icon={Stethoscope}
                message="No condition analytics available yet.&#10;Complete patient records to see trends."
                action="View Patients" onAction={() => navigate('/patients')} />
            ) : (
              <div className="space-y-4">
                {conditions.map((c, i) => {
                  const COND_COLORS = ['#F43F5E', '#F97316', '#6366F1', '#14B8A6', '#A855F7'];
                  const color = COND_COLORS[i % COND_COLORS.length];
                  const totalCount = conditions.reduce((s, x) => s + x.count, 0);
                  const pct  = pctOf(c.count, totalCount);
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12.5px] font-semibold text-slate-700">{c.name}</span>
                        <span className="text-[12.5px] font-bold text-slate-800">{pct}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-1000"
                          style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{c.count} patient{c.count > 1 ? 's' : ''}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
