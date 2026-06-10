from flask import Blueprint, request, jsonify
from app import db
from app.models import Patient, Report, Reminder
from app.utils.jwt_helper import require_auth
from datetime import datetime, date
import os
from werkzeug.utils import secure_filename
from werkzeug.exceptions import HTTPException

reports_bp = Blueprint("reports", __name__)

# Config for uploads
UPLOAD_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'uploads'))
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_image_stream(stream):
    try:
        header = stream.read(32)
        stream.seek(0)
        # JPEG: FF D8 FF
        if header.startswith(b'\xff\xd8\xff'):
            return 'jpeg'
        # PNG: 89 50 4E 47
        if header.startswith(b'\x89PNG\r\n\x1a\n'):
            return 'png'
        # GIF: GIF87a or GIF89a
        if header.startswith(b'GIF87a') or header.startswith(b'GIF89a'):
            return 'gif'
        return None
    except Exception:
        return None

@reports_bp.route("/reports/patients", methods=["GET"])
@require_auth
def get_report_patients(current_user):
    # Only show patients belonging to the current user
    patients = Patient.query.filter_by(asha_worker_id=current_user.id).all()
    results = []
    for p in patients:
        last_report = Report.query.filter_by(patient_id=p.id).order_by(Report.created_at.desc()).first()
        results.append({
            "id": p.id,
            "local_id": p.local_id,
            "name": p.name,
            "category": p.category or ("Pregnancy" if p.is_pregnant else "General"),
            "health_status": p.health_status,
            "status": getattr(p, 'status', 'ACTIVE'),
            "last_updated": last_report.created_at.isoformat() if last_report else (p.updated_at.isoformat() if p.updated_at else None),
            "createdBy": p.asha_worker_id
        })
    return jsonify(results)

@reports_bp.route("/reports/patient/<int:patient_id>", methods=["GET"])
@require_auth
def get_patient_reports(current_user, patient_id):
    patient = Patient.query.filter_by(id=patient_id, asha_worker_id=current_user.id).first()
    if not patient:
        return jsonify({"error": "Patient not found or unauthorized"}), 404
    reports = Report.query.filter_by(patient_id=patient_id).order_by(Report.created_at.desc()).all()
    
    report_list = []
    for r in reports:
        report_list.append({
            "id": r.id,
            "local_id": r.local_id,
            "title": r.title,
            "type": r.report_type,
            "description": r.description,
            "doctor_name": r.doctor_name,
            "status": r.status,
            "images": r.images or [],
            "next_follow_up": r.next_follow_up.isoformat() if r.next_follow_up else None,
            "date": r.created_at.isoformat()
        })

    from app.models import Visit
    visits = Visit.query.filter_by(patient_id=patient_id).order_by(Visit.visit_datetime.desc(), Visit.created_at.desc()).all()
    visit_list = []
    for v in visits:
        visit_list.append({
            "id": v.id,
            "local_id": v.local_id,  # ← CRITICAL FIX: Include local_id for offline-first reconciliation
            "visit_type": v.visit_type,
            "visit_date": v.visit_datetime.isoformat() if v.visit_datetime else None,
            "status": v.status,
            "notes": v.notes,
            "details": v.details,
            "treatment_status": v.treatment_status,
            "prescription_data": v.prescription_data,
            "prescription_images": v.prescription_images or [],
            "created_at": v.created_at.isoformat() if v.created_at else None,
        })
        
    return jsonify({
        "patient_name": patient.name,
        "gender": patient.gender,
        "age": patient.age,
        "village": patient.village,
        "createdBy": patient.asha_worker_id,
        "reports": report_list,
        "visits": visit_list
    })

@reports_bp.route("/reports/add", methods=["POST"])
@require_auth
def add_report(current_user):
    try:
        data = request.get_json()
        patient_id = data.get("patient_id")
        patient = db.session.get(Patient, patient_id)
        if not patient:
            return jsonify({"error": "Patient not found"}), 404
        
        # Ownership Check
        if patient.asha_worker_id != current_user.id:
            return jsonify({"message": "Access denied. Only the assigned ASHA worker can update these records."}), 403
        
        follow_up_date = None
        if data.get("next_follow_up"):
            try:
                follow_up_date = datetime.strptime(data["next_follow_up"], '%Y-%m-%d').date()
            except:
                pass

        # ── Idempotency check ─────────────────────────────────────────────────
        # If the client supplies a local_id (UUID), check whether a Report with
        # that local_id already exists. This handles the case where the network
        # timed out AFTER the server successfully inserted the row, causing the
        # client to retry and create a duplicate report.
        client_local_id = data.get("local_id")
        if client_local_id:
            existing = Report.query.filter_by(local_id=client_local_id).first()
            if existing:
                return jsonify({
                    "message": "Report already exists (idempotency)",
                    "report_id": existing.id,
                    "local_id": existing.local_id,
                }), 409

        report = Report(
            local_id=client_local_id,
            patient_id=patient_id,
            title=data.get("title"),
            report_type=data.get("type"),
            description=data.get("description"),
            doctor_name=data.get("doctor_name"),
            status=data.get("status", "Ongoing"),
            images=data.get("images", []),
            next_follow_up=follow_up_date
        )
        db.session.add(report)
        db.session.flush()
        
        # Auto-Reminder
        if follow_up_date:
            reminder = Reminder(
                patient_id=patient_id,
                report_id=report.id,
                reminder_type=report.report_type,
                due_date=follow_up_date,
                status="pending"
            )
            db.session.add(reminder)
        
        # Always sync patient status based on report status
        report_status = data.get("status", "Ongoing").upper()
        patient.status = "COMPLETED" if report_status == "COMPLETED" else "ACTIVE"
        
        if report.report_type == "Vaccination":
            patient.health_status = "Vaccination Ongoing"
        elif report_status == "COMPLETED":
            patient.health_status = "Recovered / Safe"
        else:
            patient.health_status = "Under Treatment"
        
        db.session.commit()
        return jsonify({"message": "Report added successfully", "report_id": report.id}), 201
    except HTTPException as he:
        db.session.rollback()
        return jsonify({"error": he.description}), he.code
    except Exception as e:
        db.session.rollback()
        import sys
        print(f"CRITICAL API ERROR in add_report: {str(e)}", file=sys.stderr)
        return jsonify({"error": f"Failed to add report: {str(e)}"}), 500

@reports_bp.route("/reports/upload", methods=["POST"])
@require_auth
def upload_file(current_user):
    if 'file' not in request.files:
        return jsonify({"message": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"message": "No selected file"}), 400
    if file and allowed_file(file.filename):
        # Security: validate image signatures (magic bytes) to prevent malicious executable files from being uploaded
        if not validate_image_stream(file.stream):
            return jsonify({"message": "Invalid image content signature."}), 400
        filename = secure_filename(f"{int(datetime.now().timestamp())}_{file.filename}")
        # Ensure uploads folder exists
        if not os.path.exists(UPLOAD_FOLDER):
            os.makedirs(UPLOAD_FOLDER)
        file.save(os.path.join(UPLOAD_FOLDER, filename))
        return jsonify({"url": f"/api/uploads/{filename}"})
    return jsonify({"message": "Invalid file type"}), 400

@reports_bp.route("/reports/<int:report_id>/status", methods=["PATCH"])
@require_auth
def update_report_status(current_user, report_id):
    report = db.session.get(Report, report_id)
    if not report:
        return jsonify({"error": "Report not found"}), 404
    patient = db.session.get(Patient, report.patient_id)
    
    if not patient or patient.asha_worker_id != current_user.id:
        return jsonify({"message": "Access denied"}), 403
        
    data = request.get_json()
    new_status = data.get("status")
    if new_status:
        report.status = new_status
        
        # If Reminder exists for this report, mark it completed
        reminder = Reminder.query.filter_by(report_id=report.id, status="pending").first()
        if reminder and new_status == "Completed":
            reminder.status = "completed"
            
        # check if ALL reports for this patient are completed
        ongoing_counts = Report.query.filter_by(patient_id=patient.id, status="Ongoing").count()
        if ongoing_counts == 0:
            patient.health_status = "Recovered / Safe"
            
        latest_report = Report.query.filter_by(patient_id=patient.id).order_by(Report.created_at.desc()).first()
        if latest_report:
            patient.status = "COMPLETED" if latest_report.status.upper() == "COMPLETED" else "ACTIVE"
        else:
            patient.status = "ACTIVE"
            
        db.session.commit()
        return jsonify({"message": "Status updated", "health_status": patient.health_status})
    
    return jsonify({"message": "No status provided"}), 400

@reports_bp.route("/reminders", methods=["GET"])
@require_auth
def get_reminders(current_user):
    try:
        from app.models import Visit
        from sqlalchemy import func

        patients_subquery = Patient.query.filter_by(asha_worker_id=current_user.id).with_entities(Patient.id)

        # Support optional visitId param (used by CompleteVisit page for context)
        visit_id_filter = request.args.get("visitId")
        if visit_id_filter:
            visits = Visit.query.filter(
                Visit.patient_id.in_(patients_subquery),
                Visit.id == int(visit_id_filter)
            ).all()
        else:
            target_date_str = request.args.get("date")
            try:
                target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date() if target_date_str else date.today()
            except Exception:
                target_date = date.today()

            visits = Visit.query.filter(
                Visit.patient_id.in_(patients_subquery),
                func.date(Visit.visit_datetime) == str(target_date)
            ).all()

        results = _serialize_visits(visits)
        results.sort(key=lambda x: (0 if x["status"] == "PENDING" else 1, x["date"]))
        return jsonify(results)
    except Exception as e:
        import sys
        print(f"CRITICAL API ERROR in get_reminders: {str(e)}", file=sys.stderr)
        return jsonify({"error": str(e)}), 500


@reports_bp.route("/reminders/all", methods=["GET"])
@require_auth
def get_all_reminders(current_user):
    """Return ALL visits for this user's patients, sorted overdue-PENDING first."""
    try:
        from app.models import Visit
        patients_subquery = Patient.query.filter_by(asha_worker_id=current_user.id).with_entities(Patient.id)
        visits = Visit.query.filter(Visit.patient_id.in_(patients_subquery)).order_by(Visit.visit_datetime.asc()).all()
        results = _serialize_visits(visits)
        # Sort: overdue PENDING first, then other PENDING, then COMPLETED
        from datetime import datetime as dt_class
        now = dt_class.utcnow().isoformat()
        results.sort(key=lambda x: (
            0 if (x["status"] == "PENDING" and x["date"] < now) else
            1 if x["status"] == "PENDING" else 2,
            x["date"]
        ))
        return jsonify(results)
    except Exception as e:
        import sys
        print(f"CRITICAL API ERROR in get_all_reminders: {str(e)}", file=sys.stderr)
        return jsonify({"error": str(e)}), 500


def _serialize_visits(visits):
    if not visits:
        return []

    # Fix N+1: load all relevant patients in ONE query using `in_` filter
    patient_ids = list({v.patient_id for v in visits})
    patients_by_id = {p.id: p for p in Patient.query.filter(Patient.id.in_(patient_ids)).all()}

    results = []
    for v in visits:
        patient = patients_by_id.get(v.patient_id)
        if not patient:
            continue
        results.append({
            "id":         v.id,
            "local_id":   v.local_id,   # ← critical: included so frontend can reconcile
            "patient":    patient.name,
            "patient_id": patient.id,
            "status":     v.status,
            "severity":   v.severity,
            "date":       v.visit_datetime.isoformat() if v.visit_datetime else "",
            "time":       v.visit_datetime.strftime("%H:%M") if v.visit_datetime else "",
            "type":       v.visit_type or "General",
        })
    return results
