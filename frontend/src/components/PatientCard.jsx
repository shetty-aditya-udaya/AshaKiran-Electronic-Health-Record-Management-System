import React from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ─── Category config ─────────────────────────────────────────────────────────
const CATEGORY_STYLES = {
  pregnancy:  { label: 'Pregnancy',   key: 'pregnancy', dot: 'bg-rose-500',    chip: 'bg-rose-50 text-rose-700'     },
  chronic:    { label: 'Chronic',     key: 'chronic',   dot: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700'   },
  childcare:  { label: 'Childcare',   key: 'childcare', dot: 'bg-sky-500',     chip: 'bg-sky-50 text-sky-700'       },
  diabetes:   { label: 'Diabetes',    key: 'diabetes',  dot: 'bg-orange-500',  chip: 'bg-orange-50 text-orange-700' },
  infectious: { label: 'Infectious',  key: 'infectious',dot: 'bg-purple-500',  chip: 'bg-purple-50 text-purple-700' },
  general:    { label: 'General',     key: 'general',   dot: 'bg-teal-500',    chip: 'bg-teal-50 text-teal-700'     },
};

function getCatStyle(patient) {
  const raw = patient.category || (patient.is_pregnant ? 'pregnancy' : 'general');
  const key = raw.toLowerCase();
  return CATEGORY_STYLES[key] || { label: raw, key: key, dot: 'bg-teal-500', chip: 'bg-teal-50 text-teal-700' };
}

function getInitials(name = '') {
  return name.trim().split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
}

// Avatar background colour cycling by id
const AVATAR_PALETTES = [
  { bg: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100' },
  { bg: 'bg-amber-50 text-amber-600',     border: 'border-amber-100'   },
  { bg: 'bg-sky-50 text-sky-600',         border: 'border-sky-100'     },
  { bg: 'bg-purple-50 text-purple-600',   border: 'border-purple-100'  },
  { bg: 'bg-rose-50 text-rose-600',       border: 'border-rose-100'    },
];
function avatarPalette(id) { return AVATAR_PALETTES[(id || 0) % AVATAR_PALETTES.length]; }

// ─── Status badge ─────────────────────────────────────────────────────────────
function statusBadge(patient, t) {
  const isHigh = patient.risk_level === 'high' || patient.is_high_risk;
  if (isHigh) {
    return (
      <span className="px-3 py-1 bg-rose-50 text-rose-700 text-[10px] font-body font-bold rounded-full tracking-wider whitespace-nowrap">
        {t('critical', 'Critical')}
      </span>
    );
  }
  if ((patient.status || '').toUpperCase() === 'COMPLETED') {
    return (
      <span className="px-3 py-1 bg-surface-container-high text-on-surface-variant text-[10px] font-body font-bold rounded-full tracking-wider whitespace-nowrap">
        {t('completed', 'Completed')}
      </span>
    );
  }
  return (
    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-body font-bold rounded-full tracking-wider flex items-center gap-1 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      {t('active', 'Active')}
    </span>
  );
}

// ─── Sync status badge ─────────────────────────────────────────────────────────
function syncBadge(patient, t) {
  const s = patient.syncStatus;
  if (!s || s === 'synced') return null;
  const meta = {
    pending: { icon: '⏳', cls: 'bg-amber-50 text-amber-600', key: 'pending' },
    syncing: { icon: '🔄', cls: 'bg-sky-50 text-sky-600', key: 'syncing'    },
    failed:  { icon: '❌', cls: 'bg-rose-50 text-rose-600', key: 'failed'  },
  }[s];
  if (!meta) return null;
  return (
    <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${meta.cls}`} title={`Sync: ${s}`}>
      {meta.icon} {t(meta.key, s)}
    </span>
  );
}

function callBtnCls(patient) {
  if (patient.risk_level === 'high' || patient.is_high_risk) {
    return 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white';
  }
  return 'bg-surface-container-low text-primary hover:bg-primary hover:text-white';
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PatientCard({ patient, onClick, isActive, onDeleteRequest }) {
  const { t } = useTranslation();
  const cat     = getCatStyle(patient);
  const pal     = avatarPalette(patient.id);
  const initials = getInitials(patient.name);
  const isHigh  = patient.risk_level === 'high' || patient.is_high_risk;

  return (
    <article
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      aria-label={`View details for ${patient.name}`}
      className={`group bg-surface-container-lowest p-6 rounded shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] transition-all duration-300 cursor-pointer relative overflow-hidden border transition-all
        ${isActive
          ? 'border-primary shadow-md ring-2 ring-primary/10'
          : 'border-transparent hover:border-surface-container-high'
        }`}
    >
      {/* Top Row: Avatar + Name + Status */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-headline font-bold border-2 ${pal.bg} ${pal.border}`}>
              {initials}
            </div>
            {/* Small status indicator on avatar */}
            <div className="absolute -bottom-0.5 -right-0.5 bg-white p-0.5 rounded-full">
              <div className={`w-3 h-3 rounded-full border-2 border-white ${isHigh ? 'bg-rose-500' : (patient.status || '').toUpperCase() === 'COMPLETED' ? 'bg-slate-300' : 'bg-emerald-500'}`} />
            </div>
          </div>

          <div className="min-w-0">
            <h3 className="text-xl font-headline font-bold text-on-surface group-hover:text-primary transition-colors leading-tight truncate">
              {patient.name}
            </h3>
            <span className={`text-[10px] font-body font-bold tracking-widest uppercase ${cat.chip} px-2 py-0.5 rounded inline-block mt-1`}>
              {patient.disease || t(cat.key, cat.label)}
            </span>
          </div>
        </div>

        {/* Status + Sync Badge */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          {statusBadge(patient, t)}
          {syncBadge(patient, t)}
        </div>
      </div>

      {/* Body: Patient Metadata */}
      <div className="space-y-3 mb-6">
        <div className="flex justify-between text-sm font-body">
          <span className="text-on-surface-variant">{t('profile', 'Profile')}</span>
          <span className="text-on-surface font-medium">
            {[patient.age ? `${patient.age}y` : null, patient.gender ? t(patient.gender.toLowerCase(), patient.gender) : null].filter(Boolean).join(' • ')}
          </span>
        </div>
        <div className="flex justify-between text-sm font-body">
          <span className="text-on-surface-variant">{t('village', 'Village')}</span>
          <span className="text-on-surface font-medium truncate ml-4">
            {patient.village || '—'}
          </span>
        </div>
      </div>

      {/* Footer: ID & Actions */}
      <div className="flex justify-between items-center pt-3 border-t border-outline-variant/10">
        <span className="text-[10px] font-body font-bold text-on-surface-variant uppercase tracking-widest">
          {t('idLabel', 'ID')} #{patient.id || patient.local_id || '—'}
        </span>
        
        <div className="flex items-center gap-2">
          {/* Delete action */}
          {onDeleteRequest && (
            <button
              onClick={onDeleteRequest}
              aria-label={`Delete ${patient.name}`}
              title="Delete patient"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-90"
            >
              <Trash2 size={14} />
            </button>
          )}

          {/* Call action */}
          <a
            href={patient.phone ? `tel:${patient.phone}` : undefined}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Call ${patient.name}`}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90 ${callBtnCls(patient)}`}
          >
            <span className="material-symbols-outlined text-[16px]">call</span>
          </a>
          
          {/* Details arrow */}
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-container-low text-primary opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0 duration-300">
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </div>
        </div>
      </div>

      {/* Subtle indicator for active state */}
      {isActive && (
        <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
      )}
    </article>
  );
}
