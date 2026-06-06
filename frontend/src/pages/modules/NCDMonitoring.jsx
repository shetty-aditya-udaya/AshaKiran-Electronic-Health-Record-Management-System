import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Thermometer, User, WifiOff, RefreshCw, HeartPulse } from 'lucide-react';
import { api } from '../../utils/apiClient';

function getRiskStyle(level) {
  switch ((level || '').toLowerCase()) {
    case 'high':   return 'text-rose-500';
    case 'medium': return 'text-amber-500';
    default:       return 'text-emerald-500';
  }
}

function getRiskLabel(level) {
  switch ((level || '').toLowerCase()) {
    case 'high':   return 'High Risk';
    case 'medium': return 'Moderate Risk';
    default:       return 'Low Risk';
  }
}

export default function NCDMonitoring({ t }) {
  const navigate = useNavigate();
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
          <h2 className="text-2xl font-black text-slate-800">NCD Monitoring</h2>
          <p className="text-sm text-slate-400 font-medium">Non-Communicable Chronic Diseases</p>
        </div>
        <button
          onClick={fetchPatients}
          aria-label="Refresh NCD patients"
          className="p-3 bg-indigo-50 text-indigo-500 rounded-2xl hover:bg-indigo-100 active:scale-95 transition-all"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {/* States */}
      {loading ? (
        <div className="py-20 text-center animate-pulse text-slate-400 font-bold uppercase tracking-widest text-xs">
          Loading NCD Records…
        </div>
      ) : error ? (
        <div className="p-10 text-center bg-white border border-slate-100 rounded-[2.5rem] space-y-3">
          <WifiOff size={40} className="mx-auto text-rose-300" />
          <p className="text-rose-500 font-bold text-sm">{error}</p>
          <button
            onClick={fetchPatients}
            className="mt-2 px-6 py-2 bg-rose-500 text-white text-xs font-black uppercase tracking-widest rounded-full"
          >
            Retry
          </button>
        </div>
      ) : patients.length === 0 ? (
        <div className="p-10 text-center bg-white border border-slate-100 rounded-[2.5rem]">
          <HeartPulse size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            No chronic NCD patients registered
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
                aria-label={`View records for ${p.name}`}
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
                        {getRiskLabel(p.risk_level)}
                      </span>
                    </div>
                  </div>
                  {p.disease && (
                    <span className="px-3 py-1 bg-indigo-100 text-indigo-600 text-[10px] font-black uppercase tracking-widest rounded-full">
                      {p.disease}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-3xl flex flex-col items-center">
                    <Activity size={16} className="text-indigo-500 mb-1" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Blood Pressure</p>
                    <p className="font-black text-slate-800">{ncd.bp || p.health_status || '—'}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-3xl flex flex-col items-center">
                    <Thermometer size={16} className="text-indigo-500 mb-1" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sugar Level</p>
                    <p className="font-black text-slate-800">
                      {ncd.sugar ? `${ncd.sugar} mg/dL` : '—'}
                    </p>
                  </div>
                </div>

                {p.village && (
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Village: {p.village}
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
