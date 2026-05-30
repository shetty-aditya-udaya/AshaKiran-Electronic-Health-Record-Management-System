from app import db
from datetime import datetime, timezone

def utcnow():
    """Timezone-aware UTC datetime — replaces deprecated datetime.utcnow()."""
    return datetime.now(timezone.utc).replace(tzinfo=None)

class User(db.Model):
    __tablename__ = "ak_users"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default="asha")
    village = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=utcnow)
    
    patients = db.relationship("Patient", backref="asha_worker", lazy=True)

class Patient(db.Model):
    __tablename__ = "ak_patients"
    id = db.Column(db.Integer, primary_key=True)
    asha_worker_id = db.Column(db.Integer, db.ForeignKey("ak_users.id"), nullable=False)
    local_id = db.Column(db.String(36), unique=True, index=True)
    name = db.Column(db.String(100), nullable=False)
    age = db.Column(db.Integer)
    gender = db.Column(db.String(10))
    phone = db.Column(db.String(15))
    village = db.Column(db.String(100))
    
    # Programme Flags & Data
    is_pregnant = db.Column(db.Boolean, default=False)
    anc_edd = db.Column(db.Date)
    weeks_of_pregnancy = db.Column(db.Integer)
    risk_level = db.Column(db.String(20), default="low", index=True)
    risk_flags = db.Column(db.JSON)
    vaccination_status = db.Column(db.JSON)
    
    # Legacy fields
    is_high_risk = db.Column(db.Boolean, default=False)
    child_vax_status = db.Column(db.JSON) 
    ncd_status = db.Column(db.JSON) 
    
    # Status Tracking Fields
    status = db.Column(db.String(20), default="ACTIVE", index=True)
    health_status = db.Column(db.String(50), default="Under Treatment")
    category = db.Column(db.String(50), index=True)
    disease = db.Column(db.String(100))
    
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    visits = db.relationship("Visit", backref="patient", lazy=True)
    reports = db.relationship("Report", backref="patient", lazy=True)
    reminders = db.relationship("Reminder", backref="patient", lazy=True)

class Visit(db.Model):
    __tablename__ = "ak_visits"
    id = db.Column(db.Integer, primary_key=True)
    # local_id: UUID from the client. Enables round-trip reconciliation of offline visits.
    # Without this, bulkUpsertReminders can't match server visits to local UUID-keyed records.
    local_id = db.Column(db.String(36), unique=True, index=True, nullable=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("ak_patients.id"), nullable=False, index=True)
    visit_type = db.Column(db.String(50))
    visit_datetime = db.Column(db.DateTime, nullable=False, index=True)
    status = db.Column(db.String(20), default="PENDING", index=True)
    notes = db.Column(db.Text)
    bp = db.Column(db.String(20))
    glucose = db.Column(db.String(20))
    severity = db.Column(db.String(20))
    details = db.Column(db.JSON)
    treatment_status = db.Column(db.String(50))
    prescription_data = db.Column(db.JSON)
    prescription_images = db.Column(db.JSON)
    completed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow)

class Report(db.Model):
    __tablename__ = "ak_reports"
    id = db.Column(db.Integer, primary_key=True)
    # local_id: UUID from the client. Enables idempotency — if the same report is
    # POSTed twice (network timeout where server succeeded but client never got the
    # 200), the second POST returns 409 instead of inserting a duplicate row.
    local_id = db.Column(db.String(36), unique=True, index=True, nullable=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("ak_patients.id"), nullable=False, index=True)
    title = db.Column(db.String(150), nullable=False)
    report_type = db.Column(db.String(50))
    description = db.Column(db.Text)
    doctor_name = db.Column(db.String(100))
    status = db.Column(db.String(20), default="Ongoing")
    images = db.Column(db.JSON)
    next_follow_up = db.Column(db.Date)
    created_at = db.Column(db.DateTime, default=utcnow)

class ProgrammeData(db.Model):
    """Generic table for specific programme entries like Disease Tracking"""
    __tablename__ = "ak_programme_data"
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("ak_patients.id"), nullable=False)
    programme_type = db.Column(db.String(50))
    status = db.Column(db.String(50))
    remarks = db.Column(db.Text)
    logged_date = db.Column(db.Date, default=lambda: utcnow().date())
    created_at = db.Column(db.DateTime, default=utcnow)

class Reminder(db.Model):
    __tablename__ = "ak_reminders"
    id = db.Column(db.Integer, primary_key=True)
    # local_id: UUID from the client. Enables exact matching in bulkUpsertReminders,
    # eliminating the fallback to id.toString() which caused duplicate "11"-keyed records.
    local_id = db.Column(db.String(36), unique=True, index=True, nullable=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("ak_patients.id"), nullable=False, index=True)
    visit_id = db.Column(db.Integer, db.ForeignKey("ak_visits.id"), nullable=True, index=True)
    report_id = db.Column(db.Integer, db.ForeignKey("ak_reports.id"), nullable=True)
    reminder_type = db.Column(db.String(50))
    due_date = db.Column(db.Date, nullable=False, index=True)
    status = db.Column(db.String(20), default="pending", index=True)
    priority = db.Column(db.String(10), default="normal")
    created_at = db.Column(db.DateTime, default=utcnow)

class SyncLog(db.Model):
    __tablename__ = "ak_sync_logs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("ak_users.id"), nullable=False)
    synced_at = db.Column(db.DateTime, default=utcnow)
    records_pushed = db.Column(db.Integer, default=0)
    conflicts = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default="success")

