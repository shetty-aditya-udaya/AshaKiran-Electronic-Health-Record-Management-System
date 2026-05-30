import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, User, FileText,
  CheckCircle2, Clock, ChevronDown, ChevronUp,
  Activity, Pill, Syringe, Info, WifiOff, RefreshCw,
  Image, Building2, AlertTriangle, Heart, Stethoscope,
  MapPin, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  db,
  getReportFolder, getReportItemsForPatient,
  getVisitsForPatient, bulkUpsertReportItems, bulkUpsertVisits,
  getPatientByIdOrLocalId,
  SYNC,
} from '../lib/db';
import { api, NetworkError } from '../utils/apiClient';
import { useConnection } from '../context/ConnectionContext';
import { useDeleteVisit } from '../hooks/useDeleteVisit';
import DeleteVisitModal from '../components/DeleteVisitModal';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return '—'; }
}

const TREATMENT_COLORS = {
  'Ongoing Treatment':          'bg-blue-50/80 text-blue-700 border-blue-100/50',
  'Completed Treatment':        'bg-emerald-50/80 text-emerald-700 border-emerald-100/50',
  'Referred to Hospital':       'bg-amber-50/80 text-amber-700 border-amber-100/50',
  'Emergency Attention Needed': 'bg-rose-50/80 text-rose-700 border-rose-100/50',
};

function TreatmentBadge({ status }) {
  if (!status) return null;
  const cls = TREATMENT_COLORS[status] || 'bg-slate-50 text-slate-600 border-slate-200/60';
  return (
    <span className={`h-5 px-2 rounded text-[10px] font-semibold uppercase tracking-wider border flex items-center ${cls}`}>
      {status}
    </span>
  );
}

function SyncBadge({ syncStatus }) {
  if (!syncStatus || syncStatus === 'synced') return null;
  const meta = {
    pending: { cls: 'bg-amber-50/80 text-amber-700 border-amber-100/50' },
    syncing: { cls: 'bg-sky-50/80 text-sky-700 border-sky-100/50' },
    failed:  { cls: 'bg-rose-50/80 text-rose-700 border-rose-100/50' },
  }[syncStatus];
  if (!meta) return null;
  return (
    <span className={`h-5 px-2 text-[10px] font-semibold uppercase tracking-wider rounded border flex items-center ${meta.cls}`}>
      {syncStatus}
    </span>
  );
}

// ── Prescription card (collapsible list of medicines) ────────────────────────

function MedicineList({ prescription_data }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const pd = prescription_data || {};

  if (!pd.medicine_prescribed) return null;
  const meds = pd.medicines || [];
  if (meds.length === 0) return null;

  const preview = meds.slice(0, 2);
  const rest    = meds.slice(2);

  return (
    <div className="bg-slate-50/40 rounded-xl p-4 border border-slate-100/60 space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100/50 pb-2.5">
        <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase inline-flex items-center gap-1.5">
          <Pill size={11} className="text-slate-400" /> {t('patientFolder.medicinesPrescribed', 'Medicines Prescribed')}
        </span>
        {pd.prescriber_name && (
          <span className="text-[10px] font-medium text-slate-400">
            {t('patientFolder.byPrescriber', 'by {{prescriber}} ({{role}})', { prescriber: pd.prescriber_name, role: t((pd.prescribed_by || 'Doctor').toLowerCase(), pd.prescribed_by || 'Doctor') })}
          </span>
        )}
      </div>
      
      <div className="space-y-1">
        {[...preview, ...(expanded ? rest : [])].map((m, i) => (
          <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-100/50 last:border-0">
            <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100/50 flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-700 text-sm">{m.name}</p>
              <p className="text-xs text-slate-450 font-medium mt-0.5">
                {[m.dosage, m.duration].filter(Boolean).join(' · ')}
                {m.notes && ` — ${m.notes}`}
              </p>
            </div>
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full text-center text-xs font-semibold text-primary py-1 hover:underline active:scale-[0.98] transition-transform block select-none"
        >
          {expanded
            ? t('showLess', 'Show less')
            : t('patientFolder.moreMedicines', '+ {{count}} more medicine{{plural}}', { count: rest.length, plural: rest.length > 1 ? 's' : '' })}
        </button>
      )}
      
      {pd.clinic_name && (
        <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1 pt-1 border-t border-slate-100/40">
          <Building2 size={10} className="text-slate-350" /> {pd.clinic_name}
        </div>
      )}
    </div>
  );
}

// ── Prescription image gallery ───────────────────────────────────────────────

function PrescriptionGallery({ images }) {
  const { t } = useTranslation();
  const [lightbox, setLightbox] = useState(null);
  if (!images || images.length === 0) return null;
  return (
    <>
      <div className="bg-slate-50/40 border border-slate-100/60 rounded-xl p-4">
        <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase block mb-3">
          {t('patientFolder.prescriptionAttachments', 'Prescription Attachments ({{count}})', { count: images.length })}
        </span>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setLightbox(img)}
              className="aspect-square rounded-xl overflow-hidden border border-slate-200/40 shadow-sm hover:scale-105 active:scale-95 transition-all duration-300 cursor-zoom-in relative group"
            >
              <img src={img} alt={`Prescription ${i + 1}`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          ))}
        </div>
      </div>
      {lightbox && (
        <div
          className="fixed inset-0 z-[200] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-300"
          onClick={() => setLightbox(null)}
        >
          <div 
            className="relative max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl shadow-2xl border border-white/10 bg-white p-1 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox}
              alt="Prescription"
              className="w-full h-auto max-h-[80vh] rounded-xl object-contain"
            />
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-900/60 hover:bg-slate-900 text-white flex items-center justify-center text-lg font-bold border border-white/10 transition-colors"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PatientReportFolder({ t: propT }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { isServerReachable } = useConnection();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const isOffline = !isServerReachable;

  const currentUserId = JSON.parse(localStorage.getItem('user') || '{}')?.id;

  const { deleteTarget: dvTarget, isDeleting: dvDeleting, requestDelete: dvRequest,
    cancelDelete: dvCancel, confirmDelete: dvConfirm } =
    useDeleteVisit({ onDeleted: () => loadLocal() });

  const loadLocal = useCallback(async () => {
    const [folder, reports, visits, patient, allReminders] = await Promise.all([
      getReportFolder(id),
      getReportItemsForPatient(id),
      getVisitsForPatient(id),
      getPatientByIdOrLocalId(id),
      db.reminders.toArray().catch(() => []),
    ]);

    const reminders = allReminders.filter(r => 
      String(r.patientId) === String(id) || 
      String(r.patient_id) === String(id)
    );

    console.log('[PatientReportFolder DEBUG] loadLocal finished.', {
      patientId: id,
      folderFound: !!folder,
      patientFound: !!patient,
      reportsCount: reports.length,
      visitsCount: visits.length,
      remindersCount: reminders.length,
      visitsStatuses: visits.map(v => ({
        local_id: v.local_id,
        id: v.id,
        visit_date: v.visit_date || v.date,
        type: v.visit_type || v.type,
        status: v.status,
        syncStatus: v.syncStatus,
      })),
    });

    if (folder || reports.length > 0 || visits.length > 0 || patient) {
      setData({
        patient_name: patient?.name || folder?.name || `Patient #${id}`,
        patient_id:   patient?.id || folder?.patientId || null,
        local_id:     patient?.local_id || folder?.patientLocalId || null,
        gender:       patient?.gender || folder?.gender || null,
        age:          patient?.age || folder?.age || null,
        village:      patient?.village || folder?.village || null,
        category:     patient?.category || folder?.category || null,
        risk_level:   patient?.risk_level || null,
        weeks_of_pregnancy: patient?.weeks_of_pregnancy || null,
        phone:        patient?.phone || null,
        createdAt:    patient?.createdAt || folder?.createdAt || null,
        updatedAt:    patient?.updatedAt || folder?.updatedAt || null,
        syncStatus:   patient?.syncStatus || folder?.syncStatus || null,
        createdBy:    patient?.createdBy || folder?.createdBy || null,
        reports: reports.map(r => ({ ...r, sortDate: new Date(r.date || r.createdAt) })),
        visits:  visits.map(v  => ({ ...v, visit_date: v.visit_date || v.date, sortDate: new Date(v.visit_date || v.date || v.createdAt) })),
        reminders: reminders,
      });
      setLoading(false);
    }
  }, [id]);

  const fetchFromServer = useCallback(async () => {
    if (!isServerReachable) { setLoading(false); return; }
    console.log('[PatientReportFolder DEBUG] fetchFromServer started.', { patientId: id });
    try {
      const token = localStorage.getItem('token');
      const resp  = await fetch(`/api/reports/patient/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) { setLoading(false); return; }
      const res = await resp.json();

      console.log('[PatientReportFolder DEBUG] fetchFromServer success. Server API response retrieved.', {
        reportsCountOnServer: res.reports?.length || 0,
        visitsCountOnServer: res.visits?.length || 0,
      });

      if (res.reports?.length) await bulkUpsertReportItems(res.reports, id);
      if (res.visits?.length) {
        const tagged = res.visits.map(v => ({
          ...v,
          patientId:  String(id),
          visit_date: v.visit_date || v.date,
        }));
        await bulkUpsertVisits(tagged);
      }

      await loadLocal();
    } catch (err) {
      if (!(err instanceof NetworkError)) console.warn('[PatientReportFolder]', err);
      toast.error('Showing locally cached data 📡');
    } finally {
      setLoading(false);
    }
  }, [id, isServerReachable, loadLocal]);

  useEffect(() => {
    loadLocal().then(() => fetchFromServer());
  }, [id, loadLocal, fetchFromServer]);

  useEffect(() => {
    const handleUpdate = () => {
      console.log('[PatientReportFolder] Local write detected, refreshing local data');
      loadLocal();
    };
    window.addEventListener('local-data-written', handleUpdate);
    window.addEventListener('visit-added',        handleUpdate);
    window.addEventListener('visit-completed',    handleUpdate);
    window.addEventListener('visit-deleted',      handleUpdate);
    return () => {
      window.removeEventListener('local-data-written', handleUpdate);
      window.removeEventListener('visit-added',        handleUpdate);
      window.removeEventListener('visit-completed',    handleUpdate);
      window.removeEventListener('visit-deleted',      handleUpdate);
    };
  }, [loadLocal]);

  const getTypeIcon = (type) => {
    switch (type) {
      case 'Medical':      return <Activity className="text-blue-500" />;
      case 'Vaccination':  return <Syringe  className="text-purple-500" />;
      case 'Prescription': return <Pill     className="text-emerald-500" />;
      default:             return <FileText className="text-slate-500" />;
    }
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col items-center justify-center py-48">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
      <p className="text-slate-500 font-bold">{t('patientFolder.loadingHistory', 'Loading Medical History…')}</p>
    </div>
  );

  if (!data) return (
    <div className="flex flex-col items-center justify-center py-48 gap-4 px-6 text-center">
      <WifiOff className="w-16 h-16 text-amber-400" />
      <h2 className="text-xl font-bold text-slate-800">{t('patientFolder.couldNotLoad', 'Could not load patient folder')}</h2>
      <p className="text-slate-500 text-sm max-w-sm">{t('patientFolder.connectToInternet', "Connect to the internet to load this patient's records.")}</p>
      <button
        onClick={fetchFromServer}
        className="px-8 py-3 bg-primary text-on-primary rounded-full font-semibold hover:opacity-90 active:scale-95 transition-all"
      >
        {t('retry', 'Retry')}
      </button>
    </div>
  );

  const isOwner = data.createdBy == currentUserId || !data.createdBy;

  // Filter out automated report items representing completed visits to prevent visual duplicates.
  // Real clinical visits are dynamically rendered as rich VisitCards.
  const filteredReports = (data.reports || []).filter(r => !r.title?.startsWith('Visit —'));

  // Merge visits + legacy reports, sorted newest first
  const combinedHistory = [
    ...filteredReports.map(r  => ({ ...r,  _type: 'report', sortDate: new Date(r.date || r.createdAt) })),
    ...(data.visits  || []).map(v  => ({ ...v,  _type: 'visit',  sortDate: new Date(v.visit_date || v.date || v.created_at) })),
  ].sort((a, b) => b.sortDate - a.sortDate);

  return (
    <div className="min-h-screen bg-slate-50 pb-32">

      {/* ── Sticky Header ── */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-40 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/reports')}
              className="p-2 hover:bg-slate-50 rounded-full transition-colors"
            >
              <ArrowLeft size={22} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">{data.patient_name}</h1>
                {isOffline && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    <WifiOff size={10} /> {t('offline', 'Offline')}
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest">
                {t('patientFolder.medicalHistoryRecords', 'Medical History & Records')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isOffline && (
              <button
                onClick={fetchFromServer}
                className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400"
                aria-label="Refresh"
              >
                <RefreshCw size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">

        {/* ── Premium Patient Summary Section ── */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100/85 shadow-[0_4px_25px_rgba(0,0,0,0.015)] space-y-6">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100/60">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight leading-tight">
                  {data.patient_name}
                </h2>
                <span className="h-5 px-2 rounded bg-slate-50 border border-slate-200/60 text-[10px] font-mono text-slate-500 flex items-center">
                  {data.patient_id ? t('patientFolder.idLabel', 'ID #{{id}}', { id: data.patient_id }) : t('patientFolder.localRecord', 'Local Record')}
                </span>
                <span className="h-5 px-2 rounded bg-emerald-50 text-emerald-700 border border-emerald-100/60 text-[10px] font-semibold uppercase tracking-wider flex items-center">
                  {t((data.category || 'General').toLowerCase(), data.category || 'General')}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-1.5 flex items-center gap-1">
                <Calendar size={11} className="text-slate-350" /> {t('patientFolder.registeredOn', 'Registered on {{date}}', { date: fmtDate(data.createdAt) })}
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2 items-center">
              <span className={`h-5 px-2 rounded text-[10px] font-semibold uppercase tracking-wider border flex items-center ${
                data.syncStatus === 'synced' ? 'bg-emerald-50/80 text-emerald-700 border-emerald-100/60'
                : data.syncStatus === 'pending' ? 'bg-amber-50/80 text-amber-700 border-amber-100/60'
                : 'bg-rose-50/80 text-rose-700 border-rose-100/60'
              }`}>
                {t('patientFolder.syncStatus', 'Sync: {{status}}', { status: t((data.syncStatus || 'synced').toLowerCase(), data.syncStatus || 'synced') })}
              </span>
              {data.visits.some(v => (v.prescription_images || []).length > 0 || v.prescription_data?.medicine_prescribed) && (
                <span className="h-5 px-2 rounded bg-sky-50 text-sky-700 border border-sky-100/60 text-[10px] font-semibold tracking-wider uppercase flex items-center gap-1">
                  <Pill size={10} className="text-sky-500" /> {t('patientFolder.prescriptions', 'Prescriptions')}
                </span>
              )}
            </div>
          </div>

          {/* Section 2: Patient Meta Grid (clean 2-column responsive layout) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8 pt-5 border-t border-slate-100/60">
            <SummaryItem icon={<User size={13} className="text-emerald-600/80" />} label={t('patientFolder.ageGender', 'Age / Gender')} value={data.age || data.gender ? t('patientFolder.ageGenderValue', '{{age}} Yrs / {{gender}}', { age: data.age || 'NA', gender: t((data.gender || 'na').toLowerCase(), data.gender || 'NA') }) : 'NA'} />
            <SummaryItem icon={<MapPin size={13} className="text-emerald-600/80" />} label={t('patientFolder.villageRegion', 'Village / Region')} value={data.village || 'NA'} />
            <SummaryItem icon={<Heart size={13} className="text-emerald-600/80" />} label={t('patientFolder.riskLevel', 'Risk Level')} value={data.risk_level ? t((data.risk_level).toLowerCase(), data.risk_level.toUpperCase()) : 'NA'} valueClass={data.risk_level === 'high' ? 'text-rose-600' : 'text-slate-700'} />
            <SummaryItem icon={<Stethoscope size={13} className="text-emerald-600/80" />} label={t('patientFolder.ashaWorker', 'ASHA Worker')} value={
              (data.createdBy && String(data.createdBy) === String(currentUserId)) 
                ? t('patientFolder.defaultAshaName', 'Priya Devi') 
                : t('patientFolder.ashaWorkerDefault', 'ASHA Worker')
            } />
            <SummaryItem icon={<Clock size={13} className="text-emerald-600/80" />} label={t('patientFolder.totalVisits', 'Total Visits')} value={t('patientFolder.totalVisitsValue', '{{total}} Scheduled / {{completed}} Completed', { total: data.visits.length, completed: data.visits.filter(v => v.status === 'COMPLETED').length })} />
            <SummaryItem icon={<Clock size={13} className="text-emerald-600/80" />} label={t('patientFolder.pendingVisits', 'Pending Visits')} value={t('patientFolder.pendingVisitsValue', '{{count}} Remaining', { count: data.visits.filter(v => v.status !== 'COMPLETED').length })} />
            <SummaryItem icon={<Calendar size={13} className="text-emerald-600/80" />} label={t('patientFolder.latestVisit', 'Latest Visit')} value={
              [...(data.visits || [])].sort((a, b) => new Date(b.visit_date || b.date) - new Date(a.visit_date || a.date)).length > 0
                ? fmtDate([...(data.visits || [])].sort((a, b) => new Date(b.visit_date || b.date) - new Date(a.visit_date || a.date))[0].visit_date || [...(data.visits || [])].sort((a, b) => new Date(b.visit_date || b.date) - new Date(a.visit_date || a.date))[0].date)
                : 'NA'
            } />
            <SummaryItem icon={<Calendar size={13} className="text-emerald-600/80" />} label={t('patientFolder.followUpDueLabel', 'Follow-up Due')} value={
              [...(data.visits || [])].filter(v => v.next_checkup_date).sort((a, b) => new Date(b.visit_date || b.date) - new Date(a.visit_date || a.date)).length > 0
                ? fmtDate([...(data.visits || [])].filter(v => v.next_checkup_date).sort((a, b) => new Date(b.visit_date || b.date) - new Date(a.visit_date || a.date))[0].next_checkup_date)
                : 'NA'
            } />
          </div>
        </div>

        {!isOwner && (
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3 text-amber-800">
            <Info size={18} />
            <p className="text-sm font-bold">{t('patientFolder.readOnlyMode', 'You are viewing this record in read-only mode.')}</p>
          </div>
        )}

        {isOffline && (
          <div className="bg-sky-50 border border-sky-100 p-4 rounded-2xl flex items-center gap-3 text-sky-700">
            <WifiOff size={18} />
            <p className="text-sm font-bold">{t('patientFolder.offlineCachedRecords', 'Offline — showing locally cached records.')}</p>
          </div>
        )}

        {/* ── Timeline ── */}
        <div className="space-y-4 relative before:absolute before:left-6 before:top-4 before:bottom-0 before:w-0.5 before:bg-slate-200">
          {combinedHistory.length === 0 ? (
            <div className="py-24 text-center">
              <div className="w-24 h-24 bg-white rounded-[2rem] shadow-sm flex items-center justify-center mx-auto mb-6 text-slate-300">
                <Activity size={48} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">{t('patientFolder.noHistoryTitle', 'No medical history yet')}</h3>
              <p className="text-slate-500 font-medium">
                {t('patientFolder.noHistoryDesc', 'Medical records are automatically created when you complete a visit for this patient.')}
              </p>
            </div>
          ) : (
            combinedHistory.map((item, idx) => {
              if (item._type === 'visit') {
                return (
                  <VisitCard
                    key={`visit-${item.id || item.local_id}`}
                    item={item}
                    idx={idx}
                    navigate={navigate}
                    isOwner={isOwner}
                    onDeleteRequest={dvRequest}
                    reminders={data.reminders}
                  />
                );
              } else {
                // Legacy manual report items — still rendered for backward compat
                return (
                  <LegacyReportCard
                    key={`report-${item.id || item.local_id}`}
                    item={item}
                    idx={idx}
                    getTypeIcon={getTypeIcon}
                  />
                );
              }
            })
          )}
        </div>
      </div>

      {/* Delete visit modal */}
      {dvTarget && (
        <DeleteVisitModal
          visit={dvTarget}
          loading={dvDeleting}
          onConfirm={dvConfirm}
          onCancel={dvCancel}
        />
      )}
    </div>
  );
}

function SummaryItem({ icon, label, value, valueClass }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-7 h-7 rounded-lg bg-emerald-50/60 text-emerald-600/80 border border-emerald-100/30 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 tracking-widest uppercase block mb-0.5">
          {label}
        </span>
        <span className={`text-xs sm:text-sm font-semibold text-slate-700 block truncate leading-tight ${valueClass || ''}`}>
          {value || 'NA'}
        </span>
      </div>
    </div>
  );
}

// ── VisitCard ────────────────────────────────────────────────────────────────────

function VisitCard({ item, idx, navigate, isOwner, onDeleteRequest, reminders }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const d = item.details || {};
  const pd = item.prescription_data || {};
  const isCompleted = item.status === 'COMPLETED';
  const isOverdue   = item.status === 'PENDING' && new Date(item.visit_date || item.date) < new Date();

  // Find linked reminder
  const linkedReminder = (reminders || []).find(r => 
    (r.local_id && r.local_id === item.local_id) || 
    (r.id && item.id && String(r.id) === String(item.id)) ||
    (r.visit_id && item.id && String(r.visit_id) === String(item.id))
  );

  const isOfflineCreated = !item.id || String(item.local_id).startsWith('local_');
  const isPendingSync = item.syncStatus === 'pending' || item.syncStatus === 'retrying';

  const dotColor = isCompleted ? 'border-emerald-500 bg-emerald-500'
                : isOverdue   ? 'border-rose-400 bg-rose-400 animate-pulse'
                : 'border-amber-400 bg-amber-400 animate-pulse';

  const cardBg = 'bg-white border border-slate-100/80 shadow-[0_4px_20px_rgba(0,0,0,0.015)]';

  const hasVitals       = d.bp || d.sugar || d.weight || d.height;
  const hasMeds         = pd.medicine_prescribed && (pd.medicines || []).length > 0;
  const hasImages       = (item.prescription_images || []).length > 0;
  const hasClinical     = d.notes;
  const hasPrescription = hasMeds || hasImages || item.treatment_status;

  return (
    <div
      className="relative pl-14 animate-in slide-in-from-bottom-4 duration-500"
      style={{ animationDelay: `${idx * 60}ms` }}
    >
      {/* Timeline dot */}
      <div className={`absolute left-3 top-5 w-6 h-6 bg-white border-2 rounded-full flex items-center justify-center z-10 ${dotColor.split(' ').slice(0,1)}`}>
        <div className={`w-2 h-2 rounded-full ${dotColor.split(' ').slice(1).join(' ')}`} />
      </div>

      <div className={`rounded-2xl p-6 transition-all duration-300 hover:shadow-[0_10px_35px_rgba(0,0,0,0.025)] hover:-translate-y-0.5 ${cardBg}`}>
        {/* Header row */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100/60 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCompleted ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              <Activity size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 leading-tight">
                {t('patientFolder.visitTypeHeader', '{{type}} Visit', { type: t((item.visit_type || item.type || '').toLowerCase(), item.visit_type || item.type) })}
              </h3>
              <span className="text-[10px] font-medium text-slate-400 block mt-0.5">
                {fmtDate(item.visit_date || item.date)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <SyncBadge syncStatus={item.syncStatus} />
            {item.treatment_status && isCompleted && (
              <TreatmentBadge status={item.treatment_status} />
            )}
            <span className={`h-5 px-2 rounded text-[10px] font-semibold uppercase tracking-wider border flex items-center ${
              isCompleted ? 'bg-emerald-50/80 text-emerald-700 border-emerald-100/50'
              : isOverdue ? 'bg-rose-50/80 text-rose-700 border-rose-100/50'
              : 'bg-amber-50/80 text-amber-700 border-amber-100/50'
            }`}>
              {isCompleted ? t('completed', 'Completed') : isOverdue ? t('overdue', 'Overdue') : t('pending', 'Pending')}
            </span>
            {/* Delete visit button */}
            {isOwner && onDeleteRequest && (
              <button
                onClick={() => onDeleteRequest(item)}
                aria-label="Delete visit"
                title={t('patientFolder.deleteVisitTitle', 'Delete this visit')}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-350 hover:bg-rose-50 hover:text-rose-500 hover:border-rose-100 border border-transparent transition-all duration-200"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Rich Metadata Bar */}
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          {isOfflineCreated && (
            <span className="border border-slate-200 bg-slate-50/50 text-slate-505 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wider uppercase inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-505" />
              {t('offline', 'Offline')}
            </span>
          )}
          {isPendingSync && (
            <span className="border border-slate-200 bg-slate-50/50 text-slate-505 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wider uppercase inline-flex items-center gap-1.5 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-505" />
              {t('patientFolder.syncPending', 'Sync Pending')}
            </span>
          )}
          {linkedReminder ? (
            <span className="border border-slate-200 bg-slate-50/50 text-slate-505 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wider uppercase inline-flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${linkedReminder.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {t('patientFolder.reminderStatus', 'Reminder: {{status}} ({{date}})', { status: t(linkedReminder.status.toLowerCase(), linkedReminder.status), date: fmtDate(linkedReminder.visit_date || linkedReminder.date) })}
            </span>
          ) : (
            <span className="border border-slate-200 bg-slate-50/50 text-slate-400 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wider uppercase inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              {t('patientFolder.noReminder', 'No Reminder')}
            </span>
          )}
          {item.next_checkup_date && (
            <span className="border border-slate-200 bg-slate-50/50 text-slate-505 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wider uppercase inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {t('patientFolder.followUpDate', 'Follow-up: {{date}}', { date: fmtDate(item.next_checkup_date) })}
            </span>
          )}
        </div>

        {/* Visit notes (always visible) */}
        {item.notes && (
          <div className="bg-slate-50/40 border border-slate-100/60 p-4 rounded-xl mb-4">
            <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase block mb-1.5">{t('patientFolder.workerRemarks', 'Worker Remarks')}</span>
            <p className="text-slate-600 font-medium text-xs sm:text-sm leading-relaxed italic">
              "{item.notes}"
            </p>
          </div>
        )}

        {/* Completed visit details */}
        {isCompleted && (hasVitals || hasClinical || hasPrescription) && (
          <>
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-primary transition-colors mt-2 mb-3 select-none"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? t('patientFolder.hideDetails', 'Hide details') : t('patientFolder.viewDetails', 'View medical details')}
            </button>

            {expanded && (
              <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                {/* Vitals */}
                {hasVitals && (
                  <div className="bg-slate-50/40 border border-slate-100/60 p-4 rounded-xl">
                    <div className="flex items-center gap-2 border-b border-slate-100/50 pb-2 mb-3">
                      <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase inline-flex items-center gap-1.5">
                        <Activity size={11} className="text-slate-400" /> {t('patientFolder.vitalsRecorded', 'Vitals Recorded')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { k: 'bp',     label: t('bloodpressure', 'Blood Pressure'), unit: t('mmhg', 'mmHg') },
                        { k: 'sugar',  label: t('bloodsugar', 'Blood Sugar'),    unit: t('mgdl', 'mg/dL') },
                        { k: 'weight', label: t('weight', 'Weight'),         unit: t('kg', 'kg') },
                        { k: 'height', label: t('height', 'Height'),         unit: t('cm', 'cm') },
                      ].filter(({ k }) => d[k]).map(({ k, label, unit }) => (
                        <div key={k}>
                          <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase block mb-0.5">{label}</span>
                          <span className="text-xs sm:text-sm font-semibold text-slate-700 block">
                            {d[k]} <span className="text-[10px] font-normal text-slate-400">{unit}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    {d.severity && (
                      <div className="mt-3 pt-3 border-t border-slate-100/50 flex items-center gap-2">
                        <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">{t('patientFolder.severityLabel', 'Severity:')}</span>
                        <span className={`h-5 px-2 rounded text-[10px] font-semibold uppercase tracking-wider border flex items-center ${
                          d.severity === 'Severe'   ? 'bg-rose-50/80 text-rose-700 border-rose-100/50'
                          : d.severity === 'Moderate' ? 'bg-amber-50/80 text-amber-700 border-amber-100/50'
                          : 'bg-emerald-50/80 text-emerald-700 border-emerald-100/50'
                        }`}>
                          {t((d.severity || '').toLowerCase(), d.severity)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Clinical notes */}
                {hasClinical && (
                  <div className="bg-slate-50/40 border border-slate-100/60 p-4 rounded-xl">
                    <div className="flex items-center gap-2 border-b border-slate-100/50 pb-2 mb-2.5">
                      <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase inline-flex items-center gap-1.5">
                        <Stethoscope size={11} className="text-slate-400" /> {t('patientFolder.clinicalNotes', 'Clinical Notes')}
                      </span>
                    </div>
                    <p className="text-slate-650 font-medium text-xs sm:text-sm leading-relaxed italic">
                      "{d.notes}"
                    </p>
                  </div>
                )}

                {/* Medicines */}
                <MedicineList prescription_data={pd} />

                {/* Prescription images */}
                <PrescriptionGallery images={item.prescription_images} />

              </div>
            )}
          </>
        )}

        {/* CTA for pending visits — always navigate by local_id so CompleteVisit can safely update the correct IDB record */}
        {!isCompleted && (item.local_id || item.id) && isOwner && (
          <button
            onClick={() => navigate(`/visits/${item.local_id || item.id}/complete`)}
            className="mt-3 w-full py-3 bg-primary text-white rounded-xl font-bold text-sm tracking-tight hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 select-none"
          >
            {t('patientFolder.completeVisitBtn', 'Complete This Visit →')}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Legacy Report Card (for backward-compat with manual reports) ──────────────

function LegacyReportCard({ item, idx, getTypeIcon }) {
  const { t } = useTranslation();
  return (
    <div
      className="relative pl-14 animate-in slide-in-from-bottom-4 duration-500"
      style={{ animationDelay: `${idx * 60}ms` }}
    >
      <div className="absolute left-3 top-4 w-6 h-6 bg-white border-2 border-primary rounded-full flex items-center justify-center z-10">
        <div className={`w-2.5 h-2.5 rounded-full ${item.status === 'Completed' ? 'bg-primary' : 'bg-amber-400 animate-pulse'}`} />
      </div>

      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-50 rounded-2xl">{getTypeIcon(item.type || item.report_type)}</div>
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">{item.title}</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t((item.type || item.report_type || '').toLowerCase(), item.type || item.report_type).toUpperCase()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SyncBadge syncStatus={item.syncStatus} />
            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
              item.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {t((item.status || '').toLowerCase(), item.status)}
            </span>
          </div>
        </div>

        {item.description && (
          <p className="text-slate-600 font-medium mb-4 leading-relaxed bg-slate-50 p-3 rounded-2xl italic text-sm">
            "{item.description}"
          </p>
        )}

        <div className="flex flex-wrap gap-4 text-xs font-black text-slate-500 uppercase tracking-tighter">
          {item.doctor_name && (
            <span className="flex items-center gap-1.5">
              <User size={12} className="text-slate-300" /> {t('patientFolder.doctorPrefix', 'Dr.')} {item.doctor_name}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Clock size={12} className="text-slate-300" /> {fmtDate(item.date || item.createdAt)}
          </span>
          {item.next_follow_up && (
            <span className="flex items-center gap-1.5 text-amber-600">
              <Calendar size={12} className="text-amber-300" /> {t('patientFolder.followUpDate', 'Follow-up: {{date}}', { date: fmtDate(item.next_follow_up) })}
            </span>
          )}
        </div>

        {item.images?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {item.images.map((img, i) => (
              <img
                key={i}
                src={img}
                className="w-20 h-20 rounded-xl object-cover shadow-sm border border-slate-100 cursor-zoom-in hover:scale-105 transition-transform"
                alt="Report attachment"
                onClick={() => window.open(img, '_blank')}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
