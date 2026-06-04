import sys
import datetime
from collections import defaultdict
from flask import Blueprint, request, jsonify
from app.models import db, Patient, Visit, ProgrammeData, Reminder, Report
from app.utils.jwt_helper import require_auth

programmes_bp = Blueprint("programmes", __name__)


# ---------------------------------------------------------------------------
# GET /api/dashboard/analytics  — single unified dashboard data endpoint
# ---------------------------------------------------------------------------
@programmes_bp.route("/dashboard/analytics", methods=["GET"])
@require_auth
def get_dashboard_analytics(current_user):
    """
    Returns ALL dashboard data in one authenticated call, scoped to the
    logged-in ASHA worker. All queries are filtered by asha_worker_id.

    Shape:
      stats, distribution, conditions, monthlyTrend, recentActivities,
      todaySchedule, alerts
    """
    try:
        today = datetime.date.today()
        now   = datetime.datetime.utcnow()

        # ── 1. Fetch core data ────────────────────────────────────────────
        patients = Patient.query.filter_by(asha_worker_id=current_user.id).all()
        patient_ids = [p.id for p in patients]

        visits = (
            Visit.query.filter(Visit.patient_id.in_(patient_ids)).all()
            if patient_ids else []
        )
        reminders = (
            Reminder.query.filter(Reminder.patient_id.in_(patient_ids)).all()
            if patient_ids else []
        )
        reports = (
            Report.query.filter(Report.patient_id.in_(patient_ids)).all()
            if patient_ids else []
        )

        # ── 2. TOP STATS ──────────────────────────────────────────────────
        total_patients = len(patients)

        # Today's visits
        today_visits = [
            v for v in visits
            if v.visit_datetime and v.visit_datetime.date() == today
        ]
        today_completed = [v for v in today_visits if v.status == "COMPLETED"]
        today_pending   = [v for v in today_visits if v.status == "PENDING"]

        # Follow-ups (pending reminders / PENDING visits not today)
        followups_due = [
            r for r in reminders
            if r.status in ("pending", "PENDING") and r.due_date <= today
        ]
        overdue_followups = [r for r in followups_due if r.due_date < today]

        # High risk
        high_risk = [p for p in patients if (p.risk_level or "").lower() == "high"]

        # Completed visits total
        completed_all = [v for v in visits if v.status == "COMPLETED"]

        stats = {
            "totalPatients":        total_patients,
            "todayVisits":          len(today_completed),
            "pendingVisitsToday":   len(today_pending),
            "followUpsDue":         len(followups_due),
            "overdueFollowUps":     len(overdue_followups),
            "highRiskCount":        len(high_risk),
            "visitsCompletedCount": len(completed_all),
            # Legacy fields kept for backward compat
            "highRisk":             len(high_risk),
            "remindersCount":       len(today_pending) + len(followups_due),
        }

        # ── 3. PATIENT DISTRIBUTION ───────────────────────────────────────
        dist = defaultdict(int)
        for p in patients:
            cat = (p.category or "General").strip()
            if cat in ("Pregnancy", "Maternal"):
                dist["maternal"] += 1
            elif p.age is not None and p.age <= 12:
                dist["child"] += 1
            elif cat in ("Chronic", "NCD"):
                dist["chronic"] += 1
            elif (p.risk_level or "").lower() == "high":
                dist["highRisk"] += 1
            else:
                dist["general"] += 1

        distribution = {
            "general":  dist["general"],
            "maternal": dist["maternal"],
            "child":    dist["child"],
            "chronic":  dist["chronic"],
            "highRisk": dist["highRisk"],
        }

        # ── 4. TOP HEALTH CONDITIONS ─────────────────────────────────────
        condition_counts = defaultdict(int)
        for p in patients:
            # From disease field (free text — normalize common spellings)
            if p.disease:
                d = p.disease.strip().title()
                condition_counts[d] += 1
            # From risk_flags JSON (e.g. {"anemia": true, "hypertension": true})
            if isinstance(p.risk_flags, dict):
                for flag, val in p.risk_flags.items():
                    if val:
                        condition_counts[flag.replace("_", " ").title()] += 1
            # From category
            if p.category:
                cat = p.category.strip().title()
                if cat not in ("General", "Pregnancy", "Maternal", "Chronic", "Ncd"):
                    condition_counts[cat] += 1

        # Sort descending by count, return top 5
        conditions_sorted = sorted(
            [{"name": k, "count": v} for k, v in condition_counts.items()],
            key=lambda x: x["count"],
            reverse=True
        )[:5]

        # ── 5. MONTHLY TREND (last 6 months) ─────────────────────────────
        month_labels = []
        patients_per_month = defaultdict(int)
        visits_per_month   = defaultdict(int)

        for i in range(5, -1, -1):
            # Go back i months from current
            ref_month = today.replace(day=1)
            m = ref_month.month - i
            y = ref_month.year
            while m <= 0:
                m += 12
                y -= 1
            lbl = datetime.date(y, m, 1).strftime("%b %d").split(" ")[0]  # e.g. "Jan"
            key = f"{y}-{m:02d}"
            month_labels.append({"key": key, "label": lbl})

        for p in patients:
            if p.created_at:
                key = f"{p.created_at.year}-{p.created_at.month:02d}"
                patients_per_month[key] += 1

        for v in visits:
            if v.status == "COMPLETED" and v.completed_at:
                key = f"{v.completed_at.year}-{v.completed_at.month:02d}"
                visits_per_month[key] += 1
            elif v.status == "COMPLETED" and v.visit_datetime:
                key = f"{v.visit_datetime.year}-{v.visit_datetime.month:02d}"
                visits_per_month[key] += 1

        monthly_trend = [
            {
                "month":           m["label"],
                "patientsAdded":   patients_per_month.get(m["key"], 0),
                "visitsCompleted": visits_per_month.get(m["key"], 0),
            }
            for m in month_labels
        ]

        # ── 6. RECENT ACTIVITIES (last 10 events) ─────────────────────────
        activity_list = []

        for p in patients:
            activity_list.append({
                "type":      "patient_registered",
                "title":     "New patient registered",
                "detail":    f"{p.name} • {p.village or current_user.village or 'Village'}",
                "timestamp": p.created_at.isoformat() if p.created_at else None,
            })

        for v in visits:
            if v.status == "COMPLETED":
                pat = next((p for p in patients if p.id == v.patient_id), None)
                activity_list.append({
                    "type":      "visit_completed",
                    "title":     "Visit completed",
                    "detail":    f"{pat.name if pat else 'Patient'} • {v.visit_type or 'General Checkup'}",
                    "timestamp": (v.completed_at or v.visit_datetime).isoformat()
                                 if (v.completed_at or v.visit_datetime) else None,
                })

        for r in reports:
            pat = next((p for p in patients if p.id == r.patient_id), None)
            activity_list.append({
                "type":      "report_added",
                "title":     "Health record updated",
                "detail":    f"{pat.name if pat else 'Patient'} • {r.report_type or r.title or 'Report'}",
                "timestamp": r.created_at.isoformat() if r.created_at else None,
            })

        for rem in reminders:
            if rem.status == "completed":
                pat = next((p for p in patients if p.id == rem.patient_id), None)
                activity_list.append({
                    "type":      "reminder_done",
                    "title":     "Follow-up completed",
                    "detail":    f"{pat.name if pat else 'Patient'} • {rem.reminder_type or 'Follow-up'}",
                    "timestamp": rem.created_at.isoformat() if rem.created_at else None,
                })

        # Sort newest first, take 8
        activity_list.sort(
            key=lambda x: x["timestamp"] or "",
            reverse=True
        )
        recent_activities = activity_list[:8]

        # ── 7. TODAY'S SCHEDULE ──────────────────────────────────────────
        schedule_items = []

        # From today's visits
        for v in today_visits:
            pat = next((p for p in patients if p.id == v.patient_id), None)
            schedule_items.append({
                "time":      v.visit_datetime.strftime("%I:%M %p") if v.visit_datetime else "—",
                "sortKey":   v.visit_datetime.isoformat() if v.visit_datetime else "",
                "title":     v.visit_type or "Home Visit",
                "place":     f"{pat.name if pat else 'Patient'}" + (f" • {pat.village}" if pat and pat.village else ""),
                "status":    "completed" if v.status == "COMPLETED" else
                             ("missed" if v.visit_datetime and v.visit_datetime < now and v.status == "PENDING"
                              else "upcoming"),
                "visitId":   v.id,
            })

        # From today's reminders (due today, not already listed)
        for r in reminders:
            if r.due_date == today:
                pat = next((p for p in patients if p.id == r.patient_id), None)
                schedule_items.append({
                    "time":    "09:00 AM",
                    "sortKey": str(today) + "T09:00:00",
                    "title":   r.reminder_type or "Follow-up",
                    "place":   f"{pat.name if pat else 'Patient'}" + (f" • {pat.village}" if pat and pat.village else ""),
                    "status":  "completed" if r.status == "completed" else "upcoming",
                    "reminderId": r.id,
                })

        schedule_items.sort(key=lambda x: x["sortKey"])
        today_schedule = schedule_items[:8]

        # ── 8. ALERTS ────────────────────────────────────────────────────
        alerts = []
        if len(high_risk) > 0:
            alerts.append({
                "type":    "high_risk",
                "count":   len(high_risk),
                "message": f"{len(high_risk)} high risk patient{'s' if len(high_risk) > 1 else ''} need attention",
            })
        if len(overdue_followups) > 0:
            alerts.append({
                "type":    "overdue_followup",
                "count":   len(overdue_followups),
                "message": f"{len(overdue_followups)} follow-up{'s are' if len(overdue_followups) > 1 else ' is'} overdue",
            })
        if len(followups_due) > 0:
            alerts.append({
                "type":    "followup_due",
                "count":   len(followups_due),
                "message": f"{len(followups_due)} follow-up{'s' if len(followups_due) > 1 else ''} due today",
            })

        return jsonify({
            "stats":             stats,
            "distribution":      distribution,
            "conditions":        conditions_sorted,
            "monthlyTrend":      monthly_trend,
            "recentActivities":  recent_activities,
            "todaySchedule":     today_schedule,
            "alerts":            alerts,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"CRITICAL: /api/dashboard/analytics error: {e}", file=sys.stderr)
        return jsonify({"error": "Failed to load dashboard analytics"}), 500




# ---------------------------------------------------------------------------
# Helper: serialise a Patient row into a compact JSON-safe dict
# ---------------------------------------------------------------------------
def _patient_summary(p):
    return {
        "id":            p.id,
        "name":          p.name or "Unknown",
        "age":           p.age,
        "gender":        p.gender,
        "phone":         p.phone,
        "village":       p.village,
        "category":      p.category,
        "disease":       p.disease,
        "risk_level":    p.risk_level,
        "health_status": p.health_status,
        "status":        p.status,
        "is_pregnant":   p.is_pregnant,
        "is_high_risk":  p.is_high_risk,
        "anc_edd":       p.anc_edd.isoformat() if p.anc_edd else None,
        "weeks_pregnant": p.weeks_of_pregnancy,
        "vaccination_status": p.vaccination_status,
        "ncd_status":    p.ncd_status,
        "created_at":    p.created_at.isoformat() if p.created_at else None,
    }


# ---------------------------------------------------------------------------
# GET /api/programmes/summary  (dashboard stats)
# ---------------------------------------------------------------------------
@programmes_bp.route("/programmes/summary", methods=["GET"])
@require_auth
def get_summary(current_user):
    try:
        total_patients = Patient.query.filter_by(asha_worker_id=current_user.id).count()
        high_risk = Patient.query.filter_by(asha_worker_id=current_user.id, risk_level="high").count()

        patient_ids = [
            p.id for p in
            Patient.query.filter_by(asha_worker_id=current_user.id).with_entities(Patient.id)
        ]
        pending_visits = Visit.query.filter(
            Visit.patient_id.in_(patient_ids),
            Visit.status == "PENDING"
        ).count() if patient_ids else 0

        completed_visits = Visit.query.filter(
            Visit.patient_id.in_(patient_ids),
            Visit.status == "COMPLETED"
        ).count() if patient_ids else 0

        return jsonify({
            "totalPatients":  total_patients,
            "highRisk":       high_risk,
            "remindersCount": pending_visits,
            "visitsCompletedCount": completed_visits
        })
    except Exception as e:
        print(f"CRITICAL API ERROR in get_summary: {e}", file=sys.stderr)
        return jsonify({"totalPatients": 0, "highRisk": 0, "remindersCount": 0, "visitsCompletedCount": 0})


# ---------------------------------------------------------------------------
# GET /api/programmes/:type  — dynamic patient classification
# ---------------------------------------------------------------------------
@programmes_bp.route("/programmes/<string:prog_type>", methods=["GET"])
@require_auth
def get_programme_patients(current_user, prog_type):
    """
    Returns patients belonging to the given programme category.

    type          Classification logic
    ──────────────────────────────────────────────────────────────────
    maternal      category = 'Pregnancy'  OR  is_pregnant = True
    vaccination   age <= 5
    ncd           category = 'Chronic'   (case-insensitive)
    disease       category = 'Infectious' OR disease IS NOT NULL
    ──────────────────────────────────────────────────────────────────
    Scope is restricted to patients belonging to the logged-in ASHA worker.
    """
    try:
        base_q = Patient.query.filter_by(asha_worker_id=current_user.id)

        prog_type = prog_type.lower().strip()

        if prog_type == "maternal":
            patients = base_q.filter(
                db.or_(
                    Patient.category == "Pregnancy",
                    Patient.is_pregnant == True         # noqa: E712
                )
            ).order_by(Patient.name).all()

        elif prog_type == "vaccination":
            patients = base_q.filter(
                Patient.age <= 5,
                Patient.age != None                     # noqa: E711
            ).order_by(Patient.age, Patient.name).all()

        elif prog_type == "ncd":
            patients = base_q.filter(
                db.func.lower(Patient.category) == "chronic"
            ).order_by(Patient.risk_level.desc(), Patient.name).all()

        elif prog_type == "disease":
            patients = base_q.filter(
                db.or_(
                    db.func.lower(Patient.category) == "infectious",
                    Patient.disease != None             # noqa: E711
                )
            ).order_by(Patient.created_at.desc()).all()

        else:
            return jsonify({"error": f"Unknown programme type: '{prog_type}'"}), 400

        return jsonify({
            "type":     prog_type,
            "count":    len(patients),
            "patients": [_patient_summary(p) for p in patients]
        })

    except Exception as e:
        print(f"CRITICAL API ERROR in get_programme_patients ({prog_type}): {e}", file=sys.stderr)
        return jsonify({"error": "Server error while fetching programme patients"}), 500


# ---------------------------------------------------------------------------
# Legacy ANC route (kept for backward compat)
# ---------------------------------------------------------------------------
@programmes_bp.route("/programmes/anc", methods=["GET"])
@require_auth
def get_anc_patients(current_user):
    try:
        patients = Patient.query.filter_by(asha_worker_id=current_user.id).filter(
            db.or_(
                Patient.is_pregnant == True,            # noqa: E712
                Patient.category == "Pregnancy"
            )
        ).all()
        return jsonify([{
            "id":       p.id,
            "name":     p.name,
            "edd":      p.anc_edd.isoformat() if p.anc_edd else None,
            "highRisk": p.is_high_risk
        } for p in patients])
    except Exception as e:
        print(f"ERROR in get_anc_patients: {e}", file=sys.stderr)
        return jsonify([])


# ---------------------------------------------------------------------------
# POST /api/programmes/disease  — log a new disease case
# ---------------------------------------------------------------------------
@programmes_bp.route("/programmes/disease", methods=["POST"])
@require_auth
def log_disease_case(current_user):
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing request body"}), 400
        
        patient_id = data.get("patient_id")
        prog_type = data.get("type")
        status = data.get("status")
        logged_date_str = data.get("date")

        if not all([patient_id, prog_type, status, logged_date_str]):
            return jsonify({"error": "Missing required fields: patient_id, type, status, date"}), 400
        
        try:
            logged_date = datetime.datetime.strptime(logged_date_str, "%Y-%m-%d").date()
        except ValueError:
            return jsonify({"error": "Invalid date format, must be YYYY-MM-DD"}), 400
        
        # Verify patient exists and belongs to the authenticated ASHA worker
        patient = Patient.query.filter_by(id=patient_id, asha_worker_id=current_user.id).first()
        if not patient:
            return jsonify({"error": "Patient not found or unauthorized"}), 404

        case = ProgrammeData(
            patient_id=patient_id,
            programme_type=prog_type,
            status=status,
            remarks=data.get("remarks"),
            logged_date=logged_date
        )
        db.session.add(case)
        db.session.commit()
        return jsonify({"message": "Case logged successfully"}), 201
    except Exception as e:
        db.session.rollback()
        print(f"ERROR in log_disease_case: {e}", file=sys.stderr)
        return jsonify({"error": f"Failed to log disease case: {str(e)}"}), 500
