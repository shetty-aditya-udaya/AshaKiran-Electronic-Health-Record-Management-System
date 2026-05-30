import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bug, WifiOff, RefreshCw, Stethoscope } from 'lucide-react';
import { API_BASE_URL } from '../../config';

const KNOWN_DISEASES = ['TB', 'Malaria', 'Dengue', 'Typhoid', 'Cholera'];

function getStatusBadgeStyle(status) {
  switch ((status || '').toLowerCase()) {
    case 'confirmed': return 'bg-rose-500 text-white shadow-lg shadow-rose-200';
    case 'suspected': return 'bg-amber-500 text-white shadow-lg shadow-amber-200';
    case 'recovered': return 'bg-emerald-500 text-white';
    default:          return 'bg-slate-200 text-slate-600';
  }
}

export default function DiseaseTracking({ t }) {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/programmes/disease`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const data = await res.json();
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

  // Count patients per known disease type
  const diseaseCounts = KNOWN_DISEASES.reduce((acc, d) => {
    acc[d] = patients.filter(
      (p) => (p.disease || '').toLowerCase() === d.toLowerCase()
    ).length;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header — no + button */}
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Disease Tracking</h2>
          <p className="text-sm text-slate-400 font-medium">Infectious Disease Surveillance</p>
        </div>
        <button
          onClick={fetchPatients}
          aria-label="Refresh disease tracking"
          className="p-3 bg-amber-50 text-amber-500 rounded-2xl hover:bg-amber-100 active:scale-95 transition-all"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {/* Quick disease-type stats (only show when data is loaded) */}
      {!loading && !error && patients.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {KNOWN_DISEASES.slice(0, 3).map((type) => (
            <div key={type} className="bg-white border border-slate-100 p-4 rounded-3xl text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{type}</p>
              <p className="text-xl font-black text-slate-800">{diseaseCounts[type]}</p>
            </div>
          ))}
        </div>
      )}

      {/* States */}
      {loading ? (
        <div className="py-20 text-center animate-pulse text-slate-400 font-bold uppercase tracking-widest text-xs">
          Loading Disease Records…
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
          <Stethoscope size={48} className="mx-auto text-slate-200 mb-4" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
            No infectious disease cases found
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">
            Active Cases ({patients.length})
          </h4>
          {patients.map((p, i) => (
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
              className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center justify-between cursor-pointer hover:shadow-md hover:border-amber-100 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-slate-50 text-amber-500 rounded-2xl">
                  <Bug size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{p.name}</h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {p.disease || 'Unknown Disease'}
                    {p.village ? ` · ${p.village}` : ''}
                  </p>
                  {p.age != null && (
                    <p className="text-[10px] text-slate-300 mt-0.5">Age {p.age}</p>
                  )}
                </div>
              </div>
              <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${getStatusBadgeStyle(p.health_status)}`}>
                {p.health_status || 'Active'}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
