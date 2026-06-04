import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config';
import { MapPin } from 'lucide-react';
import { getLocalDashboardStats } from '../lib/db';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../context/ConnectionContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting(t) {
  const options = {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  };
  const str = new Date().toLocaleDateString(undefined, options);
  return str;
}

function pctOf(val, total) {
  return total > 0 ? Math.min(100, Math.max(0, Math.round((val / total) * 100))) : 0;
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return <div className={`bg-slate-100 dark:bg-slate-200 rounded-2xl animate-pulse ${className}`} />;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const { isServerReachable } = useConnection();
  
  useEffect(() => {
    setUser(JSON.parse(localStorage.getItem('user')) || null);
  }, []);

  const [stats, setStats]     = useState({ totalPatients: 0, highRisk: 0, remindersCount: 0, visitsCompletedCount: 0 });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      // 1. Load locally from IndexedDB first for instant UI response
      const localStats = await getLocalDashboardStats();
      setStats(localStats);
      setLoading(false); // Stop loading since we have local data

      // 2. Fetch fresh stats from backend in the background if online
      if (isServerReachable) {
        const token = localStorage.getItem('token');
        const res   = await fetch(`${API_BASE_URL}/api/programmes/summary`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const d = await res.json();
          setStats({
            totalPatients:        d.totalPatients  || 0,
            highRisk:             d.highRisk       || 0,
            remindersCount:       d.remindersCount || 0,
            visitsCompletedCount: d.visitsCompletedCount || 0,
          });
        }
      }
    } catch (err) {
      console.warn('[Dashboard] Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }, [isServerReachable]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Re-fetch when local database writes occur
  useEffect(() => {
    const handleUpdate = () => fetchStats();
    window.addEventListener('local-data-written', handleUpdate);
    window.addEventListener('visit-added', handleUpdate);
    window.addEventListener('patient-added', handleUpdate);
    return () => {
      window.removeEventListener('local-data-written', handleUpdate);
      window.removeEventListener('visit-added', handleUpdate);
      window.removeEventListener('patient-added', handleUpdate);
    };
  }, [fetchStats]);

  const visitsDone  = stats.visitsCompletedCount || 0;
  const stableCases = Math.max(0, stats.totalPatients - stats.highRisk);

  const locationText = [
    user?.village ? `${t('village', 'Village')}: ${user.village}` : null,
    user?.district ? user.district : null
  ].filter(Boolean).join(', ') || t('yourDistrict', 'Your District');

  // ── Loading Skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-6">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-56 w-full" />
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-36" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-3">
            <Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" />
          </div>
          <div className="lg:col-span-5 space-y-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-14" />)}
          </div>
        </div>
      </div>
    );
  }

  const GLASS_CARD_STYLE = {
    background: 'rgba(255, 255, 255, 0.72)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.55)',
    boxShadow: '0 8px 32px 0 rgba(0, 109, 119, 0.03)',
  };

  return (
    <div 
      className="min-h-screen pb-24 md:pb-8 relative overflow-hidden" 
      style={{ 
        backgroundImage: "url('/dashboard-bg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Soft gradient wash overlay for perfect readability and soothing healthcare atmosphere */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(247, 249, 251, 0.45) 0%, rgba(247, 249, 251, 0.82) 100%)',
          backdropFilter: 'blur(3px)',
        }}
      />

      <main className="relative z-10 max-w-[1280px] mx-auto px-4 md:px-16 py-8 space-y-6">
        
        {/* ── Namaste Greeting Header ── */}
        <header className="flex flex-col md:flex-row md:items-center justify-between pb-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-1">
              {greeting(t)}
            </p>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
              {t('namasteGreeting', 'Namaste, {{name}} 👋', { name: user?.name || 'ASHA Worker' })}
            </h1>
            <div className="flex items-center gap-1.5 mt-1.5 text-slate-400">
              <MapPin size={13} strokeWidth={2} />
              <span className="text-xs font-medium text-slate-500">{locationText}</span>
            </div>
          </div>
        </header>

        {/* Hero Section: Daily Targets */}
        <section className="mb-8">
          <div 
            className="rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #00535b 0%, #006d77 100%)',
              boxShadow: '0 8px 24px rgba(0, 109, 119, 0.12)'
            }}
          >
            {/* Soft decorative medical icon background */}
            <div className="absolute top-0 right-0 p-4 sm:p-8 opacity-10 pointer-events-none">
              <span className="material-symbols-outlined text-[100px] sm:text-[140px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                medical_services
              </span>
            </div>
            
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 sm:gap-8">
              <div className="space-y-4 max-w-xl">
                <h2 className="text-2xl sm:text-3.5xl font-extrabold text-white leading-tight tracking-tight">
                  {t('careTagline', 'Providing quality care to the community, one step at a time.')}
                </h2>
                <button 
                  onClick={() => navigate('/reminders')}
                  className="bg-white text-teal-800 font-bold text-xs sm:text-sm px-5 py-3 sm:px-6 sm:py-3.5 rounded-xl hover:bg-teal-50 hover:shadow-md transition-all active:scale-95 flex items-center gap-2 w-fit shadow-sm"
                >
                  {t('viewSchedule', "View Today's Schedule")}
                  <span className="material-symbols-outlined text-sm sm:text-base">arrow_forward</span>
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4 w-full lg:w-auto">
                <div className="bg-white/10 backdrop-blur-sm p-4 sm:p-5 rounded-2xl border border-white/20 flex flex-col justify-between">
                  <p className="text-white/70 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">{t('completed', 'Completed')}</p>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl sm:text-3xl font-extrabold">{String(visitsDone).padStart(2, '0')}</span>
                    <span className="text-white/60 text-[10px] sm:text-xs">{t('done', 'Done')}</span>
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-4 sm:p-5 rounded-2xl border border-white/20 flex flex-col justify-between">
                  <p className="text-white/70 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">{t('pending', 'Pending')}</p>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl sm:text-3xl font-extrabold">{String(stats.remindersCount).padStart(2, '0')}</span>
                    <span className="text-white/60 text-[10px] sm:text-xs">{t('action', 'Action')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Patient Stats Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div 
            onClick={() => navigate('/patients')}
            className="p-6 rounded-2xl border border-white/60 flex justify-between items-center group hover:border-primary hover:bg-white/80 transition-all cursor-pointer"
            style={GLASS_CARD_STYLE}
          >
            <div>
              <p className="font-semibold text-sm text-on-surface-variant mb-1">{t('totalPatients', 'Total Patients')}</p>
              <h3 className="text-2xl font-bold text-on-surface">{String(stats.totalPatients).padStart(2, '0')}</h3>
            </div>
            <div className="text-right">
              <span className="text-primary font-bold text-lg">100%</span>
              <div className="w-12 h-1.5 bg-surface-container rounded-full mt-2">
                <div className="bg-primary w-full h-full rounded-full transition-transform duration-300 group-hover:scale-x-110 origin-left"></div>
              </div>
            </div>
          </div>

          <div 
            onClick={() => navigate('/patients')}
            className="p-6 rounded-2xl border border-white/60 flex justify-between items-center group hover:border-secondary hover:bg-white/80 transition-all cursor-pointer"
            style={GLASS_CARD_STYLE}
          >
            <div>
              <p className="font-semibold text-sm text-on-surface-variant mb-1">{t('stableCases', 'Stable Cases')}</p>
              <h3 className="text-2xl font-bold text-on-surface">{String(stableCases).padStart(2, '0')}</h3>
            </div>
            <div className="text-right">
              <span className="text-secondary font-bold text-lg">{pctOf(stableCases, stats.totalPatients)}%</span>
              <div className="w-12 h-1.5 bg-surface-container rounded-full mt-2">
                <div 
                  className="bg-secondary h-full rounded-full transition-transform duration-300 group-hover:scale-x-110 origin-left"
                  style={{ width: `${pctOf(stableCases, stats.totalPatients)}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div 
            onClick={() => navigate('/patients')}
            className="p-6 rounded-2xl border border-white/60 flex justify-between items-center group hover:border-error hover:bg-white/80 transition-all cursor-pointer"
            style={GLASS_CARD_STYLE}
          >
            <div>
              <p className="font-semibold text-sm text-on-surface-variant mb-1">{t('highRiskCases', 'High-Risk Cases')}</p>
              <h3 className="text-2xl font-bold text-on-surface">{String(stats.highRisk).padStart(2, '0')}</h3>
            </div>
            <div className="text-right">
              <span className="text-error font-bold text-lg">{pctOf(stats.highRisk, stats.totalPatients)}%</span>
              <div className="w-12 h-1.5 bg-surface-container rounded-full mt-2">
                <div 
                  className="bg-error h-full rounded-full transition-transform duration-300 group-hover:scale-x-110 origin-left"
                  style={{ width: `${pctOf(stats.highRisk, stats.totalPatients)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </section>

        {/* Main Content Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          
          {/* Left: Alerts & Status */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">notifications</span>
              {t('activityAlerts', 'Activity & Alerts')}
            </h2>
            
            <div className="space-y-4">
              {/* High risk check alert */}
              {stats.highRisk === 0 ? (
                <div 
                  onClick={() => navigate('/patients')}
                  className="border-l-4 border-secondary p-5 rounded-r-xl flex items-center gap-4 transition-all hover:translate-x-1 cursor-pointer"
                  style={{
                    background: 'rgba(230, 242, 242, 0.72)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.4)',
                    borderRight: '1px solid rgba(255, 255, 255, 0.4)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.4)',
                    boxShadow: '0 4px 16px rgba(0, 109, 119, 0.02)',
                  }}
                >
                  <div className="bg-secondary/10 p-2 rounded-full flex-shrink-0">
                    <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_circle
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-on-secondary-container">{t('noCriticalAlerts', 'No Critical Alerts Today')}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{t('allPatientsStable', 'All high-risk patients are currently stable.')}</p>
                  </div>
                </div>
              ) : (
                <div 
                  onClick={() => navigate('/patients')}
                  className="border-l-4 border-error p-5 rounded-r-xl flex items-center gap-4 transition-all hover:translate-x-1 cursor-pointer"
                  style={{
                    background: 'rgba(254, 242, 242, 0.72)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.4)',
                    borderRight: '1px solid rgba(255, 255, 255, 0.4)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.4)',
                    boxShadow: '0 4px 16px rgba(185, 28, 28, 0.02)',
                  }}
                >
                  <div className="bg-error/10 p-2 rounded-full flex-shrink-0">
                    <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>
                      warning
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-error">{t('highRiskAlertsCount', '{{count}} High-Risk Patients Need Attention', { count: stats.highRisk })}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{t('followUpRecommended', 'Immediate follow-up recommended for priority care.')}</p>
                  </div>
                </div>
              )}

              {/* Warning Alert */}
              {stats.remindersCount > 0 ? (
                <div 
                  onClick={() => navigate('/reminders')}
                  className="border-l-4 border-tertiary p-5 rounded-r-xl flex items-center gap-4 transition-all hover:translate-x-1 cursor-pointer"
                  style={{
                    background: 'rgba(254, 243, 199, 0.72)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.4)',
                    borderRight: '1px solid rgba(255, 255, 255, 0.4)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.4)',
                    boxShadow: '0 4px 16px rgba(217, 119, 6, 0.02)',
                  }}
                >
                  <div className="bg-tertiary/10 p-2 rounded-full flex-shrink-0">
                    <span className="material-symbols-outlined text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>
                      warning
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-on-tertiary-fixed-variant">{t('pendingVisitsCount', '{{count}} Visits Pending', { count: stats.remindersCount })}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{t('pendingVisitsDesc', 'Scheduled checkups require updates today.')}</p>
                  </div>
                </div>
              ) : (
                <div 
                  onClick={() => navigate('/reminders')}
                  className="border-l-4 border-secondary p-5 rounded-r-xl flex items-center gap-4 transition-all hover:translate-x-1 cursor-pointer"
                  style={{
                    background: 'rgba(230, 242, 242, 0.72)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.4)',
                    borderRight: '1px solid rgba(255, 255, 255, 0.4)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.4)',
                    boxShadow: '0 4px 16px rgba(0, 109, 119, 0.02)',
                  }}
                >
                  <div className="bg-secondary/10 p-2 rounded-full flex-shrink-0">
                    <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>
                      check_circle
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-on-secondary-container">{t('allVisitsCompleted', 'All Visits Completed')}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{t('allVisitsCompletedDesc', "Great work! You are fully up to date with today's schedule.")}</p>
                  </div>
                </div>
              )}

              {/* Neutral Stats Card */}
              <div 
                onClick={() => navigate('/patients')}
                className="p-5 rounded-xl flex items-center justify-between group cursor-pointer transition-all border border-white/60 hover:border-primary/40 hover:bg-white/80"
                style={GLASS_CARD_STYLE}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="bg-primary/10 p-2 rounded-full flex-shrink-0">
                    <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                      person_pin
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-on-surface truncate">{t('totalPatientsCount', '{{count}} Total Patients Managed', { count: stats.totalPatients })}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5 truncate">{t('secureOfflineRegistry', 'Secure offline records registry')}</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant group-hover:translate-x-1 transition-transform">
                  chevron_right
                </span>
              </div>
            </div>

            {/* Cloud Sync Banner */}
            <div 
              className="p-6 rounded-2xl border border-white/60 relative overflow-hidden"
              style={GLASS_CARD_STYLE}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">cloud_done</span>
                  <span className="font-bold text-sm text-on-surface">{t('cloudSyncTitle', 'Aiven Cloud Sync')}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-secondary/10 rounded-full flex-shrink-0">
                  <span className="w-2 h-2 bg-secondary rounded-full animate-pulse"></span>
                  <span className="text-[10px] font-bold text-secondary tracking-widest uppercase">{t('live', 'LIVE')}</span>
                </div>
              </div>
              <p className="text-xs text-on-surface-variant">
                {t('cloudSyncDesc', 'All patient health records are encrypted end-to-end and securely backed up to your dedicated cloud instance.')}
              </p>
            </div>
          </div>

          {/* Right: Actions & Programmes */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">rocket_launch</span>
              {t('quickActions', 'Quick Actions')}
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => navigate('/reminders')}
                className="p-6 rounded-2xl border border-white/60 hover:border-primary hover:bg-white/80 transition-all text-left flex flex-col gap-3 group"
                style={GLASS_CARD_STYLE}
              >
                <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">event_repeat</span>
                <span className="font-bold text-sm text-on-surface">{t('reminders')}</span>
              </button>
              
              <button 
                onClick={() => navigate('/reports')}
                className="p-6 rounded-2xl border border-white/60 hover:border-primary hover:bg-white/80 transition-all text-left flex flex-col gap-3 group"
                style={GLASS_CARD_STYLE}
              >
                <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">clinical_notes</span>
                <span className="font-bold text-sm text-on-surface">{t('medicalRecords', 'Health Records')}</span>
              </button>
              
              <button 
                onClick={() => navigate('/patients')}
                className="p-6 rounded-2xl border border-white/60 hover:border-primary hover:bg-white/80 transition-all text-left flex flex-col gap-3 group"
                style={GLASS_CARD_STYLE}
              >
                <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">group_add</span>
                <span className="font-bold text-sm text-on-surface">{t('patients', 'Patient Registry')}</span>
              </button>
              
              <button 
                onClick={() => navigate('/programmes')}
                className="p-6 rounded-2xl border border-white/60 hover:border-primary hover:bg-white/80 transition-all text-left flex flex-col gap-3 group"
                style={GLASS_CARD_STYLE}
              >
                <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">health_and_safety</span>
                <span className="font-bold text-sm text-on-surface">{t('programmes', 'Health Programmes')}</span>
              </button>
            </div>

            {/* Maternal Health Banner */}
            <div 
              onClick={() => navigate('/programmes/maternal')}
              className="relative rounded-2xl overflow-hidden h-48 group cursor-pointer"
              style={{ boxShadow: '0 4px 12px rgba(0, 109, 119, 0.08)' }}
            >
              <img 
                alt="Maternal Health Programme Illustration" 
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCRDBztH8Y0m2I03NEgwbi7WPLkXSVBhYUzyAoLvYXo0h78MC1a7ZiLL4LQVeCrNUs4qtBV1YSiiHVEVYtf6jv2zMFUn76ARpA44LrW2tm0YZWmSk30hcPqTXxF4EFzsI4BleGVp0eNEHrn08Io3QIIJzal5mVzaK6QVrkJOMM3-7UqvYnBM2S-O4vpu9fStQ_KmoNto2RMHqIhd3U5kAizxcDG2MBe5Hl92GODYJQ8xEEyrtXqBnBpMLgygFWJ5fP8u5CUZY1zs4I"
              />
              <div className="absolute inset-0 bg-primary/80 flex flex-col justify-end p-6">
                <h4 className="text-white text-lg font-bold mb-1">{t('maternalHealth', 'Maternal & Child Health')}</h4>
                <p className="text-white/80 text-xs">{t('maternalHealthEnrollDesc', 'Enroll new families in the postnatal care initiative.')}</p>
                <div className="mt-4 flex gap-2">
                  <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] text-white font-bold uppercase tracking-wider backdrop-blur-sm">
                    {t('maternalActiveMembers', '80+ Active Members')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
