import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { getLocalDashboardStats } from '../lib/db';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../context/ConnectionContext';
import {
  LayoutDashboard, Users, Bell, FolderHeart, Activity,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  ChevronRight, ArrowUpRight, Calendar, MapPin,
  Heart, ShieldCheck, Clock, Wifi, WifiOff, RefreshCw,
  Stethoscope, ClipboardList, UserPlus, Syringe,
} from 'lucide-react';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getDateStr() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function pctOf(val, total) {
  return total > 0 ? Math.min(100, Math.max(0, Math.round((val / total) * 100))) : 0;
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────

function DonutChart({ segments, size = 140, strokeWidth = 18 }) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
      {/* Background track */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="#F1F5F9"
        strokeWidth={strokeWidth}
      />
      {segments.map((seg, i) => {
        const dash = (seg.pct / 100) * circumference;
        const el = (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${circumference}`}
            strokeDashoffset={-offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)' }}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }) {
  return (
    <div
      className={`rounded-xl animate-pulse ${className}`}
      style={{ background: 'linear-gradient(90deg,#f0f0f0 25%,#e4e4e4 50%,#f0f0f0 75%)', backgroundSize: '200% 100%' }}
    />
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, iconBg, trend, trendLabel, accent, onClick, sublabel }) {
  return (
    <button
      onClick={onClick}
      className="group relative w-full text-left p-5 rounded-2xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2"
      style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.04)', '--tw-ring-color': accent }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          <Icon size={18} style={{ color: accent }} />
        </div>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: iconBg, color: accent }}
        >
          <ArrowUpRight size={11} /> View
        </span>
      </div>

      <p className="text-2xl font-bold text-slate-900 mb-0.5 tabular-nums">
        {String(value).padStart(2, '0')}
      </p>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>

      {sublabel && (
        <p className="text-[11px] text-slate-400 mt-1">{sublabel}</p>
      )}

      {/* Thin accent bottom bar */}
      <div className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: accent }} />
    </button>
  );
}

// ─── Alert Row ───────────────────────────────────────────────────────────────

function AlertRow({ icon: Icon, iconBg, iconColor, title, subtitle, accentBar, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group w-full flex items-center gap-3.5 p-3.5 rounded-xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all duration-150 text-left"
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg, borderLeft: `3px solid ${iconColor}` }}
      >
        <Icon size={15} style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{title}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{subtitle}</p>
      </div>
      <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
    </button>
  );
}

// ─── Quick Action Button ──────────────────────────────────────────────────────

function QuickActionBtn({ icon: Icon, label, accent, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all duration-150 w-full text-center"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-200"
        style={{ background: `${accent}15` }}
      >
        <Icon size={18} style={{ color: accent }} />
      </div>
      <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-900 transition-colors leading-tight">{label}</span>
    </button>
  );
}

// ─── Connection Pill ─────────────────────────────────────────────────────────

function ConnectionPill({ isOnline }) {
  return (
    <span
      className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${
        isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}
      />
      {isOnline ? 'Live' : 'Offline'}
    </span>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isServerReachable } = useConnection();
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(JSON.parse(localStorage.getItem('user')) || null);
  }, []);

  const [stats, setStats] = useState({
    totalPatients: 0, highRisk: 0, remindersCount: 0, visitsCompletedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const localStats = await getLocalDashboardStats();
      setStats(localStats);
      setLoading(false);

      if (isServerReachable) {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/programmes/summary`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const d = await res.json();
          setStats({
            totalPatients:        d.totalPatients        || 0,
            highRisk:             d.highRisk             || 0,
            remindersCount:       d.remindersCount       || 0,
            visitsCompletedCount: d.visitsCompletedCount || 0,
          });
          setLastSync(new Date());
        }
      }
    } catch (err) {
      console.warn('[Dashboard] Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }, [isServerReachable]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    const handle = () => fetchStats();
    window.addEventListener('local-data-written', handle);
    window.addEventListener('visit-added', handle);
    window.addEventListener('patient-added', handle);
    return () => {
      window.removeEventListener('local-data-written', handle);
      window.removeEventListener('visit-added', handle);
      window.removeEventListener('patient-added', handle);
    };
  }, [fetchStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setTimeout(() => setRefreshing(false), 600);
  };

  // Derived stats
  const stableCases = Math.max(0, stats.totalPatients - stats.highRisk);
  const visitsDone  = stats.visitsCompletedCount || 0;
  const stablePct   = pctOf(stableCases, stats.totalPatients);
  const highRiskPct = pctOf(stats.highRisk, stats.totalPatients);

  const locationText = [
    user?.village  ? user.village  : null,
    user?.district ? user.district : null,
  ].filter(Boolean).join(', ') || 'Your Area';

  const displayName = user?.name || 'ASHA Worker';

  // Donut segments (stable = emerald, high risk = rose, visited = teal)
  const totalForChart = Math.max(stats.totalPatients, 1);
  const donutSegments = [
    { pct: pctOf(stableCases, totalForChart), color: '#10B981' },
    { pct: pctOf(stats.highRisk, totalForChart), color: '#F43F5E' },
  ];

  // ── Loading State ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFC' }}>

      {/* ── Main Content ── */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 pt-6 pb-28 md:pb-10 space-y-6">

        {/* ── Header Row ── */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                {getDateStr()}
              </span>
              <ConnectionPill isOnline={isServerReachable} />
            </div>
            <h1 className="text-2xl md:text-[28px] font-bold text-slate-900 tracking-tight">
              {getTimeGreeting()}, {displayName} 👋
            </h1>
            {locationText !== 'Your Area' && (
              <p className="flex items-center gap-1 text-xs text-slate-400 mt-1 font-medium">
                <MapPin size={11} /> {locationText}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-white hover:border-slate-300 transition-all"
              title="Refresh data"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => navigate('/patients/add')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-md active:scale-95"
              style={{ background: 'linear-gradient(135deg, #0F766E, #0D9488)' }}
            >
              <UserPlus size={15} />
              <span className="hidden sm:inline">Add Patient</span>
            </button>
          </div>
        </header>

        {/* ── Four Stat Cards ── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="db-card-animate">
          <StatCard
            label="Total Patients"
            value={stats.totalPatients}
            icon={Users}
            iconBg="#EFF8F7"
            accent="#0F766E"
            sublabel="Managed in registry"
            onClick={() => navigate('/patients')}
          />
          </div>
          <div className="db-card-animate">
          <StatCard
            label="Stable Cases"
            value={stableCases}
            icon={ShieldCheck}
            iconBg="#F0FDF4"
            accent="#16A34A"
            sublabel={`${stablePct}% of total`}
            onClick={() => navigate('/patients')}
          />
          </div>
          <div className="db-card-animate">
          <StatCard
            label="High-Risk"
            value={stats.highRisk}
            icon={AlertTriangle}
            iconBg="#FFF1F2"
            accent="#F43F5E"
            sublabel={stats.highRisk > 0 ? 'Needs immediate care' : 'All patients stable'}
            onClick={() => navigate('/patients')}
          />
          </div>
          <div className="db-card-animate">
          <StatCard
            label="Visits Done"
            value={visitsDone}
            icon={Activity}
            iconBg="#EFF6FF"
            accent="#2563EB"
            sublabel="Completed visits"
            onClick={() => navigate('/reminders')}
          />
          </div>
        </section>

        {/* ── Three-column Content Grid ── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Col 1 + 2: Activity Feed + Patient Summary ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Activity & Alerts header */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">
                Today's Activity
              </h2>
              <button
                onClick={() => navigate('/reminders')}
                className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1 transition-colors"
              >
                View schedule <ChevronRight size={13} />
              </button>
            </div>

            {/* Alert rows */}
            <div className="space-y-2.5">
              {/* High-risk alert */}
              {stats.highRisk > 0 ? (
                <AlertRow
                  icon={AlertTriangle}
                  iconBg="#FFF1F2"
                  iconColor="#F43F5E"
                  title={`${stats.highRisk} High-Risk Patient${stats.highRisk > 1 ? 's' : ''} Need Attention`}
                  subtitle="Immediate follow-up recommended"
                  onClick={() => navigate('/patients')}
                />
              ) : (
                <AlertRow
                  icon={CheckCircle2}
                  iconBg="#F0FDF4"
                  iconColor="#16A34A"
                  title="No Critical Alerts"
                  subtitle="All high-risk patients are currently stable"
                  onClick={() => navigate('/patients')}
                />
              )}

              {/* Pending visits */}
              {stats.remindersCount > 0 ? (
                <AlertRow
                  icon={Clock}
                  iconBg="#FFFBEB"
                  iconColor="#D97706"
                  title={`${stats.remindersCount} Visit${stats.remindersCount > 1 ? 's' : ''} Pending`}
                  subtitle="Scheduled checkups require updates today"
                  onClick={() => navigate('/reminders')}
                />
              ) : (
                <AlertRow
                  icon={CheckCircle2}
                  iconBg="#F0FDF4"
                  iconColor="#16A34A"
                  title="All Visits Completed"
                  subtitle="You're fully up to date with today's schedule"
                  onClick={() => navigate('/reminders')}
                />
              )}

              {/* Total patients info */}
              <AlertRow
                icon={Users}
                iconBg="#EFF8F7"
                iconColor="#0F766E"
                title={`${stats.totalPatients} Patients in Registry`}
                subtitle="Secure offline records — encrypted & synced"
                onClick={() => navigate('/patients')}
              />
            </div>

            {/* ── Cloud Sync Card ── */}
            <div
              className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100"
              style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
                  {isServerReachable
                    ? <Wifi size={16} className="text-teal-700" />
                    : <WifiOff size={16} className="text-amber-600" />
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {isServerReachable ? 'Aiven Cloud Sync' : 'Offline Mode'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isServerReachable
                      ? lastSync ? `Last synced ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'All records encrypted & backed up'
                      : 'Working with local data — will sync when online'
                    }
                  </p>
                </div>
              </div>
              <span
                className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${
                  isServerReachable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isServerReachable ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                {isServerReachable ? 'Live' : 'Offline'}
              </span>
            </div>

            {/* ── Today's Schedule CTA ── */}
            <button
              onClick={() => navigate('/reminders')}
              className="w-full flex items-center justify-between p-5 rounded-2xl border border-dashed border-teal-200 hover:border-teal-400 hover:bg-teal-50/50 transition-all group"
              style={{ background: 'linear-gradient(135deg, #F0FDFA 0%, #ECFDF5 100%)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
                  <Calendar size={18} className="text-teal-700" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-teal-900">View Today's Schedule</p>
                  <p className="text-[11px] text-teal-600 mt-0.5">
                    {stats.remindersCount > 0
                      ? `${stats.remindersCount} pending • ${visitsDone} completed`
                      : 'All visits completed for today'}
                  </p>
                </div>
              </div>
              <ArrowUpRight size={18} className="text-teal-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>

          {/* ── Col 3: Patient Breakdown Donut + Quick Actions ── */}
          <div className="space-y-4">

            {/* Patient Breakdown */}
            <div
              className="p-5 rounded-2xl bg-white border border-slate-100"
              style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-700">Patient Breakdown</h3>
                <button
                  onClick={() => navigate('/patients')}
                  className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
                >
                  All →
                </button>
              </div>

              {/* Donut Chart */}
              <div className="flex items-center justify-center my-2 relative">
                <DonutChart segments={donutSegments} size={140} strokeWidth={16} />
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">
                    {stats.totalPatients}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Total
                  </span>
                </div>
              </div>

              {/* Legend */}
              <div className="space-y-2.5 mt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-slate-600">Stable</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 tabular-nums">{stableCases}</span>
                    <span className="text-[10px] text-slate-400">{stablePct}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-slate-600">High-Risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 tabular-nums">{stats.highRisk}</span>
                    <span className="text-[10px] text-slate-400">{highRiskPct}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="text-xs font-medium text-slate-600">Visits Done</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800 tabular-nums">{visitsDone}</span>
                    <span className="text-[10px] text-slate-400">This month</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div
              className="p-5 rounded-2xl bg-white border border-slate-100"
              style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}
            >
              <h3 className="text-sm font-bold text-slate-700 mb-3">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-2.5">
                <QuickActionBtn
                  icon={Bell}
                  label="Reminders"
                  accent="#D97706"
                  onClick={() => navigate('/reminders')}
                />
                <QuickActionBtn
                  icon={FolderHeart}
                  label="Health Records"
                  accent="#2563EB"
                  onClick={() => navigate('/reports')}
                />
                <QuickActionBtn
                  icon={Users}
                  label="Patients"
                  accent="#0F766E"
                  onClick={() => navigate('/patients')}
                />
                <QuickActionBtn
                  icon={ClipboardList}
                  label="Programmes"
                  accent="#7C3AED"
                  onClick={() => navigate('/programmes')}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Programme Cards Row ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">
              Health Programmes
            </h2>
            <button
              onClick={() => navigate('/programmes')}
              className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1"
            >
              View all <ChevronRight size={13} />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: 'Maternal & Child',
                icon: Heart,
                accent: '#EC4899',
                bg: '#FFF0F8',
                tag: 'Ongoing',
                path: '/programmes/maternal',
              },
              {
                label: 'Vaccination',
                icon: Syringe,
                accent: '#2563EB',
                bg: '#EFF6FF',
                tag: 'Active',
                path: '/programmes/vaccination',
              },
              {
                label: 'Disease Tracking',
                icon: Activity,
                accent: '#F43F5E',
                bg: '#FFF1F2',
                tag: 'Monitoring',
                path: '/programmes/disease',
              },
              {
                label: 'NCD Monitoring',
                icon: Stethoscope,
                accent: '#7C3AED',
                bg: '#F5F3FF',
                tag: 'Active',
                path: '/programmes/ncd',
              },
            ].map((prog) => (
              <button
                key={prog.path}
                onClick={() => navigate(prog.path)}
                className="group flex flex-col gap-3 p-4 rounded-2xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-200 text-left"
                style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.04)' }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: prog.bg }}
                  >
                    <prog.icon size={17} style={{ color: prog.accent }} />
                  </div>
                  <span
                    className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: prog.bg, color: prog.accent }}
                  >
                    {prog.tag}
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-700 leading-snug group-hover:text-slate-900 transition-colors">
                  {prog.label}
                </p>
                <div className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: prog.accent }}>
                  Open <ArrowUpRight size={11} />
                </div>
              </button>
            ))}
          </div>
        </section>

      </main>
    </div>
  );
}
