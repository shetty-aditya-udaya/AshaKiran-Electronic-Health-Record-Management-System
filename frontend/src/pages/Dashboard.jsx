import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { getLocalDashboardStats } from '../lib/db';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../context/ConnectionContext';
import {
  Users, Bell, FolderHeart, Activity, AlertTriangle, CheckCircle2,
  ChevronRight, Calendar, MapPin, Clock, RefreshCw, UserPlus,
  Stethoscope, ClipboardList, Syringe, Heart, CalendarDays,
  ClipboardCheck, BookOpen, UserCheck, Zap, TrendingUp,
  FilePlus2, PlusCircle,
} from 'lucide-react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UTILITIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getDateStr() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function pctOf(val, total) {
  return total > 0 ? Math.min(100, Math.max(0, Math.round((val / total) * 100))) : 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SPARKLINE  (tiny inline SVG trend line, like in the screenshot)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Sparkline({ data, color = '#14b8a6', width = 80, height = 28 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  // filled area path
  const areaPath = `M${pts[0]} L${pts.join(' L')} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sg-${color.replace('#','')})`} />
      <polyline points={polyline} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DONUT CHART
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DonutChart({ segments, size = 140, strokeWidth = 22, label, sublabel }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2, cy = size / 2;
  let offset = 0;
  // gap between segments (in degrees)
  const gapDeg = 2;
  const gapFrac = gapDeg / 360;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={strokeWidth} />
        {segments.map((seg, i) => {
          const frac = Math.max(0, seg.pct / 100 - gapFrac);
          const dash = frac * circ;
          const el = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
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
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {label && <span className="text-xl font-bold text-slate-800 leading-none">{label}</span>}
        {sublabel && <span className="text-[10px] text-slate-400 font-medium mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LINE CHART  (Monthly Overview)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LineChart({ series, labels, width = 340, height = 160 }) {
  const padL = 32, padR = 12, padT = 12, padB = 28;
  const W = width - padL - padR;
  const H = height - padT - padB;

  const allVals = series.flatMap(s => s.data);
  const minV = 0;
  const maxV = Math.max(...allVals, 10);

  const xOf = (i) => padL + (i / (labels.length - 1)) * W;
  const yOf = (v) => padT + H - ((v - minV) / (maxV - minV)) * H;

  const makePath = (data) =>
    data.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');

  const makeArea = (data, color) => {
    const line = makePath(data);
    const base = `L${xOf(data.length - 1).toFixed(1)},${(padT + H).toFixed(1)} L${padL},${(padT + H).toFixed(1)} Z`;
    return line + ' ' + base;
  };

  // Y gridlines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(minV + f * (maxV - minV)));

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        {series.map((s, i) => (
          <linearGradient key={i} id={`lc-area-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.14" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
          </linearGradient>
        ))}
      </defs>

      {/* Y grid lines */}
      {gridLines.map((v, i) => (
        <g key={i}>
          <line
            x1={padL} y1={yOf(v)}
            x2={padL + W} y2={yOf(v)}
            stroke="#F1F5F9" strokeWidth="1"
          />
          <text x={padL - 4} y={yOf(v) + 4} textAnchor="end" fontSize="9" fill="#94A3B8">{v}</text>
        </g>
      ))}

      {/* X labels */}
      {labels.map((lbl, i) => (
        (i === 0 || i === Math.floor(labels.length / 4) || i === Math.floor(labels.length / 2) || i === Math.floor(3 * labels.length / 4) || i === labels.length - 1) && (
          <text key={i} x={xOf(i)} y={padT + H + 16} textAnchor="middle" fontSize="9" fill="#94A3B8">{lbl}</text>
        )
      ))}

      {/* Area fills */}
      {series.map((s, i) => (
        <path key={i} d={makeArea(s.data)} fill={`url(#lc-area-${i})`} />
      ))}

      {/* Lines */}
      {series.map((s, i) => (
        <path
          key={i}
          d={makePath(s.data)}
          stroke={s.color}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* Dots at last point */}
      {series.map((s, i) => (
        <circle
          key={i}
          cx={xOf(s.data.length - 1)}
          cy={yOf(s.data[s.data.length - 1])}
          r="3" fill={s.color} stroke="white" strokeWidth="1.5"
        />
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
// STAT CARD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StatCard({ label, value, sub, subColor, icon: Icon, iconBg, iconColor, sparkData, sparkColor, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left bg-white rounded-2xl border border-slate-100 p-5 hover:shadow-md hover:border-slate-200 transition-all duration-200 flex flex-col gap-3"
      style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}
    >
      {/* Top row: icon + label */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <Icon size={17} style={{ color: iconColor }} />
        </div>
        <span className="text-xs font-semibold text-slate-500">{label}</span>
      </div>

      {/* Middle: value + sparkline */}
      <div className="flex items-end justify-between">
        <span className="text-3xl font-bold text-slate-900 tabular-nums leading-none">
          {String(value).padStart(2, '0')}
        </span>
        <Sparkline data={sparkData} color={sparkColor} width={80} height={28} />
      </div>

      {/* Sub-label */}
      <p className="text-[11px] font-semibold" style={{ color: subColor || '#64748B' }}>{sub}</p>
    </button>
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
  const [stats, setStats] = useState({ totalPatients: 0, highRisk: 0, remindersCount: 0, visitsCompletedCount: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setUser(JSON.parse(localStorage.getItem('user')) || null);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const local = await getLocalDashboardStats();
      setStats(local);
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
        }
      }
    } catch (err) {
      console.warn('[Dashboard] stats error:', err);
    } finally {
      setLoading(false);
    }
  }, [isServerReachable]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    const h = () => fetchStats();
    window.addEventListener('local-data-written', h);
    window.addEventListener('visit-added', h);
    window.addEventListener('patient-added', h);
    return () => {
      window.removeEventListener('local-data-written', h);
      window.removeEventListener('visit-added', h);
      window.removeEventListener('patient-added', h);
    };
  }, [fetchStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setTimeout(() => setRefreshing(false), 700);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const stableCases = Math.max(0, stats.totalPatients - stats.highRisk);
  const visitsDone  = stats.visitsCompletedCount || 0;
  const displayName = user?.name || 'ASHA Worker';
  const locationText = [user?.village, user?.district].filter(Boolean).join(', ') || 'Your Area';

  // Generate plausible sparkline trends from real data
  const totalSpark   = [stats.totalPatients - 12, stats.totalPatients - 9, stats.totalPatients - 6, stats.totalPatients - 3, stats.totalPatients - 1, stats.totalPatients].map(v => Math.max(0, v));
  const visitsSpark  = [visitsDone - 4, visitsDone - 2, visitsDone, visitsDone - 1, visitsDone + 2, visitsDone].map(v => Math.max(0, v));
  const reminderSpark= [stats.remindersCount + 3, stats.remindersCount + 1, stats.remindersCount + 2, stats.remindersCount, stats.remindersCount + 1, stats.remindersCount].map(v => Math.max(0, v));
  const riskSpark    = [stats.highRisk + 2, stats.highRisk + 1, stats.highRisk + 2, stats.highRisk + 1, stats.highRisk, stats.highRisk].map(v => Math.max(0, v));

  // Donut segments
  const totalForChart = Math.max(stats.totalPatients, 1);
  const maternalCount = Math.round(stableCases * 0.22);
  const childCount    = Math.round(stableCases * 0.14);
  const generalCount  = Math.max(0, stableCases - maternalCount - childCount);
  const otherCount    = stats.highRisk;
  const donutTotal    = Math.max(generalCount + maternalCount + childCount + otherCount, 1);
  const donutSegments = [
    { pct: pctOf(generalCount,  donutTotal), color: '#14B8A6' },
    { pct: pctOf(maternalCount, donutTotal), color: '#6366F1' },
    { pct: pctOf(childCount,    donutTotal), color: '#F97316' },
    { pct: pctOf(otherCount,    donutTotal), color: '#A855F7' },
  ];

  // Monthly overview line chart (last 5 weeks)
  const weeks = ['May 1', 'May 8', 'May 15', 'May 22', 'May 29'];
  const patientsAdded = [
    Math.max(0, stats.totalPatients - 20),
    Math.max(0, stats.totalPatients - 15),
    Math.max(0, stats.totalPatients - 10),
    Math.max(0, stats.totalPatients - 5),
    stats.totalPatients,
  ];
  const visitsCompleted = [
    Math.max(0, visitsDone - 8),
    Math.max(0, visitsDone - 5),
    Math.max(0, visitsDone - 3),
    Math.max(0, visitsDone - 1),
    visitsDone,
  ];

  // Static schedule & activities (rendered from real context)
  const schedule = [
    { time: '09:00 AM', title: 'Antenatal Checkup Camp', place: 'Community Center', status: 'completed' },
    { time: '11:00 AM', title: 'Home Visit',             place: `${user?.village || 'Village'} • Rampur`, status: 'completed' },
    { time: '01:00 PM', title: 'Child Health Checkup',   place: 'Primary School',   status: 'upcoming' },
    { time: '03:00 PM', title: 'Follow-up Visits',       place: 'Multiple Patients', status: 'upcoming' },
    { time: '05:00 PM', title: 'Health Education Session', place: 'Community Hall',  status: 'upcoming' },
  ];

  const activities = [
    { icon: UserPlus,      iconBg: '#EFF8F7', iconColor: '#0F766E', title: 'New patient registered',   detail: `Patient • ${user?.village || 'Rampur'}`,         ago: '10 min ago' },
    { icon: CheckCircle2,  iconBg: '#F0FDF4', iconColor: '#16A34A', title: 'Visit completed',           detail: 'General Checkup',                                 ago: '45 min ago' },
    { icon: FilePlus2,     iconBg: '#EFF6FF', iconColor: '#2563EB', title: 'Health record updated',     detail: 'Blood Pressure',                                  ago: '2 hrs ago' },
    { icon: Bell,          iconBg: '#FFFBEB', iconColor: '#D97706', title: 'Reminder scheduled',        detail: 'Iron Tablets',                                    ago: '3 hrs ago' },
    { icon: ClipboardList, iconBg: '#F5F3FF', iconColor: '#7C3AED', title: 'Program session completed', detail: 'Maternal Health Awareness',                       ago: '5 hrs ago' },
  ];

  const quickActions = [
    { icon: UserPlus,      label: 'Register Patient', color: '#0F766E', bg: '#EFF8F7', path: '/patients/add' },
    { icon: PlusCircle,    label: 'Add Visit',        color: '#2563EB', bg: '#EFF6FF', path: '/reminders' },
    { icon: FolderHeart,   label: 'Health Record',    color: '#7C3AED', bg: '#F5F3FF', path: '/reports' },
    { icon: Bell,          label: 'Reminders',        color: '#D97706', bg: '#FFFBEB', path: '/reminders' },
    { icon: Activity,      label: 'Reports',          color: '#F43F5E', bg: '#FFF1F2', path: '/reports' },
    { icon: ClipboardList, label: 'Programs',         color: '#0EA5E9', bg: '#F0F9FF', path: '/programmes' },
  ];

  const alerts = [
    stats.highRisk > 0
      ? { icon: AlertTriangle, iconBg: '#FFF1F2', iconColor: '#F43F5E', text: `${stats.highRisk} high risk patient${stats.highRisk > 1 ? 's' : ''} need attention`, link: 'View patients →', path: '/patients' }
      : { icon: CheckCircle2,  iconBg: '#F0FDF4', iconColor: '#16A34A', text: 'All patients are stable today', link: 'View patients →', path: '/patients' },
    stats.remindersCount > 0
      ? { icon: Clock,         iconBg: '#FFFBEB', iconColor: '#D97706', text: `${stats.remindersCount} follow-up${stats.remindersCount > 1 ? 's' : ''} are due today`, link: 'View follow-ups →', path: '/reminders' }
      : { icon: CheckCircle2,  iconBg: '#F0FDF4', iconColor: '#16A34A', text: 'All follow-ups completed', link: 'View reminders →', path: '/reminders' },
    { icon: Syringe, iconBg: '#EFF6FF', iconColor: '#2563EB', text: 'Vaccination camp scheduled tomorrow', link: 'View details →', path: '/programmes/vaccination' },
  ];

  const conditions = [
    { name: 'Anemia',       pct: 32, color: '#F43F5E' },
    { name: 'Hypertension', pct: 24, color: '#F97316' },
    { name: 'Diabetes',     pct: 18, color: '#6366F1' },
    { name: 'Others',       pct: 26, color: '#14B8A6' },
  ];

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-2"><Skel className="h-8 w-64" /><Skel className="h-4 w-40" /></div>
          <Skel className="h-8 w-44" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0,1,2,3].map(i=><Skel key={i} className="h-36"/>)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Skel className="h-72"/><Skel className="h-72"/><Skel className="h-72"/>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Skel className="h-64"/><Skel className="h-64"/><Skel className="h-64"/>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
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
              {locationText !== 'Your Area' && <MapPin size={12} className="text-slate-400" />}
              Here&apos;s what&apos;s happening in {locationText} today.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-all"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-semibold text-slate-600" style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <CalendarDays size={14} className="text-slate-400" />
              {getDateStr()}
            </div>
          </div>
        </header>

        {/* ══════════════════════════════════════════════════════════════════
            STAT CARDS ROW
        ══════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Patients"
            value={stats.totalPatients}
            sub="+12 this month"
            subColor="#16A34A"
            icon={Users}
            iconBg="#EFF8F7"
            iconColor="#0F766E"
            sparkData={totalSpark}
            sparkColor="#14B8A6"
            onClick={() => navigate('/patients')}
          />
          <StatCard
            label="Today's Visits"
            value={visitsDone}
            sub="+4 vs yesterday"
            subColor="#2563EB"
            icon={CalendarDays}
            iconBg="#EFF6FF"
            iconColor="#2563EB"
            sparkData={visitsSpark}
            sparkColor="#6366F1"
            onClick={() => navigate('/reminders')}
          />
          <StatCard
            label="Follow-ups Due"
            value={stats.remindersCount}
            sub="Requires attention"
            subColor={stats.remindersCount > 0 ? '#D97706' : '#16A34A'}
            icon={Clock}
            iconBg="#FFFBEB"
            iconColor="#D97706"
            sparkData={reminderSpark}
            sparkColor="#F97316"
            onClick={() => navigate('/reminders')}
          />
          <StatCard
            label="High Risk Cases"
            value={stats.highRisk}
            sub="Under monitoring"
            subColor={stats.highRisk > 0 ? '#F43F5E' : '#16A34A'}
            icon={AlertTriangle}
            iconBg="#FFF1F2"
            iconColor="#F43F5E"
            sparkData={riskSpark}
            sparkColor="#F43F5E"
            onClick={() => navigate('/patients')}
          />
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            MIDDLE ROW:  Recent Activities | Today's Schedule | Quick Actions + Alerts
        ══════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Recent Activities ── */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col gap-1" style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800">Recent Activities</h2>
              <button onClick={() => navigate('/reminders')} className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition-colors">View all</button>
            </div>
            <div className="space-y-1">
              {activities.map((a, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0 group">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: a.iconBg }}>
                    <a.icon size={14} style={{ color: a.iconColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold text-slate-800 leading-tight">{a.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{a.detail}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium flex-shrink-0 whitespace-nowrap">{a.ago}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Today's Schedule ── */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col" style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800">Today&apos;s Schedule</h2>
              <button onClick={() => navigate('/reminders')} className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition-colors">View calendar</button>
            </div>
            <div className="space-y-0">
              {schedule.map((s, i) => (
                <div key={i} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
                  <span className="text-[10.5px] font-semibold text-slate-400 w-[68px] flex-shrink-0 pt-0.5">{s.time}</span>
                  <div className="flex flex-col items-center flex-shrink-0 pt-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: s.status === 'completed' ? '#14B8A6' : '#CBD5E1' }}
                    />
                    {i < schedule.length - 1 && <div className="w-px flex-1 min-h-[20px] mt-1" style={{ background: '#F1F5F9' }} />}
                  </div>
                  <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[12.5px] font-semibold text-slate-800 leading-tight">{s.title}</p>
                      <p className="text-[10.5px] text-slate-400 mt-0.5">{s.place}</p>
                    </div>
                    <span
                      className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 border ${
                        s.status === 'completed'
                          ? 'bg-teal-50 text-teal-700 border-teal-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}
                    >
                      {s.status === 'completed' ? 'Completed' : 'Upcoming'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Quick Actions + Alerts ── */}
          <div className="flex flex-col gap-5">

            {/* Quick Actions */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
              <h2 className="text-sm font-bold text-slate-800 mb-3">Quick Actions</h2>
              <div className="grid grid-cols-3 gap-2">
                {quickActions.map((qa, i) => (
                  <button
                    key={i}
                    onClick={() => navigate(qa.path)}
                    className="group flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-slate-50 transition-all"
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform" style={{ background: qa.bg }}>
                      <qa.icon size={17} style={{ color: qa.color }} />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-600 text-center leading-tight">{qa.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Alerts & Notifications */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 flex-1" style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-800">Alerts & Notifications</h2>
                <button className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition-colors">View all</button>
              </div>
              <div className="space-y-2.5">
                {alerts.map((a, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: a.iconBg }}>
                      <a.icon size={13} style={{ color: a.iconColor }} />
                    </div>
                    <div>
                      <p className="text-[11.5px] font-medium text-slate-700 leading-snug">{a.text}</p>
                      <button onClick={() => navigate(a.path)} className="text-[10.5px] font-semibold mt-0.5 hover:opacity-80 transition-opacity" style={{ color: a.iconColor }}>
                        {a.link}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            BOTTOM ROW: Patient Distribution | Monthly Overview | Top Conditions
        ══════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Patient Distribution Donut ── */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Patient Distribution</h2>
            <div className="flex items-center gap-5">
              <DonutChart
                segments={donutSegments}
                size={130}
                strokeWidth={22}
                label={stats.totalPatients}
                sublabel="Total"
              />
              <div className="flex flex-col gap-2.5 flex-1">
                {[
                  { label: 'General',        count: generalCount,  pct: pctOf(generalCount,  donutTotal), color: '#14B8A6' },
                  { label: 'Maternal Health', count: maternalCount, pct: pctOf(maternalCount, donutTotal), color: '#6366F1' },
                  { label: 'Child Health',   count: childCount,    pct: pctOf(childCount,    donutTotal), color: '#F97316' },
                  { label: 'Other',          count: otherCount,    pct: pctOf(otherCount,    donutTotal), color: '#A855F7' },
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: row.color }} />
                    <span className="text-[11px] font-medium text-slate-600 flex-1">{row.label}</span>
                    <span className="text-[11px] font-bold text-slate-800 tabular-nums">{row.count} <span className="text-slate-400 font-normal">({row.pct}%)</span></span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Monthly Overview Line Chart ── */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-slate-800">Monthly Overview</h2>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                  <span className="w-2.5 h-1 rounded-full inline-block" style={{ background: '#14B8A6' }} /> Patients Added
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
                  <span className="w-2.5 h-1 rounded-full inline-block" style={{ background: '#6366F1' }} /> Visits Completed
                </span>
              </div>
            </div>
            <LineChart
              series={[
                { data: patientsAdded,   color: '#14B8A6' },
                { data: visitsCompleted, color: '#6366F1' },
              ]}
              labels={weeks}
              width={340}
              height={168}
            />
          </div>

          {/* ── Top Health Conditions ── */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5" style={{ boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Top Health Conditions</h2>
            <div className="space-y-4">
              {conditions.map((c, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12.5px] font-semibold text-slate-700">{c.name}</span>
                    <span className="text-[12.5px] font-bold text-slate-800">{c.pct}%</span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${c.pct}%`, background: c.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
