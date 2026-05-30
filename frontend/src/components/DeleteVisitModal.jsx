/**
 * DeleteVisitModal — confirmation dialog for single-visit deletion.
 *
 * Props:
 *   visit    {object}   - the visit object being deleted
 *   loading  {boolean}  - true while deletion is in progress
 *   onConfirm {fn}      - called when user clicks "Delete"
 *   onCancel  {fn}      - called on cancel / backdrop click
 */
import React from 'react';
import { Trash2, Loader2, CalendarX2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return '—'; }
}

export default function DeleteVisitModal({ visit, loading, onConfirm, onCancel }) {
  const { t } = useTranslation();
  if (!visit) return null;

  const patientName = visit.patient_name || visit.patient || 'this patient';
  const visitDate   = visit.visit_date || visit.visit_datetime || visit.date;
  const visitType   = visit.visit_type || visit.type || 'General';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="del-visit-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ animation: 'dvModalIn 0.2s cubic-bezier(0.34,1.56,0.64,1)' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <CalendarX2 size={18} className="text-white" />
            </div>
            <div>
              <h2 id="del-visit-title" className="text-white font-headline font-bold text-base leading-tight">
                {t('deleteVisitRecord', 'Delete Visit Record')}
              </h2>
              <p className="text-orange-100 text-[11px] font-body mt-0.5">{t('deleteVisitSubtitle', 'This visit only — patient profile stays intact')}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-on-surface font-body text-sm leading-relaxed">
            {t('delete', 'Delete')}{' '}
            <span className="font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{t(visitType.toLowerCase().replace(/\s+/g, ''), visitType)}</span>
            {' '}{t('visitFor', 'visit for')}{' '}
            <span className="font-black text-slate-800">{patientName}</span>
            {' '}{t('on', 'on')}{' '}
            <span className="font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">{fmtDateTime(visitDate)}</span>
            ?
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
              {t('thisWillRemove', 'This will remove:')}
            </p>
            {[
              { text: 'This visit record & status', key: 'thisVisitRecordAndStatus' },
              { text: 'Associated reminder & overdue state', key: 'associatedReminderOverdue' },
              { text: 'Vitals & clinical notes', key: 'vitalsAndClinicalNotes' },
              { text: 'Attached prescription photos', key: 'attachedPrescriptionPhotos' }
            ].map(item => (
              <div key={item.key} className="flex items-center gap-2 text-[13px] font-body text-on-surface-variant">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                {t(item.key, item.text)}
              </div>
            ))}
          </div>

          <p className="text-[11px] font-bold text-emerald-600 text-center">
            {t('patientProfileIntact', '✓ Patient profile and all other visits remain intact.')}
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            id="btn-cancel-delete-visit"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-outline-variant/30 text-on-surface-variant font-body font-semibold text-sm hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
          >
            {t('cancel', 'Cancel')}
          </button>
          <button
            id="btn-confirm-delete-visit"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-body font-bold text-sm shadow-md hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> {t('deleting', 'Deleting…')}</>
            ) : (
              <><Trash2 size={14} /> {t('deleteVisit', 'Delete Visit')}</>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes dvModalIn {
          from { opacity: 0; transform: scale(0.9) translateY(12px); }
          to   { opacity: 1; transform: scale(1)  translateY(0); }
        }
      `}</style>
    </div>
  );
}
