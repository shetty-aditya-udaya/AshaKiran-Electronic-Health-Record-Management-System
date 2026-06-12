import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Thermometer, User, WifiOff, RefreshCw, HeartPulse } from 'lucide-react';
import { api } from '../../utils/apiClient';
import { useTranslation } from 'react-i18next';

function getRiskStyle(level) {
  switch ((level || '').toLowerCase()) {
    case 'high':   return 'text-rose-500';
    case 'medium': return 'text-amber-500';
    default:       return 'text-emerald-500';
  }
}

function getRiskLabel(level, t) {
  switch ((level || '').toLowerCase()) {
    case 'high':   return t('highRisk', 'High Risk');
    case 'medium': return t('moderateRisk', 'Moderate Risk');
    default:       return t('lowRisk', 'Low Risk');
  }
}

export default function NCDMonitoring({ t: propT }) {
  const navigate = useNavigate();
  const { t: i18nT } = useTranslation();
  const t = propT || i18nT;
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/api/programmes/ncd');
      setPatients(Array.isArray(data.patients) ? data.patients : []);
    } catch (err) {
      setError(err.message || 'Failed to load patients');
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const handlePatientClick = (patient) => {
    navigate(`/reports/${patient.id}`);
  };

  return (
    <div className="space-y-6">
      {/* Header — no + button */}
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800">{t('ncdMonitoring', 'NCD Monitoring')}</h2>
          <p className="text-sm text-slate-400 font-medium">{t('ncdMonitoringSub', 'Non-Communicable Chronic Diseases')}</p>
        </div>
        <button
          onClick={fetchPatients}
          aria-label={t('refreshNcdPatients', 'Refresh NCD patients')}
          className="p-3 bg-indigo-50 text-indigo-500 rounded-2xl hover:bg-indigo-100 active:scale-95 transition-all"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {/* States */}
      {loading ? (
        <div className="py-20 text-center animate-pulse text-slate-400 font-bold uppercase tracking-widest text-xs">
          {t('loadingNcdRecords', 'Loading NCD Records…')}
        </div>
      ) : error ? (
        <div className="p-10 text-center bg-white border border-slate-100 rounded-[2.5rem] space-y-3">
          <WifiOff size={40} className="mx-auto text-rose-300" />
          <p className="text-rose-500 font-bold text-sm">{error}</p>
          <button
            onClick={fetchPatients}
            className="mt-2 px-6 py-2 bg-rose-500 text-white text-xs font-black uppercase tracking-widest rounded-full"
          >
            {t('retry', 'Retry')}
          </button>
        </div>
      ) : patients.length === 0 ? (
        <div className="p-10 text-center bg-white border border-slate-100 rounded-[2.5rem]">
          <HeartPulse size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            {t('noNcdPatientsRegistered', 'No chronic NCD patients registered')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {patients.map((p, i) => {
            const ncd = p.ncd_status || {};
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
                onClick={() => handlePatientClick(p)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handlePatientClick(p)}
                aria-label={`${t('viewRecordsFor', 'View records for')} ${p.name}`}
                className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4 cursor-pointer hover:shadow-md hover:border-indigo-100 transition-all active:scale-[0.98]"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 text-indigo-500 rounded-2xl">
                      <User size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">{p.name}</h3>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${getRiskStyle(p.risk_level)}`}>
                        {getRiskLabel(p.risk_level, t)}
                      </span>
                    </div>
                  </div>
                  {p.disease && (
                    <span className="px-3 py-1 bg-indigo-100 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-full">
                      {t(p.disease.toLowerCase(), p.disease)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-3xl flex flex-col items-center">
                    <Activity size={16} className="text-indigo-500 mb-1" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('bloodpressure', 'Blood Pressure')}</p>
                    <p className="font-black text-slate-800">{ncd.bp || (p.health_status ? t(p.health_status.toLowerCase(), p.health_status) : '—')}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-3xl flex flex-col items-center">
                    <Thermometer size={16} className="text-indigo-500 mb-1" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('sugarLevel', 'Sugar Level')}</p>
                    <p className="font-black text-slate-800">
                      {ncd.sugar ? `${ncd.sugar} ${t('mgdl', 'mg/dL')}` : '—'}
                    </p>
                  </div>
                </div>

                {p.village && (
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    {t('villageLabelColon', 'Village:')} {p.village}
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

