import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { X, Loader2, Calendar, Clock, ClipboardList, WifiOff } from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { saveVisit, SYNC, db } from '../lib/db';
import { api, NetworkError } from '../utils/apiClient';
import { createLocalReminder } from '../lib/reminderEngine';
import { useConnection } from '../context/ConnectionContext';
import { useTranslation } from 'react-i18next';

export default function AddVisitModal({ isOpen, onClose, patientId, onSuccess }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const dragControls = useDragControls();
  // [Bug 10 equivalent] Use live connectivity state
  const { isServerReachable } = useConnection();

  // ── Synchronous ref-based submission lock ──────────────────────────────────
  // State-based guards (if (loading) return) are a race condition: two rapid
  // taps both read loading=false before the first call sets loading=true.
  // A ref is synchronously updated and checked, making it truly race-proof.
  const _submittingRef = useRef(false);

  const [formData, setFormData] = useState({
    visit_type: 'General',
    visit_date: new Date().toISOString().split('T')[0],
    visit_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric" }),
    notes: ''
  });

  const [validationErrors, setValidationErrors] = useState({
    visit_date: false,
    visit_time: false,
    visit_type: false
  });

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    // ── Race-proof double-submission guard ───────────────────────────────────
    // _submittingRef is synchronously checked and set before any async work,
    // so even simultaneous calls (from onSubmit + onClick, or rapid double-tap)
    // are blocked. The state-based `loading` guard is secondary.
    if (_submittingRef.current || loading) {
      console.warn('[AddVisitModal] handleSubmit blocked — submission already in progress.');
      return;
    }
    _submittingRef.current = true;

    console.log('[AddVisitModal] handleSubmit triggered!', { 
      formData, 
      patientId, 
      loading 
    });

    // Explicit client-side validation
    const errors = {
      visit_date: !formData.visit_date,
      visit_time: !formData.visit_time,
      visit_type: !formData.visit_type
    };
    
    setValidationErrors(errors);
    console.log('[AddVisitModal] Validation states evaluated:', errors);

    if (errors.visit_date || errors.visit_time || errors.visit_type) {
      toast.error(t('fillRequiredFields', "Please fill in all required fields."));
      
      // Auto-focus first invalid field
      if (errors.visit_date) {
        document.getElementById('visit-date-input')?.focus();
      } else if (errors.visit_time) {
        document.getElementById('visit-time-input')?.focus();
      }
      return;
    }

    setLoading(true);

    try {
      console.log('[AddVisitModal] Checking IndexedDB for existing pending visits. Patient:', patientId);
      // BUG 9 FIX: Check for existing PENDING visit for this patient before creating a new one.
      const existingPending = await db.visits
        .where('patientId').equals(String(patientId))
        .filter(v => v.status === 'PENDING' && v.visit_date === formData.visit_date)
        .first();
      
      console.log('[AddVisitModal] Existing pending visits check complete:', existingPending);

      if (existingPending) {
        toast(t('pendingVisitExists', 'A pending visit for this patient on this date already exists.'), { icon: 'ℹ️', duration: 4000 });
        onSuccess?.();
        onClose();
        return;
      }

      const local_id = crypto.randomUUID();
      const record = {
        local_id,
        patientId: String(patientId),
        type:      formData.visit_type,
        date:      formData.visit_date,
        time:      formData.visit_time,
        notes:     formData.notes,
        visit_date: formData.visit_date,
        visit_type: formData.visit_type,
        syncStatus: SYNC.PENDING,
        status:     'PENDING',
        createdAt:  new Date().toISOString(),
      };

      console.log('[AddVisitModal] Saving local visit record to IndexedDB:', record);
      // 1. Save locally first (never lost)
      await saveVisit(record);
      
      // Notify parent panel instantly
      window.dispatchEvent(new CustomEvent('local-data-written'));

      // Generate reminder locally immediately — no server round-trip needed.
      const patient = await db.patients
        .get(String(patientId))
        .catch(() => null) ||
        await db.patients.where('id').equals(Number(patientId)).first()
          .catch(() => null);
      if (patient) {
        console.log('[AddVisitModal] Triggering local reminder engine for patient:', patient.name);
        await createLocalReminder(record, patient);
      }

      // 2. Try to push immediately if server is reachable and patient is already synced
      let synced = false;
      const isSyncedPatient = !isNaN(Number(patientId));
      if (isServerReachable && isSyncedPatient) {
        try {
          console.log('[AddVisitModal] Immediate push: sending visit record to server API');
          const data = await api.post('/api/visits', record);
          const serverId = data?.visit?.id ?? data?.id;
          console.log('[AddVisitModal] Immediate push success! Server ID:', serverId, 'Full API response:', data);
          await saveVisit({ ...record, syncStatus: SYNC.SYNCED, id: serverId });
          synced = true;
          window.dispatchEvent(new CustomEvent('visit-added'));
        } catch (err) {
          if (!(err instanceof NetworkError)) {
            console.warn('[AddVisit] Immediate push failed:', err);
          }
        }
      }

      if (synced) {
        toast.success(t('visitScheduled', 'Visit scheduled successfully ✅'));
      } else {
        toast.success(t('visitSavedLocally', 'Visit scheduled successfully (saved offline) 📡'), { icon: '⏳' });
      }

      onSuccess?.();
      onClose();
      
      // Reset form fields
      setFormData({
        visit_type: 'General',
        visit_date: new Date().toISOString().split('T')[0],
        visit_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: 'numeric', minute: 'numeric' }),
        notes: '',
      });
      setValidationErrors({
        visit_date: false,
        visit_time: false,
        visit_type: false
      });
    } catch (err) {
      console.error('[AddVisitModal] Form submission crashed:', err);
      toast.error(err.message || t('failedToSaveVisit', 'Failed to save visit'));
    } finally {
      setLoading(false);
      _submittingRef.current = false; // always release lock
    }
  };

  const handleDragEnd = (event, info) => {
    if (info.offset.y > 100) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-md"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0 }}
            dragElastic={0.1}
            onDragEnd={handleDragEnd}
            className="relative w-full md:max-w-2xl bg-white rounded-t-[2.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.2)] flex flex-col h-[90dvh] overflow-hidden border border-slate-100"
          >
            {/* Draggable Handle */}
            <div 
              className="flex flex-col items-center pt-4 pb-2 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-14 h-1.5 bg-slate-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-8 pb-5 flex items-center justify-between border-b border-slate-50 flex-shrink-0">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-none">{t('scheduleVisit', 'Schedule Visit')}</h2>
                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-2">{t('newMedicalInteraction', 'New Medical Interaction')}</p>
              </div>
              <button 
                type="button"
                onClick={onClose} 
                onPointerDown={(e) => e.stopPropagation()}
                className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-full transition-all active:scale-90"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Unified Form & Sticky Footer container */}
            <form onSubmit={handleSubmit} noValidate className="flex-1 flex flex-col overflow-hidden">
              {/* Form Content */}
              <div 
                className="flex-grow overflow-y-auto px-8 py-6 space-y-6 scroll-smooth overscroll-contain no-scrollbar"
                style={{ scrollbarWidth: 'none' }}
              >
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-1">
                    <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
                      <Calendar size={14} className="text-[#0F766E]" />
                      {t('visitDate', 'Visit Date *')}
                    </label>
                    <input 
                      id="visit-date-input"
                      type="date"
                      onPointerDown={(e) => e.stopPropagation()}
                      className={`w-full bg-slate-50 border rounded-2xl p-4 focus:ring-4 focus:ring-primary/10 font-bold text-slate-900 text-base transition-all ${validationErrors.visit_date ? 'border-red-500 bg-red-50 ring-2 ring-red-500/20' : 'border-transparent'}`} 
                      value={formData.visit_date}
                      onChange={(e) => setFormData({...formData, visit_date: e.target.value})}
                    />
                    {validationErrors.visit_date && (
                      <p className="text-red-500 text-[10px] font-bold mt-1.5 ml-1 animate-in fade-in slide-in-from-top-1">
                        {t('visitDateRequired', 'Visit date is required')}
                      </p>
                    )}
                  </div>
                  <div className="col-span-1">
                    <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
                      <Clock size={14} className="text-[#0F766E]" />
                      {t('visitTime', 'Visit Time *')}
                    </label>
                    <input 
                      id="visit-time-input"
                      type="time"
                      onPointerDown={(e) => e.stopPropagation()}
                      className={`w-full bg-slate-50 border rounded-2xl p-4 focus:ring-4 focus:ring-primary/10 font-bold text-slate-900 text-base transition-all ${validationErrors.visit_time ? 'border-red-500 bg-red-50 ring-2 ring-red-500/20' : 'border-transparent'}`} 
                      value={formData.visit_time}
                      onChange={(e) => setFormData({...formData, visit_time: e.target.value})}
                    />
                    {validationErrors.visit_time && (
                      <p className="text-red-500 text-[10px] font-bold mt-1.5 ml-1 animate-in fade-in slide-in-from-top-1">
                        {t('visitTimeRequired', 'Visit time is required')}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
                      <ClipboardList size={14} className="text-[#0F766E]" />
                      {t('visitType', 'Visit Type *')}
                    </label>
                    <div className="relative">
                      <select 
                        onPointerDown={(e) => e.stopPropagation()}
                        className={`w-full bg-slate-50 border rounded-2xl p-4 pr-12 focus:ring-4 focus:ring-primary/10 font-bold text-slate-900 text-base appearance-none transition-all ${validationErrors.visit_type ? 'border-red-500 bg-red-50 ring-2 ring-red-500/20' : 'border-transparent'}`}
                        value={formData.visit_type}
                        onChange={(e) => setFormData({...formData, visit_type: e.target.value})}
                      >
                        <option value="General">{t('generalConsultation', 'General Consultation')}</option>
                        <option value="ANC">{t('ancCheckup', 'ANC Checkup')}</option>
                        <option value="Vaccination">{t('vaccination', 'Vaccination')}</option>
                        <option value="NCD">{t('ncdScreening', 'NCD Screening')}</option>
                        <option value="Follow-up">{t('followup', 'Follow-up')}</option>
                        <option value="Home Visit">{t('homeVisit', 'Home Visit')}</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <X size={16} className="rotate-45" />
                      </div>
                    </div>
                    {validationErrors.visit_type && (
                      <p className="text-red-500 text-[10px] font-bold mt-1.5 ml-1 animate-in fade-in slide-in-from-top-1">
                        {t('visitTypeRequired', 'Visit type is required')}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{t('schedulingNotes', 'Scheduling Notes (Optional)')}</label>
                  <textarea 
                    rows="4"
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-full bg-slate-50 border-none rounded-2xl p-5 focus:ring-4 focus:ring-primary/10 font-medium text-slate-900 text-base resize-none placeholder:text-slate-300" 
                    placeholder={t('visitNotesPlaceholder', 'Reason for visit, patient requests...')} 
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  />
                </div>

                {/* Prevent content from being hidden by keyboard or bottom nav */}
                <div className="h-10" />
              </div>

              {/* Sticky Action Footer */}
              <div 
                className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex gap-4 items-center justify-end flex-shrink-0"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
              >
                <button 
                  type="button"
                  onClick={onClose}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="px-8 py-4 font-black uppercase text-xs tracking-widest text-slate-400 hover:text-slate-900 transition-colors text-center"
                >
                  {t('discard', 'Discard')}
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`px-10 py-4 bg-[#0F766E] text-white rounded-full font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-2xl shadow-[#0F766E]/30 hover:scale-105 active:scale-95 transition-all ${loading ? 'opacity-50' : ''}`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('scheduling', 'Scheduling...')}</span>
                    </>
                  ) : (
                    <>
                      <ClipboardList className="w-4 h-4" />
                      <span>{t('scheduleVisit', 'Schedule Visit')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}


