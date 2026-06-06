import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Calendar, WifiOff, RefreshCw, Baby } from 'lucide-react';
import { api } from '../../utils/apiClient';

// Determine vaccination card colour by risk_level / health_status
function getStatusStyle(patient) {
  const level = (patient.risk_level || '').toLowerCase();
  const health = (patient.health_status || '').toLowerCase();
  if (level === 'high' || health.includes('critical')) {
    return {
      icon: 'bg-rose-50 text-rose-500',
      badge: 'bg-rose-500 text-white shadow-lg shadow-rose-200',
      label: 'Critical',
    };
  }
  if (level === 'medium' || health.includes('ongoing')) {
    return {
      icon: 'bg-amber-50 text-amber-500',
      badge: 'bg-amber-500 text-white shadow-lg shadow-amber-200',
      label: 'Ongoing',
    };
  }
  return {
    icon: 'bg-emerald-50 text-emerald-500',
    badge: 'bg-emerald-500 text-white',
    label: 'Active',
  };
}

export default function Vaccination({ t }) {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/api/programmes/vaccination');
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
          <h2 className="text-2xl font-black text-slate-800">Child Vaccination</h2>
          <p className="text-sm text-slate-400 font-medium">Tracking Immunization Schedule (Age ≤ 5)</p>
        </div>
        <button
          onClick={fetchPatients}
          aria-label="Refresh vaccination list"
          className="p-3 bg-emerald-50 text-emerald-500 rounded-2xl hover:bg-emerald-100 active:scale-95 transition-all"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {/* States */}
      {loading ? (
        <div className="py-20 text-center animate-pulse text-slate-400 font-bold uppercase tracking-widest text-xs">
          Loading Vaccination Records…
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
            No children under 5 registered
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {patients.map((p, i) => {
            const style = getStatusStyle(p);
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
                className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm cursor-pointer hover:shadow-md hover:border-emerald-100 transition-all active:scale-[0.98]"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-2xl ${style.icon}`}>
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">{p.name}</h3>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Age: {p.age != null ? `${p.age} yr` : 'Unknown'}
                        {p.gender ? ` · ${p.gender}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${style.badge}`}>
                    {style.label}
                  </span>
                </div>
                {p.village && (
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 p-3 rounded-2xl mt-2">
                    <Calendar size={12} />
                    Village: {p.village}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
