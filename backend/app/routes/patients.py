import sys
from flask import Blueprint, request, jsonify
from app.utils.jwt_helper import require_auth
from app.models import Patient, Visit
from app import db
from datetime import datetime

patients_bp = Blueprint("patients", __name__)


def _serialize_visit(v):
    """Consistent visit serialization — always includes local_id for client reconciliation."""
    return {
        "id":                 v.id,
        "local_id":           v.local_id,          # ← critical for offline reconciliation
        "patient_id":         v.patient_id,
        "visit_type":         v.visit_type,
        "visit_datetime":     v.visit_datetime.isoformat() if v.visit_datetime else None,
        "status":             v.status,
        "notes":              v.notes,
        "bp":                 v.bp,
        "glucose":            v.glucose,
        "severity":           v.severity,
        "details":            v.details,
        "treatment_status":   v.treatment_status,
        "prescription_data":  v.prescription_data,
        "prescription_images": v.prescription_images or [],
        "completed_at":       v.completed_at.isoformat() if v.completed_at else None,
        "created_at":         v.created_at.isoformat() if v.created_at else None,
    }


@patients_bp.route("/patients/stats", methods=["GET"])
@require_auth
def get_stats(current_user):
    total = Patient.query.filter_by(asha_worker_id=current_user.id).count()
    high_risk = Patient.query.filter_by(asha_worker_id=current_user.id, risk_level="high").count()
    return jsonify({"total": total, "high_risk": high_risk})


# ── GET + POST /api/visits ────────────────────────────────────────────────────
@patients_bp.route("/visits", methods=["GET", "POST"])
@require_auth
def manage_visits(current_user):
    if request.method == "POST":
        try:
            data = request.get_json()

            patient_id = data.get("patientId")
            if not patient_id:
                return jsonify({"error": "patientId is required"}), 400

            # Verify patient belongs to this user
            patient = Patient.query.filter_by(
                id=patient_id, asha_worker_id=current_user.id
            ).first()
            if not patient:
                return jsonify({"error": "Patient not found or unauthorized"}), 404

            # ── Idempotency: prevent duplicate visits for the same local_id ──
            local_id = data.get("local_id")
            if local_id:
                existing = Visit.query.join(Patient).filter(
                    Visit.local_id == local_id,
                    Patient.asha_worker_id == current_user.id
                ).first()
                if existing:
                    return jsonify({
                        "status": "exists",
                        "visit":  _serialize_visit(existing),
                        "message": "Visit already exists on server"
                    }), 409

            try:
                date_str = data.get("date")
                time_str = data.get("time", "")
                if not date_str or not time_str:
                    return jsonify({"error": "date and time are required"}), 400
                time_part = time_str if len(time_str) > 5 else f"{time_str}:00"
                visit_datetime = datetime.fromisoformat(f"{date_str}T{time_part}")
                visit_datetime = visit_datetime.replace(tzinfo=None)
            except Exception as te:
                print(f"WARN: failed to parse datetime '{date_str}T{time_str}': {te}", file=sys.stderr)
                visit_datetime = datetime.utcnow()

            visit = Visit(
                local_id=local_id,
                patient_id=patient.id,
                visit_type=data.get("type", "General"),
                visit_datetime=visit_datetime,
                status="PENDING",
                notes=data.get("notes", ""),
                bp=data.get("bp"),
                glucose=data.get("glucose"),
                severity=data.get("severity"),
            )
            db.session.add(visit)
            db.session.commit()

            return jsonify({
                "status": "success",
                "visit":  _serialize_visit(visit),
            }), 201

        except Exception as e:
            db.session.rollback()
            print(f"CRITICAL API ERROR in POST /api/visits: {str(e)}", file=sys.stderr)
            return jsonify({"error": f"Failed to save visit: {str(e)}"}), 500

    else:
        # GET /api/visits?patientId=X
        try:
            patient_id = request.args.get("patientId")
            if not patient_id:
                return jsonify({"error": "patientId is required"}), 400

            patient = Patient.query.filter_by(
                id=patient_id, asha_worker_id=current_user.id
            ).first()
            if not patient:
                return jsonify({"error": "Patient not found or unauthorized"}), 404

            visits = Visit.query.filter_by(patient_id=patient_id).order_by(
                Visit.visit_datetime.desc(), Visit.created_at.desc()
            ).all()

            return jsonify({"visits": [_serialize_visit(v) for v in visits]})

        except Exception as e:
            print(f"CRITICAL API ERROR in GET /api/visits: {str(e)}", file=sys.stderr)
            return jsonify({"error": f"Failed to fetch visits: {str(e)}"}), 500


# ── GET /api/visits/<id> — single visit lookup (needed by CompleteVisit fallback) ──
@patients_bp.route("/visits/<int:visit_id>", methods=["GET"])
@require_auth
def get_visit(current_user, visit_id):
    try:
        visit = db.session.get(Visit, visit_id)
        if not visit:
            return jsonify({"error": "Visit not found"}), 404

        # Ownership check via patient
        patient = Patient.query.filter_by(
            id=visit.patient_id, asha_worker_id=current_user.id
        ).first()
        if not patient:
            return jsonify({"error": "Unauthorized"}), 403

        return jsonify(_serialize_visit(visit))
    except Exception as e:
        print(f"CRITICAL API ERROR in GET /api/visits/{visit_id}: {str(e)}", file=sys.stderr)
        return jsonify({"error": str(e)}), 500


# ── PATCH /api/visits/<id>/complete ──────────────────────────────────────────
@patients_bp.route("/visits/<int:visit_id>/complete", methods=["PATCH"])
@require_auth
def complete_visit(current_user, visit_id):
    try:
        visit = db.session.get(Visit, visit_id)
        if not visit:
            return jsonify({"error": "Visit not found"}), 404

        # Verify ownership
        patient = Patient.query.filter_by(
            id=visit.patient_id, asha_worker_id=current_user.id
        ).first()
        if not patient:
            return jsonify({"error": "Unauthorized"}), 403

        if visit.status == "COMPLETED":
            # Idempotent: return success rather than 400 so client marks it synced
            return jsonify({
                "message": "Visit already completed",
                "patient_status": patient.status,
            }), 200

        data = request.get_json()
        next_checkup_date_str = data.get("next_checkup_date")

        # 1. Save clinical vitals
        visit.details = {
            "bp":          data.get("bp"),
            "sugar":       data.get("sugar"),
            "weight":      data.get("weight"),
            "height":      data.get("height"),
            "medications": data.get("medications"),
            "severity":    data.get("severity", "Mild"),
            "notes":       data.get("notes"),
        }
        visit.severity = data.get("severity", "Mild")
        visit.status = "COMPLETED"
        visit.completed_at = datetime.utcnow()

        # Resolve associated reminder
        from app.models import Reminder
        reminder = Reminder.query.filter_by(visit_id=visit.id).first()
        if reminder:
            reminder.status = "completed"

        # 2. Save prescription & treatment data
        visit.treatment_status = data.get("treatment_status")
        visit.prescription_images = data.get("prescription_images", [])
        visit.prescription_data = {
            "medicine_prescribed": data.get("medicine_prescribed", False),
            "medicines":           data.get("medicines", []),
            "prescribed_by":       data.get("prescribed_by"),
            "prescriber_name":     data.get("prescriber_name"),
            "clinic_name":         data.get("clinic_name"),
        }

        # 3. Update patient health_status
        ts = (visit.treatment_status or "").lower()
        if "emergency" in ts:
            patient.health_status = "Critical"
        elif "referred" in ts:
            patient.health_status = "Referred"
        elif "completed" in ts:
            patient.health_status = "Recovered / Safe"
        else:
            patient.health_status = "Under Treatment"

        # 4. Handle follow-up visit creation
        follow_up_visit = None
        if next_checkup_date_str:
            try:
                next_dt = datetime.strptime(next_checkup_date_str, "%Y-%m-%d").replace(
                    hour=9, minute=0, second=0
                )
                # Prevent duplicate follow-ups
                existing_followup = Visit.query.filter_by(
                    patient_id=patient.id,
                    visit_type="Follow-up",
                    status="PENDING",
                ).filter(
                    db.func.date(Visit.visit_datetime) == next_dt.date()
                ).first()

                if not existing_followup:
                    follow_up_visit = Visit(
                        patient_id=patient.id,
                        visit_type="Follow-up",
                        visit_datetime=next_dt,
                        status="PENDING",
                        severity=visit.severity,
                        notes=f"Follow-up from visit on {visit.visit_datetime.strftime('%d %b %Y') if visit.visit_datetime else 'previous visit'}",
                    )
                    db.session.add(follow_up_visit)

            except Exception as parse_err:
                print(f"WARN: could not parse next_checkup_date '{next_checkup_date_str}': {parse_err}", file=sys.stderr)

        # 5. Determine patient active/completed status
        if follow_up_visit:
            patient.status = "ACTIVE"
        else:
            pending_count = Visit.query.filter_by(
                patient_id=patient.id, status="PENDING"
            ).filter(Visit.id != visit_id).count()
            patient.status = "ACTIVE" if pending_count > 0 else "COMPLETED"

        db.session.commit()

        response = {
            "message": "Visit completed successfully",
            "patient_status": patient.status,
            "visit": _serialize_visit(visit),
        }
        if follow_up_visit:
            response["follow_up"] = {
                "id":             follow_up_visit.id,
                "local_id":       follow_up_visit.local_id,
                "visit_type":     follow_up_visit.visit_type,
                "visit_datetime": follow_up_visit.visit_datetime.isoformat(),
                "status":         follow_up_visit.status,
            }

        return jsonify(response)

    except Exception as e:
        db.session.rollback()
        print(f"CRITICAL API ERROR in complete_visit: {str(e)}", file=sys.stderr)
        return jsonify({"error": f"Failed to complete visit: {str(e)}"}), 500


# ── DELETE /api/visits/<id> ───────────────────────────────────────────────────
@patients_bp.route("/visits/<int:visit_id>", methods=["DELETE"])
@require_auth
def delete_visit(current_user, visit_id):
    """
    Delete a single visit and its associated reminder.
    Ownership is verified through the patient's asha_worker_id.
    Idempotent: returns 404 if visit is already gone.
    """
    import os
    from app.models import Reminder

    UPLOAD_FOLDER = os.path.abspath(
        os.path.join(os.path.dirname(__file__), '..', '..', 'uploads')
    )

    def _delete_file(url):
        if not url or '/api/uploads/' not in url:
            return
        fname = os.path.basename(url.split('/api/uploads/')[-1])
        path  = os.path.join(UPLOAD_FOLDER, fname)
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError as exc:
            print(f"WARN: could not delete file {path}: {exc}", file=sys.stderr)

    try:
        visit = db.session.get(Visit, visit_id)
        if not visit:
            return jsonify({"error": "Visit not found"}), 404

        # Ownership check via patient
        patient = Patient.query.filter_by(
            id=visit.patient_id, asha_worker_id=current_user.id
        ).first()
        if not patient:
            return jsonify({"error": "Unauthorized"}), 403

        # Collect prescription image URLs before deletion
        image_urls = list(visit.prescription_images or [])

        with db.session.begin_nested():
            # Delete associated reminder(s)
            Reminder.query.filter_by(visit_id=visit_id).delete(synchronize_session=False)
            # Delete the visit row
            db.session.delete(visit)

        db.session.commit()

        # Recompute patient status (pending visits remaining?)
        remaining = Visit.query.filter_by(
            patient_id=patient.id, status="PENDING"
        ).count()
        new_status = "ACTIVE" if remaining > 0 else "COMPLETED"
        if patient.status != new_status:
            patient.status = new_status
            db.session.commit()

        # Disk cleanup (non-fatal)
        for url in image_urls:
            _delete_file(url)

        print(
            f"[delete_visit] Visit id={visit_id} deleted by user {current_user.id}. "
            f"Removed {len(image_urls)} image(s). Patient {patient.id} status → {new_status}.",
            file=sys.stderr,
        )

        return jsonify({
            "status":         "deleted",
            "id":             visit_id,
            "patient_status": new_status,
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"CRITICAL API ERROR in delete_visit (id={visit_id}): {str(e)}", file=sys.stderr)
        return jsonify({"error": f"Failed to delete visit: {str(e)}"}), 500
