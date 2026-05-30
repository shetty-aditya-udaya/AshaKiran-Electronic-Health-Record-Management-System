from flask import Blueprint, request, jsonify
from app import db
from app.models import Patient, SyncLog
from app.utils.jwt_helper import require_auth
from app.services.risk_engine import compute_risk
from datetime import datetime

sync_bp = Blueprint("sync", __name__)

# Module-level helper: convert empty strings / invalid values to None
def safe_int(val):
    if val is None or val == "":
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None

@sync_bp.route("/sync", methods=["POST"])
@require_auth
def sync(current_user):
    payload = request.get_json()
    records = payload.get("records", [])
    pushed, conflicts = 0, 0

    for rec in records:
        # Each record from client has its 'local_id' (UUID)
        existing = Patient.query.filter_by(
            local_id=rec["local_id"],
            asha_worker_id=current_user.id
        ).first()
        
        # Calculate risk on the server side just in case
        risk_level, risk_flags = compute_risk(rec)
        
        if existing:
            # Last-write-wins simple conflict resolution
            existing.name = rec.get("name", existing.name)
            existing.age = safe_int(rec.get("age", existing.age))
            existing.gender = rec.get("gender", existing.gender)
            existing.is_pregnant = rec.get("is_pregnant", existing.is_pregnant)
            existing.weeks_of_pregnancy = safe_int(rec.get("weeks_of_pregnancy", existing.weeks_of_pregnancy))
            existing.vaccination_status = rec.get("vaccination_status", existing.vaccination_status)
            existing.category = rec.get("category", existing.category)
            existing.disease = rec.get("disease", existing.disease)
            existing.risk_level = risk_level
            existing.risk_flags = risk_flags
            existing.updated_at = datetime.utcnow()
            conflicts += 1
        else:
            patient = Patient(
                asha_worker_id=current_user.id,
                local_id=rec["local_id"],
                name=rec["name"],
                age=safe_int(rec.get("age")),
                gender=rec.get("gender"),
                phone=rec.get("phone"),
                village=rec.get("village"),
                is_pregnant=rec.get("is_pregnant", False),
                weeks_of_pregnancy=safe_int(rec.get("weeks_of_pregnancy")),
                vaccination_status=rec.get("vaccination_status", {}),
                category=rec.get("category"),
                disease=rec.get("disease"),
                risk_level=risk_level,
                risk_flags=risk_flags
            )
            db.session.add(patient)
            pushed += 1

    log = SyncLog(
        user_id=current_user.id,
        records_pushed=pushed,
        conflicts=conflicts,
        status="success"
    )
    db.session.add(log)
    db.session.commit()
    
    return jsonify({
        "pushed": pushed,
        "conflicts": conflicts,
        "status": "success",
        "timestamp": datetime.utcnow().isoformat()
    })

@sync_bp.route("/patients", methods=["GET", "POST"])
@require_auth
def manage_patients(current_user):
    if request.method == "POST":
        try:
            data = request.get_json()
            import sys
            print(f"DEBUG: POST /api/patients received payload: {data}", file=sys.stderr)

            # ── Idempotency check ────────────────────────────────────────────────
            # If this local_id already exists on the server (e.g. synced in a
            # previous session or by the /api/sync bulk endpoint), return 409 so
            # the client marks the record as synced without creating a duplicate.
            local_id = data.get("local_id")
            if local_id:
                existing = Patient.query.filter_by(
                    local_id=local_id,
                    asha_worker_id=current_user.id
                ).first()
                if existing:
                    print(f"[patients] local_id={local_id} already exists as server id={existing.id} — returning 409", file=sys.stderr)
                    return jsonify({
                        "status": "exists",
                        "id":       existing.id,
                        "local_id": existing.local_id,
                        "message":  "Patient already exists on server"
                    }), 409

            # Calculate risk
            risk_level, risk_flags = compute_risk(data)

            patient = Patient(
                asha_worker_id=current_user.id,
                local_id=local_id,
                name=data.get("name"),
                age=safe_int(data.get("age")),
                gender=data.get("gender", "Female"),
                phone=data.get("phone"),
                village=data.get("village"),
                is_pregnant=data.get("is_pregnant", False),
                weeks_of_pregnancy=safe_int(data.get("weeks_of_pregnancy")),
                vaccination_status=data.get("vaccination_status", {}),
                category=data.get("category", "General"),
                disease=data.get("disease"),
                risk_level=risk_level,
                risk_flags=risk_flags,
                health_status=data.get("health_status", "Under Treatment"),
                status=data.get("status", "ACTIVE")
            )
            db.session.add(patient)
            db.session.commit()

            return jsonify({"status": "success", "patient": {
                "id": patient.id,
                "local_id": patient.local_id,
                "name": patient.name,
                "age": patient.age,
                "gender": patient.gender,
                "phone": patient.phone,
                "village": patient.village,
                "category": patient.category,
                "disease": patient.disease,
                "status": patient.status,
                "health_status": patient.health_status,
                "weeks_of_pregnancy": patient.weeks_of_pregnancy
            }}), 201

        except Exception as e:
            print(f"Error creating patient: {str(e)}")
            import sys
            print(f"CRITICAL API ERROR: {str(e)}", file=sys.stderr)
            db.session.rollback()
            return jsonify({"error": f"Failed to save patient: {str(e)}"}), 500

    else:
        # GET request
        try:
            patients = Patient.query.filter_by(asha_worker_id=current_user.id).all()
            results = []
            for p in patients:
                results.append({
                    "id": p.id,
                    "local_id": p.local_id,
                    "name": p.name,
                    "age": p.age,
                    "gender": p.gender,
                    "phone": p.phone,
                    "village": p.village,
                    "is_pregnant": p.is_pregnant,
                    "weeks_of_pregnancy": p.weeks_of_pregnancy,
                    "risk_level": p.risk_level,
                    "risk_flags": p.risk_flags,
                    "category": p.category,
                    "disease": p.disease,
                    "status": getattr(p, 'status', 'ACTIVE'),
                    "health_status": getattr(p, 'health_status', 'Under Treatment'),
                    "vaccination_status": p.vaccination_status,
                    "createdAt": p.created_at.isoformat() if p.created_at else None
                })
            return jsonify({"patients": results})
        except Exception as e:
            print(f"Error fetching patients: {str(e)}")
            import sys
            print(f"CRITICAL API ERROR: {str(e)}", file=sys.stderr)
            return jsonify({"error": f"Failed to fetch patients: {str(e)}"}), 500
