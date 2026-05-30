import jwt
from functools import wraps
from flask import request, jsonify
from config import Config
from app.models import User

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header:
            return jsonify({"error": "Token is missing"}), 401
        
        parts = auth_header.split(" ")
        if len(parts) < 2 or parts[0].lower() != "bearer":
            return jsonify({"error": "Token is malformed or invalid"}), 401
        
        token = parts[1]
        
        try:
            data = jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
            current_user = User.query.get(data["user_id"])
            if not current_user:
                return jsonify({"error": "User no longer exists"}), 401
        except Exception as e:
            return jsonify({"error": "Token is invalid or expired"}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated
