import React, { useState, useRef } from 'react';
import { X, Camera, Upload, Check, FileText, Activity, Pill, Syringe } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/apiClient';
import { useConnection } from '../context/ConnectionContext';

export default function AddReportModal({ isOpen, onClose, patientId, onSuccess }) {
  const { t } = useTranslation();
  const { isServerReachable } = useConnection();
  const [formData, setFormData] = useState({
    title: '',
    type: 'Medical',
    description: '',
    doctor_name: '',
    status: 'Ongoing',
    next_follow_up: '',
    images: []
  });
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const currentToken = localStorage.getItem('token');
    const body = new FormData();
    body.append('file', file);

    const loadId = toast.loading(t('uploadingImage', "Uploading image..."));
    try {
      const data = await api.post('/api/reports/upload', body);
      setFormData(prev => ({ ...prev, images: [...prev.images, data.url] }));
      toast.success(t('imageAttached', "Image attached"), { id: loadId });
    } catch (err) {
      toast.error(err.message, { id: loadId });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { saveReportItem, SYNC: SYNC_STATUS } = await import('../lib/db');
      const local_id = crypto.randomUUID();
      const record = {
        ...formData,
        local_id,
        patientId:      String(patientId),
        patientLocalId: String(patientId),
        report_type:    formData.type,
        syncStatus:     SYNC_STATUS.PENDING,
        createdAt:      new Date().toISOString(),
        date:           new Date().toISOString(),
      };

      // 1. Save locally first – immediate UI update
      await saveReportItem(record);
      window.dispatchEvent(new CustomEvent('local-data-written'));

      let synced = false;
      // 2. Push to server if online
      if (isServerReachable) {
        try {
          const data = await api.post('/api/reports/add', { ...formData, patient_id: patientId, local_id });
          const { markReportItemSynced } = await import('../lib/db');
          await markReportItemSynced(local_id, data.report_id);
          synced = true;
        } catch (err) {
          console.warn('[AddReportModal] Server push failed:', err);
        }
      }

      if (synced) {
        toast.success(t('reportAdded', 'Report added successfully ✅'));
      } else {
        toast.success(t('reportSavedLocally', 'Report saved locally — will sync when online 📡'), { icon: '⏳' });
      }

      onSuccess();
      onClose();
      setFormData({ title: '', type: 'Medical', description: '', doctor_name: '', status: 'Ongoing', next_follow_up: '', images: [] });
    } catch (err) {
      console.error('[AddReportModal] Error:', err);
      toast.error(t('failedToSaveReport', 'Failed to save report'));
    } finally {
      setLoading(false);
    }
  };

  const types = [
    { value: 'Medical', icon: <Activity size={18} />, label: t('medical', 'Medical') },
    { value: 'Vaccination', icon: <Syringe size={18} />, label: t('vaccination', 'Vaccination') },
    { value: 'Prescription', icon: <Pill size={18} />, label: t('prescription', 'Prescription') },
    { value: 'General', icon: <FileText size={18} />, label: t('general', 'General') }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-8 py-6 bg-primary text-on-primary flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black tracking-tight">{t('addRecord')}</h2>
            <p className="text-on-primary/70 text-sm font-medium">{t('medicalHistory') || "Document new medical events"}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          {/* Type Selector */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {types.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setFormData({ ...formData, type: type.value })}
                className={`flex flex-col items-center justify-center p-4 rounded-3xl border-2 transition-all gap-2 ${
                  formData.type === type.value 
                    ? "border-primary bg-primary/5 text-primary shadow-inner" 
                    : "border-slate-100 text-slate-400 hover:border-slate-200"
                }`}
              >
                {type.icon}
                <span className="text-[10px] font-black uppercase tracking-wider">{type.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div className="group">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">{t('reportTitle')}</label>
              <input
                required
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 focus:ring-2 focus:ring-primary/20 font-bold text-on-surface"
                placeholder={t('entryTitlePlaceholder') || "e.g., Routine Checkup"}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">{t('doctorName')}</label>
                <input
                  type="text"
                  value={formData.doctor_name}
                  onChange={(e) => setFormData({ ...formData, doctor_name: e.target.value })}
                  className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 focus:ring-2 focus:ring-primary/20 font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">{t('followUp')}</label>
                <input
                  type="date"
                  value={formData.next_follow_up}
                  onChange={(e) => setFormData({ ...formData, next_follow_up: e.target.value })}
                  className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 focus:ring-2 focus:ring-primary/20 font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">{t('notes')}</label>
              <textarea
                rows="3"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 focus:ring-2 focus:ring-primary/20 font-bold resize-none"
              />
            </div>

            {/* Status */}
            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-3xl">
              <label className="text-sm font-black text-slate-500 uppercase tracking-widest">{t('status')}</label>
              <div className="flex bg-white p-1 rounded-2xl shadow-sm">
                {['Ongoing', 'Completed'].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFormData({...formData, status: s})}
                    className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                      formData.status === s ? "bg-primary text-on-primary shadow-lg shadow-primary/20" : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {t(s.toLowerCase()) || s}
                  </button>
                ))}
              </div>
            </div>

            {/* Image Upload / Capture */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">{t('attachments') || "Photos"}</label>
                <div className="flex gap-2">
                    <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-4 py-2 bg-secondary-container text-secondary font-bold text-xs rounded-full hover:bg-secondary hover:text-on-secondary transition-all"
                    >
                        <Camera size={16} />
                        {t('capture')}
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleUpload} 
                        className="hidden" 
                        accept="image/*"
                        capture="environment" 
                    />
                </div>
              </div>
              
              <div className="flex flex-wrap gap-3">
                {formData.images.map((img, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-md group">
                    <img src={img} className="w-full h-full object-cover" alt="Report" />
                    <button 
                      type="button"
                      onClick={() => setFormData(prev => ({...prev, images: prev.images.filter((_, i) => i !== idx)}))}
                      className="absolute inset-0 bg-red-500/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              disabled={loading}
              className="w-full bg-primary text-on-primary py-5 rounded-3xl font-black text-lg tracking-tight hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/20 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3"
            >
              {loading ? (
                <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Check size={24} />
                  {t('saveRecord') || "Save Record"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
