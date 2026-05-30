export function computeRiskLocal(patientData) {
  const flags = [];
  const weeks = parseInt(patientData.pregnancy_weeks || 0);
  const age = parseInt(patientData.age || 25);
  const isPregnant = patientData.is_pregnant;

  if (isPregnant) {
    if (age < 18 || age > 35) flags.append ? null : flags.push("age_risk");
    if (weeks && weeks > 36) flags.push("near_term");
  }

  const vax = patientData.vaccination_status || {};
  const missing = Object.values(vax).filter(done => !done).length;
  if (missing >= 3) {
    flags.push("vaccination_overdue");
  }

  const bpS = parseInt(patientData.bp_systolic || 0);
  if (bpS > 140) {
    flags.push("high_bp");
  }

  if (flags.length === 0) return { level: 'low', flags: [] };
  if (flags.length <= 2) return { level: 'medium', flags };
  return { level: 'high', flags };
}
