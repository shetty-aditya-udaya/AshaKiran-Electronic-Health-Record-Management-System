import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/apiClient';
import { useConnection } from '../context/ConnectionContext';
import AddVisitModal from './AddVisitModal';
import { getVisitsForPatient, bulkUpsertVisits } from '../lib/db';
import {
  X, Phone, FolderOpen, CalendarPlus,
  Activity, Droplet, Weight, Ruler, Pill,
  Clock, CheckCircle2, AlertCircle, Trash2
} from 'lucide-react';
import { useDeleteVisit } from '../hooks/useDeleteVisit';
import DeleteVisitModal from './DeleteVisitModal';
import { useTranslation } from 'react-i18next';

function VitalChip({ icon, label, value, unit }) {
  const { t } = useTranslation();
  if (!value) return null;
  const translationKey = label.toLowerCase().replace(/\s+/g, '');
  return (
    <div className="bg-teal-50 border border-teal-100 rounded-2xl p-3.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-teal-500">{icon}</span>
        <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">{t(translationKey, label)}</p>
      </div>
      <p className="text-lg font-black text-on-surface leading-none">
        {value} <span className="text-xs font-medium text-on-surface-variant">{t(unit.toLowerCase(), unit)}</span>
      </p>
    </div>
  );
}

export default function PatientDetailsPanel({ patient, isOpen, onClose, onAddVisit, onDeleteRequest }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [visits, setVisits]   = useState([]);
  const [loading, setLoading] = useState(false);
  const { isServerReachable } = useConnection();

  const { deleteTarget, isDeleting, requestDelete, cancelDelete, confirmDelete } =
    useDeleteVisit({ onDeleted: () => loadLocalVisits() });

  const loadLocalVisits = useCallback(async () => {
    if (!patient) return;
    try {
      const pid = patient.id?.toString() || patient.local_id;
      if (pid) {
        const localVisits = await getVisitsForPatient(pid);
        let merged = [...localVisits];
        // If we have both, also check by the other just in case
        if (patient.id && patient.local_id) {
          const extra = await getVisitsForPatient(patient.local_id);
          for (const ev of extra) {
            if (!merged.some(mv => mv.local_id === ev.local_id)) {
              merged.push(ev);
            }
          }
        }
        // sort by date descending
        merged.sort((a, b) => new Date(b.visit_date || b.date) - new Date(a.visit_date || a.date));
        setVisits(merged);
      }
    } catch (err) {
      console.error('Failed to load local visits:', err);
    }
  }, [patient]);

  const fetchVisits = useCallback(async () => {
    if (!patient) return;
    setLoading(true);
    // 1. Instant offline render
    await loadLocalVisits();

    // 2. Fetch fresh online in background
    if (isServerReachable && patient.id) {
      try {
        const data = await api.get(`/api/visits?patientId=${patient.id}`);
        const serverVisits = data.visits || [];
        if (serverVisits.length > 0) {
          await bulkUpsertVisits(serverVisits);
          await loadLocalVisits();
        }
      } catch (err) {
        console.warn('Failed to fetch visits from server:', err);
      }
    }
    setLoading(false);
  }, [patient, loadLocalVisits, isServerReachable]);

  useEffect(() => {
    if (isOpen && patient) {
      fetchVisits();
    }
  }, [isOpen, patient, fetchVisits]);

  useEffect(() => {
    if (isOpen && patient) {
      const handleUpdate = () => {
        loadLocalVisits();
      };
      window.addEventListener('local-data-written', handleUpdate);
      window.addEventListener('visit-added', handleUpdate);
      return () => {
        window.removeEventListener('local-data-written', handleUpdate);
        window.removeEventListener('visit-added', handleUpdate);
      };
    }
  }, [isOpen, patient, loadLocalVisits]);

  if (!patient || !isOpen) return null;

  const latestVisit  = visits[0] ?? null;
  const latestDetails = latestVisit?.details || {};

  const pendingCount   = visits.filter(v => v.status === 'PENDING').length;
  const completedCount = visits.filter(v => v.status === 'COMPLETED').length;

  return (
    <div className="glass-card overflow-hidden animate-in slide-in-from-right-6 duration-400 shadow-glass-lg">
      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-teal-100/60">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-black text-on-surface tracking-tight leading-tight truncate">{patient.name}</h2>
            <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest mt-1">
              ASHA-{patient.local_id?.slice(0, 6).toUpperCase() || 'ID'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={`tel:${patient.phone}`}
              className="w-10 h-10 bg-teal-50 text-teal-700 rounded-xl flex items-center justify-center hover:bg-teal-600 hover:text-white transition-all active:scale-90 touch-manipulation"
              aria-label="Call patient"
            >
              <Phone size={16} />
            </a>
            <button
              onClick={onClose}
              className="xl:hidden w-10 h-10 bg-slate-100 text-slate-500 rounded-xl flex items-center justify-center hover:bg-slate-200 transition-all active:scale-90"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Info row */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span className="text-sm font-medium text-on-surface-variant">
            {patient.age}y · {patient.gender ? t(patient.gender.toLowerCase(), patient.gender) : ''}
          </span>
          <span className="text-teal-300">·</span>
          <span className="text-sm font-medium text-on-surface-variant">{patient.village}</span>
          {patient.risk_level === 'high' && (
            <span className="badge-critical px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border flex items-center gap-1">
              <AlertCircle size={10} /> {t('highRisk', 'High Risk')}
            </span>
          )}
        </div>

        {/* Visit stats row */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
            <CheckCircle2 size={12} /> {t('doneCount', '{{count}} done', { count: completedCount })}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600">
            <Clock size={12} /> {t('pendingCount', '{{count}} pending', { count: pendingCount })}
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
        {/* ── Latest Vitals ── */}
        {latestVisit && (
          <div>
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-3">
              {t('lastVisit', 'Last Visit')} — {new Date(latestVisit.visit_date || latestVisit.visit_datetime).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <VitalChip icon={<Activity size={13} />} label="Blood Pressure" value={latestDetails.bp} unit="mmHg" />
              <VitalChip icon={<Droplet size={13} />} label="Blood Sugar" value={latestDetails.sugar} unit="mg/dL" />
              <VitalChip icon={<Weight size={13} />} label="Weight" value={latestDetails.weight} unit="kg" />
              <VitalChip icon={<Ruler size={13} />} label="Height" value={latestDetails.height} unit="cm" />
            </div>
            {latestDetails.medications && (
              <div className="mt-2.5 bg-amber-50 border border-amber-100 rounded-2xl p-3.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <Pill size={13} className="text-amber-500" />
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">{t('medications', 'Medications')}</p>
                </div>
                <p className="text-sm font-medium text-on-surface leading-relaxed">{latestDetails.medications}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Medical Timeline ── */}
        <div>
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-3">{t('medicalTimeline', 'Medical Timeline')}</p>

          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : visits.length === 0 ? (
            <p className="text-sm font-medium text-on-surface-variant bg-slate-50 rounded-2xl p-4 text-center">
              {t('noVisits', 'No visits recorded yet')}
            </p>
          ) : (
            <div className="relative border-l-2 border-teal-100 ml-3 space-y-5 pb-2">
              {visits.map((visit, idx) => (
                <div key={visit.id || visit.local_id} className="relative pl-7 group/visit">
                  <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white ${
                    visit.status === 'COMPLETED' ? 'bg-emerald-400 shadow-sm' : 'bg-amber-300'
                  }`} />
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${idx === 0 ? 'text-teal-600' : 'text-on-surface-variant'}`}>
                        {new Date(visit.visit_date || visit.visit_datetime).toLocaleDateString('en-IN', { year:'numeric', month:'short', day:'numeric' })}
                      </p>
                      <p className="text-sm font-bold text-on-surface">{visit.visit_type ? t(visit.visit_type.toLowerCase().replace(/\s+/g, ''), visit.visit_type) : ''}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${
                          visit.status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600'
                        }`}>{visit.status ? t(visit.status.toLowerCase(), visit.status) : ''}</span>
                        {visit.details?.severity && (
                          <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                            visit.details.severity === 'Severe' ? 'bg-red-50 text-red-600' :
                            visit.details.severity === 'Moderate' ? 'bg-amber-50 text-amber-600' :
                            'bg-emerald-50 text-emerald-600'
                          }`}>{t(visit.details.severity.toLowerCase(), visit.details.severity)}</span>
                        )}
                      </div>
                      {visit.notes && (
                        <p className="text-xs text-on-surface-variant mt-1 font-medium leading-relaxed">{visit.notes}</p>
                      )}
                    </div>
                    {/* Delete visit button */}
                    <button
                      onClick={() => requestDelete({ ...visit, patient_name: patient?.name })}
                      aria-label="Delete this visit"
                      title="Delete visit"
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:bg-rose-50 hover:text-rose-500 opacity-0 group-hover/visit:opacity-100 transition-all duration-150 active:scale-90 flex-shrink-0 mt-0.5"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="px-6 py-4 border-t border-teal-100/60 flex gap-3 flex-wrap">
        <button
          onClick={onAddVisit}
          className="btn-primary flex-1 text-[11px] uppercase tracking-widest"
        >
          <CalendarPlus size={16} /> {t('addVisit') || 'Add Visit'}
        </button>
        <button
          onClick={() => navigate(`/reports/${patient.id || patient.local_id}`)}
          className="btn-secondary flex-1 text-[11px] uppercase tracking-widest"
        >
          <FolderOpen size={16} /> {t('viewRecords') || 'Records'}
        </button>
        {onDeleteRequest && (
          <button
            onClick={onDeleteRequest}
            aria-label={`Delete ${patient.name}`}
            title="Delete patient and all records"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 border border-transparent hover:border-rose-100 transition-all active:scale-90 flex-shrink-0"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Delete visit modal */}
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
