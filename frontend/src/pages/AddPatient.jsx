import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Loader2, WifiOff } from 'lucide-react';
import { SYNC } from '../lib/db';
import { useConnection } from '../context/ConnectionContext';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/apiClient';

export default function AddPatient({ isOpen, onClose, onSuccess, onAddPatient }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'Female',
    village: '',
    phone: '',
    category: 'General',
    disease: '',
    is_pregnant: false,
    weeks_of_pregnancy: '',
    risk_level: 'low'
  });
  
  const [loading, setLoading] = useState(false);
  // [Bug 10] Use live connection state — navigator.onLine is stale after render
  const { isServerReachable } = useConnection();
  const isOffline = !isServerReachable;

  const categories = [
    "General", "Pregnancy", "Child Health", "Elderly Care", "Chronic Disease", 
    "Diabetes", "Hypertension", "Heart Disease", "Respiratory (Asthma, TB)", 
    "Infectious Disease", "Mental Health", "Nutrition / Malnutrition", 
    "Disability", "Vaccination Follow-up", "Post-Surgery Care", "Other"
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.phone || !formData.age || !formData.village) {
      toast.error(t('fillRequiredFields', "Please fill in all required fields."));
      return;
    }
    if (formData.category === "Other" && !formData.disease) {
      toast.error(t('specifyCondition', "Please specify the disease/condition."));
      return;
    }

    setLoading(true);
    
    const finalizedData = {
      ...formData,
      local_id:    crypto.randomUUID(),
      is_pregnant: formData.category === 'Pregnancy',
      risk_level:  (formData.category === 'Pregnancy' && parseInt(formData.weeks_of_pregnancy) > 35) ? 'high' : 'low',
      createdAt:   new Date().toISOString(),
    };

    try {
      let savedRecord;

      if (onAddPatient) {
        // Offline-first path (usePatients hook)
        savedRecord = await onAddPatient(finalizedData);
      } else {
        // Fallback: direct API (legacy)
        const data = await api.post('/api/patients', finalizedData);
        savedRecord = data.patient;
      }

      const wasPending = savedRecord?.syncStatus === SYNC.PENDING;
      if (wasPending) {
        toast.success(t('patientSavedLocally', "Patient saved locally — will sync when online 📡"), { icon: '⏳' });
      } else {
        toast.success(t('patientRegistered', "Patient Registered Successfully ✅"));
      }

      onSuccess?.(savedRecord);
      onClose();
      resetForm();
    } catch (err) {
      console.error("Submission error:", err);
      toast.error(t('failedToSavePatient', "Failed to save patient. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '', age: '', gender: 'Female', village: '', phone: '',
      category: 'General', disease: '', is_pregnant: false, weeks_of_pregnancy: '', risk_level: 'low'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center p-0 md:p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full md:max-w-2xl rounded-t-[2.5rem] md:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden max-h-[92vh] md:max-h-[85vh] animate-in slide-in-from-bottom-8 md:zoom-in-95 duration-500 border border-slate-100">
        <div className="p-6 md:p-10 border-b border-slate-50 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter leading-none">{t('registerPatient', 'Register Patient')}</h2>
            <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-widest mt-3 md:mt-4 leading-none opacity-70">
              {t('nhmArchive', 'National Health Mission • Digital Archive')}
            </p>
            {isOffline && (
              <div className="mt-2.5 flex items-center gap-2 text-amber-600 text-xs font-semibold">
                <WifiOff size={13} />
                {t('offlineWillSync', 'Offline — data will sync when connected')}
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-3 md:p-4 hover:bg-slate-50 rounded-full transition-colors group">
            <X className="w-5 h-5 md:w-6 md:h-6 text-slate-400 group-hover:text-slate-900" />
          </button>
        </div>

        <form 
          onSubmit={handleSubmit} 
          className="p-6 md:p-10 flex-1 overflow-y-auto -webkit-overflow-scrolling-touch no-scrollbar"
          style={{ scrollbarWidth: 'none' }}
        >
          <div className="grid grid-cols-2 gap-6 md:gap-8">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{t('fullNameLabel', 'Full Name *')}</label>
              <input 
                required
                className="w-full bg-slate-50 border-none rounded-3xl p-5 focus:ring-4 focus:ring-primary/10 font-bold text-slate-900 transition-all placeholder:text-slate-300" 
                placeholder={t('patientFullNamePlaceholder', "Patient's Full Name")} 
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{t('phoneNumberLabel', 'Phone Number *')}</label>
              <input 
                required
                className="w-full bg-slate-50 border-none rounded-3xl p-5 focus:ring-4 focus:ring-primary/10 font-bold text-slate-900 transition-all placeholder:text-slate-300" 
                placeholder="+91 00000 00000" 
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{t('ageLabel', 'Age *')}</label>
              <input 
                required
                className="w-full bg-slate-50 border-none rounded-3xl p-5 focus:ring-4 focus:ring-primary/10 font-bold text-slate-900 transition-all" 
                placeholder={t('agePlaceholder', 'Age in Years')} 
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({...formData, age: e.target.value})}
              />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{t('genderLabel', 'Gender *')}</label>
              <select 
                className="w-full bg-slate-50 border-none rounded-3xl p-5 focus:ring-4 focus:ring-primary/10 font-black text-slate-900 transition-all"
                value={formData.gender}
                onChange={(e) => setFormData({...formData, gender: e.target.value})}
              >
                <option value="Female">{t('female', 'Female')}</option>
                <option value="Male">{t('male', 'Male')}</option>
                <option value="Other">{t('other', 'Other')}</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{t('primaryCategoryLabel', 'Primary Category *')}</label>
              <select 
                className="w-full bg-slate-50 border-none rounded-3xl p-5 focus:ring-4 focus:ring-primary/10 font-black text-slate-900 transition-all"
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {t(cat.toLowerCase().replace(/[^a-z0-9]/g, ''), cat)}
                  </option>
                ))}
              </select>
            </div>

            {(formData.category === 'Other' || formData.category === 'Chronic Disease' || formData.category === 'Respiratory (Asthma, TB)') && (
              <div className="col-span-2 animate-in slide-in-from-top-4 duration-300">
                 <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-3 ml-1">{t('specifyConditionLabel', 'Specify Disease / Condition *')}</label>
                 <input 
                   required
                   className="w-full bg-primary/5 border-2 border-primary/10 rounded-3xl p-5 focus:ring-4 focus:ring-primary/5 font-bold text-slate-900 outline-none"
                   placeholder={t('specifyConditionPlaceholder', 'e.g. Type 2 Diabetes, Severe Asthma...')}
                   value={formData.disease}
                   onChange={(e) => setFormData({...formData, disease: e.target.value})}
                 />
              </div>
            )}

            <div className="col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">{t('villageHamletLabel', 'Village / Hamlet *')}</label>
              <input 
                required
                className="w-full bg-slate-50 border-none rounded-3xl p-5 focus:ring-4 focus:ring-primary/10 font-bold text-slate-900 transition-all placeholder:text-slate-300" 
                placeholder={t('enterVillagePlaceholder', 'Enter village name')} 
                type="text"
                value={formData.village}
                onChange={(e) => setFormData({...formData, village: e.target.value})}
              />
            </div>

            {formData.category === 'Pregnancy' && (
              <div className="col-span-2 p-8 bg-primary/5 rounded-[2.5rem] border border-primary/10 animate-in slide-in-from-top-4 duration-300">
                <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-3">{t('weeksPregnancyLabel', 'Weeks of Pregnancy')}</label>
                <input 
                  type="number" 
                  className="w-full bg-white border-none rounded-2xl p-5 focus:ring-4 focus:ring-primary/10 outline-none font-bold"
                  placeholder="e.g. 12"
                  value={formData.weeks_of_pregnancy}
                  onChange={(e) => setFormData({...formData, weeks_of_pregnancy: e.target.value})}
                />
              </div>
            )}
          </div>

          {/* Form Actions Footer inside the scrollable container */}
          <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col sm:flex-row gap-4 justify-end pb-36 md:pb-6">
            <button 
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-10 py-4 font-black uppercase text-xs tracking-widest text-slate-400 hover:text-slate-900 transition-colors order-2 sm:order-1 text-center"
            >
              {t('discard', 'Discard')}
            </button>
            <button 
              type="submit"
              disabled={loading}
              className={`w-full sm:w-auto px-12 py-5 bg-primary text-white rounded-full font-black uppercase text-xs tracking-widest shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 order-1 sm:order-2 ${loading ? 'opacity-50' : ''}`}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? t('saving', 'Saving…') : isOffline ? `⏳ ${t('saveLocally', 'Save Locally')}` : t('savePatientProfile', 'Save Patient Profile')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
