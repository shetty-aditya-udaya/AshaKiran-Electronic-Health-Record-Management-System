from flask import Blueprint, request, jsonify
from app import db
from app.models import User
import bcrypt
import jwt
import datetime
from config import Config

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/register", methods=["POST"])
def register():
    try:
        data = request.get_json()
        # Normalize email: lowercase and strip whitespace
        email = data.get("email", "").lower().strip()
        
        if not email or not data.get("password"):
            return jsonify({"error": "Email and password are required"}), 400

        if User.query.filter_by(email=email).first():
            return jsonify({"error": "User already exists"}), 400
        
        hashed = bcrypt.hashpw(data["password"].encode(), bcrypt.gensalt()).decode()
        user = User(
            name=data.get("name", "Unknown"),
            email=email,
            password=hashed,
            role=data.get("role", "asha"),
            village=data.get("village")
        )
        db.session.add(user)
        db.session.commit()
        return jsonify({"message": "Signup successful. Please login now."}), 201
    except Exception as e:
        db.session.rollback()
        import traceback
        import sys
        print("REGISTER ERROR:", str(e), file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@auth_bp.route("/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        email = data.get("email", "").lower().strip()
        
        import sys
        print(f"DEBUG: Login attempt for email: {email}", file=sys.stderr)
        
        user = User.query.filter_by(email=email).first()
        
        if user:
            print(f"DEBUG: Found user: {user.name} (ID: {user.id})", file=sys.stderr)
        else:
            print(f"DEBUG: No user found for email: {email}", file=sys.stderr)
        
        if not user or not bcrypt.checkpw(data["password"].encode(), user.password.encode()):
            return jsonify({"error": "Invalid credentials"}), 401
        
        token = jwt.encode({
            "user_id": user.id,
            "role": user.role,
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=Config.JWT_EXPIRY_HOURS)
        }, Config.JWT_SECRET_KEY, algorithm="HS256")
        
        return jsonify({
            "token": token,
            "user": {
                "id": user.id,
                "name": user.name,
                "role": user.role,
                "village": user.village
            }
        })
    except Exception as e:
        import sys
        print(f"LOGIN ERROR: {str(e)}", file=sys.stderr)
        return jsonify({"error": "Internal server error during login"}), 500

@auth_bp.route("/refresh", methods=["POST"])
def refresh():
    try:
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing token"}), 401
        
        parts = auth_header.split(" ")
        if len(parts) < 2:
            return jsonify({"error": "Malformed token"}), 401
        token = parts[1]
        
        try:
            # Decode token, ignoring expiration so we can read the payload of the expired token
            data = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"], options={"verify_exp": False})
            
            # Security: enforce a strict refresh grace period limit (7 days / 168 hours)
            # to prevent indefinite reuse of ancient or stolen expired tokens.
            exp = data.get("exp")
            if exp:
                import time
                now_ts = time.time()
                if now_ts - exp > 7 * 24 * 3600:
                    return jsonify({"error": "Session expired. Please log in again."}), 401

            user_id = data.get("user_id")
            
            user = User.query.get(user_id)
            if not user:
                return jsonify({"error": "User no longer exists"}), 401
            
            # Issue a brand-new token with fresh expiration
            new_token = jwt.encode({
                "user_id": user.id,
                "role": user.role,
                "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=Config.JWT_EXPIRY_HOURS)
            }, Config.JWT_SECRET_KEY, algorithm="HS256")
            
            return jsonify({
                "token": new_token,
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "role": user.role,
                    "village": user.village
                }
            })
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token signature"}), 401
            
    except Exception as e:
        import sys
        print(f"REFRESH ERROR: {str(e)}", file=sys.stderr)
        return jsonify({"error": "Internal server error during refresh"}), 500
