def _safe_num(val, default=0):
    """Convert a value to float safely, returning default on failure."""
    if val is None or val == "":
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default

def compute_risk(patient_data):
    """
    Computes risk level and flags based on clinical data.
    - patient_data: dict containing keys like age, weeks_of_pregnancy, vaccination_status, bp_systolic, etc.
    """
    flags = []
    # Support both old key (pregnancy_weeks) and new key (weeks_of_pregnancy)
    weeks = _safe_num(
        patient_data.get("weeks_of_pregnancy") or patient_data.get("pregnancy_weeks"), 0
    )
    age = _safe_num(patient_data.get("age"), 25)
    is_pregnant = patient_data.get("is_pregnant", False)

    # Pregnancy specific risks
    if is_pregnant:
        if age < 18 or age > 35:
            flags.append("age_risk")
        if weeks and weeks > 36:
            flags.append("near_term")

    # Vaccination risks
    vax = patient_data.get("vaccination_status", {}) or {}
    missing = [v for v, done in vax.items() if not done]
    if len(missing) >= 3:
        flags.append("vaccination_overdue")

    # Blood Pressure risks
    bp_s = _safe_num(patient_data.get("bp_systolic"), 0)
    if bp_s > 140:
        flags.append("high_bp")

    # Determine risk level
    if len(flags) == 0:
        return "low", []
    elif len(flags) <= 2:
        return "medium", flags
    else:
        return "high", flags
