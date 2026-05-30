import sys
import datetime
from flask import Blueprint, request, jsonify
from app.models import db, Patient, Visit, ProgrammeData, Reminder
from app.utils.jwt_helper import require_auth

programmes_bp = Blueprint("programmes", __name__)


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
