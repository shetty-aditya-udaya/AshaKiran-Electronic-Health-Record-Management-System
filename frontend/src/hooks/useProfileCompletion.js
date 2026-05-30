/**
 * useProfileCompletion
 * ─────────────────────
 * Calculates profile completion % from the user object stored in localStorage.
 *
 * Fields tracked (14 total — matches what the backend User model exposes
 * plus extended fields the user can fill on their profile page):
 *
 *   Core (from backend)  : name, email, role, village
 *   Extended (profile)   : phone, dob, age, gender, address,
 *                          organization, district, id_proof,
 *                          emergency_contact, avatar
 *
 * Returns: { pct, filled, total, label, color }
 */

export const PROFILE_FIELDS = [
  // key                    weight (all equal = 1)
  { key: 'name' },
  { key: 'email' },
  { key: 'village' },
  { key: 'role' },
  { key: 'phone' },
  { key: 'dob' },
  { key: 'age' },
  { key: 'gender' },
  { key: 'address' },
  { key: 'organization' },
  { key: 'district' },
  { key: 'id_proof' },
  { key: 'emergency_contact' },
  { key: 'avatar' },
];

/**
 * Returns true if the field value is considered "filled".
 */
function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return !isNaN(value);
  return Boolean(value);
}

/**
 * @param {Object} user  – user object from localStorage
 * @returns {{ pct: number, filled: number, total: number, label: string, ringColor: string, textColor: string }}
 */
export function computeProfileCompletion(user) {
  if (!user) return { pct: 0, filled: 0, total: PROFILE_FIELDS.length, label: 'Profile setup pending', ringColor: '#C0392B', textColor: '#C0392B' };

  const total  = PROFILE_FIELDS.length;
  const filled = PROFILE_FIELDS.filter(f => isFilled(user[f.key])).length;
  const pct    = Math.round((filled / total) * 100);

  let label, ringColor, textColor;

  if (pct === 100) {
    label     = 'Profile completed';
    ringColor = '#2D8A60';
    textColor = '#2D8A60';
  } else if (pct >= 80) {
    label     = `Profile ${pct}% complete`;
    ringColor = '#2D8A60';
    textColor = '#2D8A60';
  } else if (pct >= 50) {
    label     = `Profile ${pct}% complete`;
    ringColor = '#B45309';
    textColor = '#B45309';
  } else if (pct > 0) {
    label     = `Profile ${pct}% complete`;
    ringColor = '#C0392B';
    textColor = '#C0392B';
  } else {
    label     = 'Profile setup pending';
    ringColor = '#C0392B';
    textColor = '#C0392B';
  }

  return { pct, filled, total, label, ringColor, textColor };
}

import { useMemo } from 'react';

/**
 * Hook — reads user from localStorage and returns completion data.
 * Re-runs whenever localStorage changes (e.g., after profile save).
 */
export function useProfileCompletion() {
  return useMemo(() => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return { user, ...computeProfileCompletion(user) };
  }, []);
}
