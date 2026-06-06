import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Baby, AlertTriangle, Calendar, RefreshCw, WifiOff } from 'lucide-react';
import { api } from '../../utils/apiClient';

export default function MaternalHealth({ t }) {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/api/programmes/maternal');
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
          <h2 className="text-2xl font-black text-slate-800">Maternal Health</h2>
          <p className="text-sm text-slate-400 font-medium">ANC Tracking &amp; EDD</p>
        </div>
        <button
          onClick={fetchPatients}
          aria-label="Refresh maternal patients"
          className="p-3 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-100 active:scale-95 transition-all"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {/* States */}
      {loading ? (
        <div className="py-20 text-center animate-pulse text-slate-400 font-bold uppercase tracking-widest text-xs">
          Loading Maternal Records…
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
          <Baby size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            No active maternal records
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {patients.map((p, i) => {
            const isHighRisk = p.is_high_risk || p.risk_level === 'high';
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
                className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center justify-between cursor-pointer hover:shadow-md hover:border-rose-100 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-2xl ${isHighRisk ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-400'}`}>
                    {isHighRisk ? <AlertTriangle size={20} /> : <Baby size={20} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">{p.name}</h3>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                      <Calendar size={12} />
                      EDD: {p.anc_edd || 'Not Set'}
                    </div>
                    {p.weeks_pregnant && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {p.weeks_pregnant} weeks pregnant
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isHighRisk && (
                    <span className="px-3 py-1 bg-rose-500 text-white text-[10px] font-black uppercase tracking-tighter rounded-full shadow-lg shadow-rose-200">
                      High Risk
                    </span>
                  )}
                  {p.village && (
                    <span className="text-[10px] text-slate-400 font-medium">{p.village}</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
