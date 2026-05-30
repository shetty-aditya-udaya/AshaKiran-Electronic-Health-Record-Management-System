import os
import sys
from flask import Blueprint, jsonify
from app import db
from app.models import Patient, Visit, Report, Reminder, ProgrammeData, SyncLog
from app.utils.jwt_helper import require_auth

delete_patient_bp = Blueprint("delete_patient", __name__)

# ── Resolve the uploads folder (same logic as reports.py) ─────────────────────
UPLOAD_FOLDER = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'uploads')
)


def _delete_uploaded_file(filename: str):
    """Silently delete a file from the uploads directory."""
    if not filename:
        return
    # Reject paths that try to escape the uploads folder
    safe_name = os.path.basename(filename)
    full_path = os.path.join(UPLOAD_FOLDER, safe_name)
    try:
        if os.path.isfile(full_path):
            os.remove(full_path)
    except OSError as exc:
        print(f"WARN: Could not delete file {full_path}: {exc}", file=sys.stderr)


@delete_patient_bp.route("/patients/<int:patient_id>", methods=["DELETE"])
@require_auth
def delete_patient(current_user, patient_id):
    """
    Permanently delete a patient and ALL associated records in a single transaction.

    Deletion order (respects FK constraints):
      1. Collect uploaded image filenames for disk cleanup BEFORE DB rows vanish
      2. Delete Reminders   (FK -> visits, reports, patients)
      3. Delete Reports     (FK -> patients) -- images on disk also removed
      4. Delete Visits      (FK -> patients)
      5. Delete ProgrammeData (FK -> patients)
      6. Delete Patient

    Ownership check: only the ASHA worker who created the patient may delete it.
    Idempotent: a 404 is returned for missing / already-deleted patients.
    """
    try:
        # ── 1. Ownership + existence check ────────────────────────────────────
        patient = Patient.query.filter_by(
            id=patient_id,
            asha_worker_id=current_user.id
        ).first()

        if not patient:
            return jsonify({"error": "Patient not found or unauthorized"}), 404

        patient_name = patient.name  # capture before deletion

        # ── 2. Collect all uploaded image URLs before rows are gone ────────────
        image_filenames = []

        for report in patient.reports:
            for img_url in (report.images or []):
                image_filenames.append(img_url)

        for visit in patient.visits:
            for img_url in (visit.prescription_images or []):
                image_filenames.append(img_url)

        # ── 3. Transactional database deletion (all-or-nothing) ───────────────
        with db.session.begin_nested():

            # 3a. Reminders (FK -> visits, reports, patients)
            Reminder.query.filter_by(patient_id=patient_id).delete(
                synchronize_session=False
            )

            # 3b. Reports
            Report.query.filter_by(patient_id=patient_id).delete(
                synchronize_session=False
            )

            # 3c. Visits
            Visit.query.filter_by(patient_id=patient_id).delete(
                synchronize_session=False
            )

            # 3d. Programme data
            ProgrammeData.query.filter_by(patient_id=patient_id).delete(
                synchronize_session=False
            )

            # 3e. Patient row
            db.session.delete(patient)

        db.session.commit()

        # ── 4. Disk cleanup (after successful commit -- non-fatal on error) ────
        for img_url in image_filenames:
            filename = img_url.split("/api/uploads/")[-1] if "/api/uploads/" in img_url else ""
            _delete_uploaded_file(filename)

        print(
            f"[delete_patient] Patient '{patient_name}' (id={patient_id}) "
            f"deleted by user {current_user.id}. "
            f"Removed {len(image_filenames)} uploaded file(s).",
            file=sys.stderr,
        )

        return jsonify({
            "status":  "deleted",
            "id":      patient_id,
            "message": f"Patient '{patient_name}' and all associated records have been permanently deleted.",
        }), 200

    except Exception as exc:
        db.session.rollback()
        print(
            f"CRITICAL API ERROR in delete_patient (id={patient_id}): {exc}",
            file=sys.stderr,
        )
        return jsonify({"error": f"Failed to delete patient: {str(exc)}"}), 500
