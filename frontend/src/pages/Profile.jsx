import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';

// ─── completion calculator ────────────────────────────────────────────────────
const TRACKED_FIELDS = [
  'name', 'dob', 'gender', 'phone', 'email',
  'address', 'organization_name', 'worker_id', 'national_id',
  'organization_type', 'workplace_type',
];

function calcCompletion(form) {
  const filled = TRACKED_FIELDS.filter((k) => (form[k] || '').toString().trim() !== '').length;
  return Math.round((filled / TRACKED_FIELDS.length) * 100);
}

function calcAge(dob) {
  if (!dob) return '';
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

// ─── Circular progress ring ───────────────────────────────────────────────────
function ProgressRing({ pct, size = 120, stroke = 6 }) {
  const r     = (size - stroke) / 2;
  const circ  = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const colour = pct >= 80 ? '#006e40' : pct >= 50 ? '#0062a6' : '#e07c00';

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#e5f0f0" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={colour} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function SectionCard({ icon, title, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-surface-container-low">
        <span className="material-symbols-outlined text-primary">{icon}</span>
        <h2 className="font-headline font-bold text-on-surface text-base">{title}</h2>
      </div>
      <div className="px-6 py-4 space-y-4">{children}</div>
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────
function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-body font-semibold text-on-surface-variant uppercase tracking-widest">
        {label}{required && <span className="text-error ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT_CLS =
  'w-full px-4 py-2.5 bg-surface-container-low rounded-xl border border-outline-variant/30 ' +
  'text-sm font-body text-on-surface placeholder-on-surface-variant/50 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all';

const SELECT_CLS = INPUT_CLS + ' appearance-none cursor-pointer';

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Profile({ onProfileUpdate }) {
  const navigate   = useNavigate();
  const fileRef    = useRef(null);
  const { t }      = useTranslation();

  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

  const [form, setForm] = useState({
    name:              storedUser.name              || '',
    dob:               storedUser.dob               || '',
    gender:            storedUser.gender             || '',
    phone:             storedUser.phone              || '',
    email:             storedUser.email              || '',
    address:           storedUser.address            || '',
    organization_type: storedUser.organization_type  || '',
    workplace_type:    storedUser.workplace_type     || '',
    organization_name: storedUser.organization_name  || '',
    worker_id:         storedUser.worker_id          || '',
    national_id:       storedUser.national_id        || '',
  });

  const [avatar, setAvatar]         = useState(storedUser.avatar || null);
  const [saving, setSaving]         = useState(false);
  const [editMode, setEditMode]     = useState(false);

  const completion = calcCompletion(form);
  const age        = calcAge(form.dob);

  // ── field change ────────────────────────────────────────────────────────────
  const set = useCallback((k, v) => setForm((f) => ({ ...f, [k]: v })), []);

  // ── avatar upload ───────────────────────────────────────────────────────────
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error(t('profile.imageSizeToast', 'Image must be under 2 MB')); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target.result;
      setAvatar(url);
      // reflect immediately in localStorage / parent
      const updated = { ...storedUser, avatar: url };
      localStorage.setItem('user', JSON.stringify(updated));
      onProfileUpdate?.(updated);
    };
    reader.readAsDataURL(file);
  };

  // ── save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { toast.error(t('profile.fullNameRequiredToast', 'Full name is required')); return; }
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const payload = { ...form, avatar };

      const res = await fetch(`${API_BASE_URL}/api/profile`, {
        method:  'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      // If backend doesn't have the endpoint yet, save locally anyway
      const updated = { ...storedUser, ...payload };
      localStorage.setItem('user', JSON.stringify(updated));
      onProfileUpdate?.(updated);

      if (res.ok) {
        toast.success(t('profile.saveSuccessToast', 'Profile saved successfully!'));
      } else {
        // graceful degradation — saved locally
        toast.success(t('profile.saveLocalToast', 'Profile saved locally.'));
      }
      setEditMode(false);
    } catch {
      // network error — save locally
      const updated = { ...storedUser, ...form, avatar };
      localStorage.setItem('user', JSON.stringify(updated));
      onProfileUpdate?.(updated);
      toast.success(t('profile.saveLocalToast', 'Profile saved locally.'));
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  // ── initials ────────────────────────────────────────────────────────────────
  const initials = (form.name || 'A')
    .split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 pt-8 pb-32 space-y-6 font-body">

      {/* ── Profile Header Card ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-6 flex flex-col items-center gap-4">

        {/* Avatar + progress ring */}
        <div className="relative flex items-center justify-center">
          <ProgressRing pct={completion} size={124} stroke={5} />

          {/* Avatar */}
          <div className="absolute inset-0 flex items-center justify-center">
            {avatar ? (
              <img src={avatar} alt="Profile"
                className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center text-3xl font-headline font-bold border-4 border-white shadow-md select-none">
                {initials}
              </div>
            )}
          </div>

          {/* Edit overlay */}
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-1 right-1 w-8 h-8 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-lg hover:opacity-90 active:scale-95 transition-all"
            aria-label="Change profile photo"
          >
            <span className="material-symbols-outlined text-[16px]">photo_camera</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>

        {/* Name + role */}
        <div className="text-center">
          <h1 className="text-2xl font-headline font-bold text-on-surface leading-tight">
            {form.name || t('yourName', 'Your Name')}
          </h1>
          <p className="text-sm font-body text-on-surface-variant mt-0.5">{t('profile.ashaWorker', 'ASHA Worker')}</p>
        </div>

        {/* Completion progress */}
        <div className="w-full bg-surface-container-low rounded-full overflow-hidden h-2">
          <div
            className="h-full rounded-full transition-all duration-700 bg-primary"
            style={{ width: `${completion}%` }}
          />
        </div>
        <div className="flex items-center justify-between w-full text-xs font-body text-on-surface-variant">
          <span>{t('profile.completionPercent', 'Profile {{percent}}% complete', { percent: completion })}</span>
          {completion < 100 && (
            <span className="text-primary font-semibold">
              {t('profile.fieldsRemaining', '{{count}} fields remaining', { count: TRACKED_FIELDS.length - TRACKED_FIELDS.filter((k) => (form[k] || '').toString().trim()).length })}
            </span>
          )}
        </div>
        {completion < 100 && (
          <p className="text-xs font-body text-on-surface-variant text-center">
            {t('profile.improveAccuracy', 'Complete your profile to improve record accuracy')}
          </p>
        )}

        {/* Edit / Done toggle */}
        <button
          onClick={() => editMode ? handleSave() : setEditMode(true)}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary rounded-full font-body font-semibold text-sm hover:opacity-90 active:scale-95 transition-all shadow-md disabled:opacity-60"
        >
          {saving ? (
            <><span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> {t('profile.saving', 'Saving…')}</>
          ) : editMode ? (
            <><span className="material-symbols-outlined text-[18px]">check</span> {t('profile.saveProfile', 'Save Profile')}</>
          ) : (
            <><span className="material-symbols-outlined text-[18px]">edit</span> {t('profile.editProfile', 'Edit Profile')}</>
          )}
        </button>
        {editMode && (
          <button
            onClick={() => setEditMode(false)}
            className="text-xs text-on-surface-variant font-body font-medium hover:text-error transition-colors -mt-2"
          >
            {t('profile.cancel', 'Cancel')}
          </button>
        )}
      </div>

      {/* ── Personal Information ─────────────────────────────────────────────── */}
      <SectionCard icon="person" title={t('profile.personalInfo', 'Personal Information')}>
        <Field label={t('profile.fullName', 'Full Name')} required>
          <input
            type="text" value={form.name} disabled={!editMode}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t('profile.fullNamePlaceholder', 'Enter your full name')}
            className={INPUT_CLS + (!editMode ? ' opacity-70 cursor-not-allowed' : '')}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('profile.dob', 'Date of Birth')}>
            <input
              type="date" value={form.dob} disabled={!editMode}
              onChange={(e) => set('dob', e.target.value)}
              className={INPUT_CLS + (!editMode ? ' opacity-70 cursor-not-allowed' : '')}
            />
          </Field>
          <Field label={t('profile.ageAuto', 'Age (auto)')}>
            <input
              type="text" value={age ? t('profile.ageYears', '{{count}} years', { count: age }) : '—'} disabled
              readOnly
              className={INPUT_CLS + ' opacity-60 cursor-not-allowed bg-surface-container'}
            />
          </Field>
        </div>

        <Field label={t('profile.gender', 'Gender')}>
          <select
            value={form.gender} disabled={!editMode}
            onChange={(e) => set('gender', e.target.value)}
            className={SELECT_CLS + (!editMode ? ' opacity-70 cursor-not-allowed' : '')}
          >
            <option value="">{t('profile.selectGender', 'Select gender')}</option>
            <option value="Female">{t('profile.genderFemale', 'Female')}</option>
            <option value="Male">{t('profile.genderMale', 'Male')}</option>
            <option value="Other">{t('profile.genderOther', 'Other / Prefer not to say')}</option>
          </select>
        </Field>
      </SectionCard>

      {/* ── Work Information ─────────────────────────────────────────────────── */}
      <SectionCard icon="work" title={t('profile.workInfo', 'Work Information')}>
        <Field label={t('profile.organizationType', 'Organization Type')}>
          <select
            value={form.organization_type} disabled={!editMode}
            onChange={(e) => set('organization_type', e.target.value)}
            className={SELECT_CLS + (!editMode ? ' opacity-70 cursor-not-allowed' : '')}
          >
            <option value="">{t('profile.selectOrgType', 'Select type')}</option>
            <option value="Government">{t('profile.orgGovernment', 'Government')}</option>
            <option value="Private">{t('profile.orgPrivate', 'Private')}</option>
            <option value="NGO">{t('profile.orgNgo', 'NGO / Trust')}</option>
          </select>
        </Field>

        <Field label={t('profile.workplaceType', 'Workplace Type')}>
          <select
            value={form.workplace_type} disabled={!editMode}
            onChange={(e) => set('workplace_type', e.target.value)}
            className={SELECT_CLS + (!editMode ? ' opacity-70 cursor-not-allowed' : '')}
          >
            <option value="">{t('profile.selectWorkplace', 'Select workplace')}</option>
            <option value="Hospital">{t('profile.workplaceHospital', 'Hospital')}</option>
            <option value="Clinic">{t('profile.workplaceClinic', 'Clinic')}</option>
            <option value="PHC">{t('profile.workplacePhc', 'Primary Health Centre (PHC)')}</option>
            <option value="Government Organization">{t('profile.workplaceGovtOrg', 'Government Organization')}</option>
            <option value="Anganwadi">{t('profile.workplaceAnganwadi', 'Anganwadi Centre')}</option>
            <option value="Field">{t('profile.workplaceField', 'Field / Community')}</option>
          </select>
        </Field>

        <Field label={t('profile.organizationName', 'Organization Name')}>
          <input
            type="text" value={form.organization_name} disabled={!editMode}
            onChange={(e) => set('organization_name', e.target.value)}
            placeholder={t('profile.orgNamePlaceholder', 'e.g. Sampur PHC')}
            className={INPUT_CLS + (!editMode ? ' opacity-70 cursor-not-allowed' : '')}
          />
        </Field>

        <Field label={t('profile.workerId', 'Worker ID / Employee ID')}>
          <input
            type="text" value={form.worker_id} disabled={!editMode}
            onChange={(e) => set('worker_id', e.target.value)}
            placeholder={t('profile.workerIdPlaceholder', 'e.g. ASHA-KA-2024-001')}
            className={INPUT_CLS + (!editMode ? ' opacity-70 cursor-not-allowed' : '')}
          />
        </Field>
      </SectionCard>

      {/* ── Contact & Identity ───────────────────────────────────────────────── */}
      <SectionCard icon="contact_phone" title={t('profile.contactInfo', 'Contact Information')}>
        <Field label={t('profile.phone', 'Phone Number')} required>
          <input
            type="tel" value={form.phone} disabled={!editMode}
            onChange={(e) => set('phone', e.target.value)}
            placeholder={t('profile.phonePlaceholder', '+91 98765 43210')}
            className={INPUT_CLS + (!editMode ? ' opacity-70 cursor-not-allowed' : '')}
          />
        </Field>

        <Field label={t('profile.email', 'Email Address')}>
          <input
            type="email" value={form.email} disabled={!editMode}
            onChange={(e) => set('email', e.target.value)}
            placeholder={t('profile.emailPlaceholder', 'your@email.com')}
            className={INPUT_CLS + (!editMode ? ' opacity-70 cursor-not-allowed' : '')}
          />
        </Field>

        <Field label={t('profile.address', 'Address')}>
          <textarea
            value={form.address} disabled={!editMode}
            onChange={(e) => set('address', e.target.value)}
            placeholder={t('profile.addressPlaceholder', 'House No., Street, Village, District, State, PIN')}
            rows={3}
            className={INPUT_CLS + ' resize-none' + (!editMode ? ' opacity-70 cursor-not-allowed' : '')}
          />
        </Field>
      </SectionCard>

      {/* ── Identification ───────────────────────────────────────────────────── */}
      <SectionCard icon="badge" title={t('profile.identification', 'Identification')}>
        <Field label={t('profile.aadhaar', 'Aadhaar / National ID')}>
          <input
            type="text" value={form.national_id} disabled={!editMode}
            onChange={(e) => set('national_id', e.target.value)}
            placeholder={t('profile.aadhaarPlaceholder', 'XXXX XXXX XXXX')}
            maxLength={14}
            className={INPUT_CLS + (!editMode ? ' opacity-70 cursor-not-allowed' : '')}
          />
        </Field>

        {editMode && (
          <div className="flex items-center gap-3 p-4 bg-surface-container-low rounded-xl border border-dashed border-outline-variant/40 cursor-pointer hover:bg-surface-container transition-colors"
            onClick={() => fileRef.current?.click()}>
            <span className="material-symbols-outlined text-on-surface-variant">upload_file</span>
            <div>
              <p className="text-sm font-body font-semibold text-on-surface">{t('profile.uploadIdDoc', 'Upload ID Document')}</p>
              <p className="text-xs text-on-surface-variant">{t('profile.optionalDocDesc', 'Optional — JPEG / PNG, max 2 MB')}</p>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Danger zone ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] p-6 space-y-3">
        <h2 className="font-headline font-bold text-on-surface text-base mb-2">{t('profile.account', 'Account')}</h2>

        <button
          onClick={() => {
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            onProfileUpdate?.(null);
            navigate('/login');
          }}
          className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 text-red-600 rounded-xl font-body font-semibold text-sm hover:bg-red-100 transition-all active:scale-[0.98]"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          {t('profile.signOut', 'Sign Out')}
        </button>
      </div>

      {/* ── Sticky save bar (edit mode only) ────────────────────────────────── */}
      {editMode && (
        <div className="fixed bottom-20 left-0 right-0 z-50 px-4">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-4 bg-primary text-on-primary rounded-2xl font-headline font-bold text-base shadow-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving
                ? <><span className="material-symbols-outlined animate-spin">progress_activity</span> {t('profile.saving', 'Saving…')}</>
                : <><span className="material-symbols-outlined">check_circle</span> {t('profile.saveAllChanges', 'Save All Changes')}</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
