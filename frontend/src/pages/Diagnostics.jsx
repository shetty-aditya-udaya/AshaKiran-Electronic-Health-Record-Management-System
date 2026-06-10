import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db';
import { syncAll } from '../lib/syncService';
import { useTranslation } from 'react-i18next';
import {
  Activity, Wifi, WifiOff, Database, Server, RefreshCw,
  Trash2, ShieldAlert, Download, Terminal, ChevronRight, HelpCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/api';

export default function Diagnostics() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // State variables
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pingStatus, setPingStatus] = useState('Checking...');
  const [latency, setLatency] = useState(null);
  const [swStatus, setSwStatus] = useState('Checking...');
  
  const [counts, setCounts] = useState({
    patients: 0,
    visits: 0,
    reminders: 0,
    reportFolders: 0,
    reportItems: 0,
    prescriptionImages: 0,
    syncQueue: 0,
  });
  
  const [pendingSync, setPendingSync] = useState({
    patients: 0,
    visits: 0,
    reminders: 0,
    reportItems: 0,
    prescriptionImages: 0,
  });

  const [logs, setLogs] = useState([]);

  // Fetch log buffer
  useEffect(() => {
    setLogs(window.__ak_logs || []);
  }, []);

  // Handlers and metrics
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Check SW Status
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        if (regs.length === 0) {
          setSwStatus('No active service worker registrations found.');
        } else {
          setSwStatus(`${regs.length} Active registration(s). Active worker: ${regs[0].active ? 'RUNNING' : 'STOPPED'}`);
        }
      }).catch(err => setSwStatus('Error checking SW: ' + err.message));
    } else {
      setSwStatus('Service Worker API not supported in this browser.');
    }

    // Ping API for latency and dynamic DB status
    const pingStart = Date.now();
    fetch(`${API_BASE_URL || ''}/health`)
      .then(async res => {
        const duration = Date.now() - pingStart;
        setLatency(duration);
        if (res.ok) {
          const data = await res.json();
          setPingStatus(`Healthy (DB: ${data.database || 'Connected'})`);
        } else {
          setPingStatus(`Error: Response status code ${res.status}`);
        }
      })
      .catch(err => {
        setPingStatus('Offline / Unreachable (' + err.message + ')');
        setLatency(null);
      });

    // Count IndexedDB Tables
    const getCounts = async () => {
      try {
        const [patients, visits, reminders, folders, items, imgs, queue] = await Promise.all([
          db.patients.count(),
          db.visits.count(),
          db.reminders.count(),
          db.reportFolders.count(),
          db.reportItems.count(),
          db.prescriptionImages.count(),
          db.syncQueue.count(),
        ]);
        setCounts({
          patients,
          visits,
          reminders,
          reportFolders: folders,
          reportItems: items,
          prescriptionImages: imgs,
          syncQueue: queue,
        });

        // Filter for pending syncs (status is either 'pending' or 'failed')
        const [pPat, pVis, pRem, pRep, pImg] = await Promise.all([
          db.patients.where('syncStatus').anyOf('pending', 'failed').count(),
          db.visits.where('syncStatus').anyOf('pending', 'failed').count(),
          db.reminders.where('syncStatus').anyOf('pending', 'failed').count(),
          db.reportItems.where('syncStatus').anyOf('pending', 'failed').count(),
          db.prescriptionImages.where('syncStatus').anyOf('pending', 'failed').count(),
        ]);
        setPendingSync({
          patients: pPat,
          visits: pVis,
          reminders: pRem,
          reportItems: pRep,
          prescriptionImages: pImg,
        });

      } catch (err) {
        console.error('Failed to calculate IDB counts for Diagnostics:', err);
      }
    };
    getCounts();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleForceSync = async () => {
    const loader = toast.loading('Syncing offline data queue...');
    try {
      await syncAll();
      toast.success('Offline queue synced successfully!', { id: loader });
      window.location.reload();
    } catch (err) {
      toast.error('Sync failed: ' + err.message, { id: loader });
    }
  };

  const handleClearCache = async () => {
    if (window.confirm('Clear all static application caches? Your offline database records will NOT be deleted.')) {
      try {
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          for (const key of keys) {
            await caches.delete(key);
          }
        }
        toast.success('Caches successfully cleared!');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        toast.error('Failed to clear cache: ' + err.message);
      }
    }
  };

  const handleResetSW = async () => {
    if (window.confirm('Force unregister all Service Workers? The app will re-register on next startup.')) {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) {
            await r.unregister();
          }
        }
        toast.success('Service Workers successfully unregistered!');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        toast.error('Failed to reset Service Worker: ' + err.message);
      }
    }
  };

  const handleExportJSON = () => {
    try {
      const exportData = {
        appVersion: '1.3',
        timestamp: new Date().toISOString(),
        network: {
          browserOnline: isOnline,
          apiPingStatus: pingStatus,
          apiLatencyMs: latency,
        },
        serviceWorker: {
          status: swStatus,
        },
        databaseCounts: counts,
        unsyncedCounts: pendingSync,
        localStorageSnapshot: {
          lang: localStorage.getItem('lang'),
          storedVersion: localStorage.getItem('ashakiran_app_version'),
          lastSyncPatients: localStorage.getItem('last_sync_patients'),
          lastSyncRecords: localStorage.getItem('last_sync_records'),
          lastSyncReminders: localStorage.getItem('last_sync_reminders'),
          hasUser: !!localStorage.getItem('user'),
          hasToken: !!localStorage.getItem('token'),
        },
        diagnosticLogs: logs,
        userAgent: navigator.userAgent,
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ashakiran_diagnostics_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Diagnostics bundle exported successfully!');
    } catch (err) {
      toast.error('Failed to export diagnostic data: ' + err.message);
    }
  };

  const totalPending = Object.values(pendingSync).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 md:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white">
              <Activity size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">Support Diagnostics</h1>
              <p className="text-xs text-slate-400">System health monitoring and offline diagnostics console</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 border border-slate-200 bg-white rounded-lg px-3 py-1.5 transition-all"
          >
            Back to Dashboard
          </button>
        </header>

        {/* Network & Service Worker Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          
          {/* Connectivity Status */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Server size={16} className="text-teal-600" />
              Connectivity & API status
            </h2>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Device Connection:</span>
                <span className={`font-semibold flex items-center gap-1 ${isOnline ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Backend Server Handshake:</span>
                <span className="font-semibold text-slate-700">{pingStatus}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">API Response Latency:</span>
                <span className="font-semibold text-slate-700">{latency ? `${latency} ms` : 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Service Worker Status */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Activity size={16} className="text-teal-600" />
              Service Worker & Caching
            </h2>
            
            <div className="space-y-3">
              <div className="flex justify-between items-start text-xs">
                <span className="text-slate-400 flex-shrink-0">PWA Lifecycle:</span>
                <span className="font-semibold text-slate-700 text-right">{swStatus}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Client Cache Storage:</span>
                <span className="font-semibold text-teal-600">Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Database Records Snapshot */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Database size={16} className="text-teal-600" />
              IndexedDB Records Snapshot (Dexie)
            </h2>
            <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full border">
              AshaKiran_v3
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Patients', count: counts.patients, pending: pendingSync.patients },
              { label: 'Visits', count: counts.visits, pending: pendingSync.visits },
              { label: 'Reminders', count: counts.reminders, pending: pendingSync.reminders },
              { label: 'Reports', count: counts.reportItems, pending: pendingSync.reportItems },
            ].map((col, i) => (
              <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 font-semibold uppercase">{col.label}</span>
                <span className="text-xl font-bold text-slate-800">{col.count}</span>
                <span className={`text-[9px] font-medium ${col.pending > 0 ? 'text-amber-600 font-bold' : 'text-slate-400'}`}>
                  {col.pending > 0 ? `${col.pending} unsynced` : 'Fully synced'}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-between items-center text-xs border-t border-slate-50">
            <span className="text-slate-400">Sync status:</span>
            <span className={`font-semibold flex items-center gap-1 ${totalPending > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {totalPending > 0 ? `${totalPending} items pending sync` : 'All offline changes successfully synced'}
            </span>
          </div>
        </div>

        {/* Action Panel */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ShieldAlert size={16} className="text-teal-600" />
            Diagnostics Operations
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleForceSync}
              className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-teal-50"
            >
              <RefreshCw size={13} />
              Force Queue Re-sync
            </button>
            <button
              onClick={handleExportJSON}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <Download size={13} />
              Export Diagnostics Bundle
            </button>
            <button
              onClick={handleClearCache}
              className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <Trash2 size={13} />
              Clear Caches Storage
            </button>
            <button
              onClick={handleResetSW}
              className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
            >
              <Trash2 size={13} />
              Purge Service Workers
            </button>
          </div>
        </div>

        {/* Captured Client Console Logs */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Terminal size={16} className="text-teal-600" />
            Client Logs Console
          </h2>

          <div className="bg-slate-900 text-slate-200 font-mono text-[10px] p-4 rounded-xl max-h-52 overflow-y-auto leading-relaxed space-y-1">
            {logs.length === 0 ? (
              <span className="text-slate-500 italic">Console logs window is empty. No local client errors detected.</span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`py-0.5 border-b border-slate-800 last:border-0 ${
                  log.type === 'error' ? 'text-rose-400' : 'text-amber-400'
                }`}>
                  <span className="text-slate-500">[{log.time}]</span>{' '}
                  <span className="font-bold uppercase">[{log.type}]</span>:{' '}
                  {log.message}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
