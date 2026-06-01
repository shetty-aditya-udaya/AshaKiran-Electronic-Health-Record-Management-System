import os
from app import create_app, db

app = create_app()

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        # Seed a default user if empty
        from app.models import User
        import bcrypt
        if not User.query.filter_by(email="priya@asha.in").first():
            hashed = bcrypt.hashpw("password123".encode(), bcrypt.gensalt()).decode()
            user = User(name="Priya Devi", email="priya@asha.in", password=hashed, village="Gopalpur")
            db.session.add(user)
            db.session.commit()
    
    port = int(os.getenv("PORT", 5000))
    app.run(debug=os.getenv("FLASK_DEBUG", "false").lower() == "true", host="0.0.0.0", port=port)

