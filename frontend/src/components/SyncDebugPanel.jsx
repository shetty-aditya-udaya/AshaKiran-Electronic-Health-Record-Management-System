/**
 * SyncDebugPanel — Developer diagnostic overlay
 *
 * Access: Settings (Profile page) → "Sync Debug" button
 *
 * Shows:
 *  • Per-table record counts broken down by syncStatus
 *  • Full list of PENDING / RETRYING items (the "real" queue)
 *  • Live sync engine state (lock, wasOnline, failStreak)
 *  • Buttons: Force Reconcile, Full Sync, Clear All & Reload
 */
import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  getFullDiagnostics,
  syncAll,
  forceReconcile,
  getSyncEngineState,
} from '../lib/syncService';
import { db } from '../lib/db';
import { SyncContext } from '../context/SyncContext';
import { useConnection } from '../context/ConnectionContext';

const STATUS_COLOR = {
  synced:   '#22c55e',
  pending:  '#f59e0b',
  retrying: '#f97316',
  failed:   '#ef4444',
  syncing:  '#0ea5e9',
};

export default function SyncDebugPanel({ onClose }) {
  const [diag, setDiag]         = useState(null);
  const [engine, setEngine]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [action, setAction]     = useState('');
  const [ghostVisits, setGhostVisits] = useState([]);
  const { syncStatus, pendingCount } = useContext(SyncContext);
  const { isServerReachable, serverStatus } = useConnection();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [d, e] = await Promise.all([
        getFullDiagnostics(),
        Promise.resolve(getSyncEngineState()),
      ]);
      setDiag(d);
      setEngine(e);

      // Load ghost COMPLETED+PENDING visits — the specific state this bug creates
      const allVisits = await db.visits.toArray();
      const ghosts = allVisits.filter(
        v => v.status === 'COMPLETED' &&
             (v.syncStatus === 'pending' || v.syncStatus === 'retrying')
      );
      // For each ghost, find its linked reportItem
      const ghostsWithReports = await Promise.all(ghosts.map(async v => {
        let linkedReport = null;
        try {
          linkedReport = await db.reportItems
            .where('visitLocalId').equals(String(v.local_id))
            .first();
        } catch {}
        return { ...v, linkedReport };
      }));
      setGhostVisits(ghostsWithReports);
    } catch (err) {
      console.error('[SyncDebugPanel] refresh error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Dump full raw state to console on every refresh
  useEffect(() => {
    if (!diag) return;
    console.group('%c[SyncDebugPanel] Live IDB Snapshot', 'color:#a78bfa;font-weight:bold;font-size:13px');
    console.log('QUEUE ITEMS (pending+retrying):', diag.pendingItems);
    console.log('PENDING ITEMS:', diag.pendingItems.filter(i => i.syncStatus === 'pending'));
    console.log('SYNCED ITEMS (sample):', diag.raw.patients.filter(p => p.syncStatus === 'synced').slice(0, 5));
    console.log('FAILED ITEMS:', [
      ...diag.raw.patients.filter(p => p.syncStatus === 'failed'),
      ...diag.raw.visits.filter(v => v.syncStatus === 'failed'),
    ]);
    console.log('Full counts:', diag.counts);
    console.groupEnd();
  }, [diag]);

  const handleForceReconcile = async () => {
    setAction('reconciling…');
    await forceReconcile();
    setAction('');
    await refresh();
  };

  const handleFullSync = async () => {
    setAction('syncing…');
    await syncAll();
    setAction('');
    await refresh();
  };

  const totalPending = diag
    ? Object.values(diag.counts).reduce((s, { byStatus: b }) =>
        s + (b.pending || 0) + (b.retrying || 0), 0)
    : 0;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        {/* ── Header ──────────────────────────────────────────────── */}
        <div style={styles.header}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>🔬 Sync Debug Panel</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={styles.btnSecondary} onClick={refresh}>↻ Refresh</button>
            <button style={styles.btnClose} onClick={onClose}>✕</button>
          </div>
        </div>

        {loading && <div style={styles.loading}>Loading IDB snapshot…</div>}

        {!loading && diag && (
          <div style={styles.body}>

            {/* ── Sync Engine State ──────────────────────────────── */}
            <Section title="🔧 Sync Engine State">
              <Grid>
                <KV label="Sync Status (UI)"  value={syncStatus}       color={STATUS_COLOR[syncStatus]} />
                <KV label="Pending Count (UI)" value={pendingCount}     color={pendingCount > 0 ? '#f59e0b' : '#22c55e'} />
                <KV label="Backend Reachable"  value={String(isServerReachable)} color={isServerReachable ? '#22c55e' : '#ef4444'} />
                <KV label="Server Status"      value={serverStatus}     color={serverStatus === 'online' ? '#22c55e' : '#ef4444'} />
                <KV label="IDB Pending Total"  value={totalPending}     color={totalPending > 0 ? '#f59e0b' : '#22c55e'} />
                {engine && <>
                  <KV label="Sync Lock"        value={String(engine.syncLock)}         color={engine.syncLock ? '#f97316' : '#94a3b8'} />
                  <KV label="wasOnline"        value={String(engine.wasOnline)}        />
                  <KV label="Fail Streak"      value={engine.failStreak}               color={engine.failStreak > 0 ? '#f97316' : '#94a3b8'} />
                  <KV label="Heartbeat Active" value={String(engine.heartbeatActive)}  color={engine.heartbeatActive ? '#22c55e' : '#ef4444'} />
                </>}
              </Grid>
            </Section>

            {/* ── Verdict ───────────────────────────────────────── */}
            <div style={{
              padding: '12px 16px',
              borderRadius: 10,
              background: totalPending === 0 ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${totalPending === 0 ? '#bbf7d0' : '#fde68a'}`,
              fontSize: 13,
              fontWeight: 600,
              color: totalPending === 0 ? '#15803d' : '#92400e',
            }}>
              {totalPending === 0
                ? '✅ IDB queue is EMPTY — sync badge showing due to stale UI state or the badge counter is wrong. Click Force Reconcile to clear it.'
                : `⚠️ ${totalPending} REAL pending item(s) exist in IDB. These are genuine unsync'd records.`}
            </div>

            {/* ── Ghost Completed Visits ─────────────────────────── */}
            <Section title={`👻 Ghost Completed Visits (${ghostVisits.length}) [Bug 10]`}>
              {ghostVisits.length === 0 ? (
                <div style={{ color: '#22c55e', fontWeight: 600, padding: '8px 0' }}>
                  ✅ No ghost completed visits — Bug 10 is not triggered
                </div>
              ) : (
                <>
                  <div style={{
                    padding: '10px 14px', borderRadius: 8, marginBottom: 10,
                    background: '#fef9c3', border: '1px solid #fde047',
                    fontSize: 12, color: '#854d0e', fontWeight: 600,
                  }}>
                    ⚠️ These visits are COMPLETED locally but medical data was never pushed to server.
                    Click "Push Completed Visits" to fix.
                  </div>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {['local_id', 'server_id', 'patient', 'syncStatus', 'retries', 'linkedReport'].map(h => (
                          <th key={h} style={styles.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ghostVisits.map((v, i) => (
                        <tr key={i}>
                          <td style={{ ...styles.td, fontSize: 10, fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }} title={v.local_id}>{v.local_id?.slice(0,8)}…</td>
                          <td style={styles.tdNum}>{v.id || '—'}</td>
                          <td style={styles.td}>{v.patientId?.toString().slice(0,8)}…</td>
                          <td style={styles.td}>
                            <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#92400e' }}>
                              {v.syncStatus}
                            </span>
                          </td>
                          <td style={styles.tdNum}>{v.retryCount || 0}</td>
                          <td style={styles.td}>
                            {v.linkedReport
                              ? <span style={{ color: '#f59e0b', fontWeight: 700 }}>⚠️ PENDING</span>
                              : <span style={{ color: '#94a3b8' }}>none</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </Section>

            {/* ── Action Buttons ────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={styles.btnPrimary} onClick={handleForceReconcile} disabled={!!action}>
                {action === 'reconciling…' ? '⏳ Reconciling…' : '🔄 Force Reconcile'}
              </button>
              <button style={styles.btnBlue} onClick={handleFullSync} disabled={!!action}>
                {action === 'syncing…' ? '⏳ Syncing…' : '⬆️ Full Sync Now'}
              </button>
              {ghostVisits.length > 0 && (
                <button
                  style={{ ...styles.btnBlue, background: '#f59e0b' }}
                  onClick={async () => { setAction('pushing completions…'); await syncAll(); setAction(''); await refresh(); }}
                  disabled={!!action}
                >
                  {action === 'pushing completions…' ? '⏳ Pushing…' : `🚀 Push ${ghostVisits.length} Completed Visit(s)`}
                </button>
              )}
            </div>

            {/* ── Local Records by Table ────────────────────────── */}
            <Section title="📦 Local Records (by syncStatus)">
              <table style={styles.table}>
                <thead>
                  <tr>
                    {['Table', 'Total', 'synced', 'pending', 'retrying', 'failed'].map(h => (
                      <th key={h} style={styles.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(diag.counts).map(([table, { total, byStatus }]) => (
                    <tr key={table}>
                      <td style={styles.td}><code>{table}</code></td>
                      <td style={styles.tdNum}>{total}</td>
                      <td style={{ ...styles.tdNum, color: '#22c55e' }}>{byStatus.synced   || 0}</td>
                      <td style={{ ...styles.tdNum, color: (byStatus.pending  || 0) > 0 ? '#f59e0b' : '#94a3b8' }}>{byStatus.pending  || 0}</td>
                      <td style={{ ...styles.tdNum, color: (byStatus.retrying || 0) > 0 ? '#f97316' : '#94a3b8' }}>{byStatus.retrying || 0}</td>
                      <td style={{ ...styles.tdNum, color: (byStatus.failed   || 0) > 0 ? '#ef4444' : '#94a3b8' }}>{byStatus.failed   || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            {/* ── Pending Queue Items ───────────────────────────── */}
            <Section title={`🟡 Pending Queue Items (${diag.pendingItems.length})`}>
              {diag.pendingItems.length === 0 ? (
                <div style={{ color: '#22c55e', fontWeight: 600, padding: '8px 0' }}>
                  ✅ Queue is empty — no pending items
                </div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {['Table', 'Name', 'syncStatus', 'retryCount', 'createdAt'].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {diag.pendingItems.map((item, i) => (
                      <tr key={i}>
                        <td style={styles.td}><code style={{ color: '#a78bfa' }}>{item.table}</code></td>
                        <td style={{ ...styles.td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={item.name}>{item.name || '—'}</td>
                        <td style={styles.td}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                            background: STATUS_COLOR[item.syncStatus] + '22',
                            color: STATUS_COLOR[item.syncStatus],
                          }}>{item.syncStatus}</span>
                        </td>
                        <td style={styles.tdNum}>{item.retryCount}</td>
                        <td style={{ ...styles.td, fontSize: 11, color: '#94a3b8' }}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* ── Raw IDB Dump (collapsed) ──────────────────────── */}
            <Section title="🗃️ Raw IDB Dump (Console)">
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                Full raw data is logged to the browser console every time you refresh this panel.
                Open DevTools → Console and look for <code>[SyncDebugPanel] Live IDB Snapshot</code>.
              </p>
              <button
                style={{ ...styles.btnSecondary, marginTop: 8 }}
                onClick={() => {
                  console.group('%c[SyncDebugPanel] MANUAL RAW DUMP', 'color:#a78bfa;font-weight:bold;font-size:14px');
                  console.log('QUEUE ITEMS', diag.pendingItems);
                  console.log('PENDING ITEMS', diag.pendingItems.filter(i => i.syncStatus === 'pending'));
                  console.log('SYNCED ITEMS (patients)', diag.raw.patients.filter(p => p.syncStatus === 'synced'));
                  console.log('FAILED ITEMS', [
                    ...diag.raw.patients.filter(p => p.syncStatus === 'failed'),
                    ...diag.raw.visits.filter(v => v.syncStatus === 'failed'),
                    ...diag.raw.reminders.filter(r => r.syncStatus === 'failed'),
                    ...diag.raw.reportItems.filter(r => r.syncStatus === 'failed'),
                  ]);
                  console.log('ALL PATIENTS', diag.raw.patients);
                  console.log('ALL VISITS',   diag.raw.visits);
                  console.log('ALL REMINDERS', diag.raw.reminders);
                  console.log('REPORT FOLDERS', diag.raw.reportFolders);
                  console.log('REPORT ITEMS',   diag.raw.reportItems);
                  console.groupEnd();
                }}
              >
                📋 Dump to Console Now
              </button>
            </Section>

          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>{title}</h3>
      {children}
    </div>
  );
}

function Grid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>{children}</div>;
}

function KV({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color || '#1e293b' }}>{String(value)}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 99999,
    background: 'rgba(15,23,42,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  panel: {
    background: '#ffffff',
    borderRadius: 16,
    width: '100%', maxWidth: 700,
    maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
  },
  body: {
    overflow: 'auto', padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  loading: { padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 700,
    color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
  },
  td:    { padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#1e293b' },
  tdNum: { padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  btnPrimary:   { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#22c55e', color: 'white' },
  btnBlue:      { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#0ea5e9', color: 'white' },
  btnSecondary: { padding: '6px 14px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: '#f8fafc', color: '#475569' },
  btnClose:     { padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: '#fee2e2', color: '#ef4444' },
};
