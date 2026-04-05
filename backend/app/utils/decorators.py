from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt_identity

from models import User


def role_required(*allowed_roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            current_user_id = int(get_jwt_identity())
            user = User.query.get(current_user_id)
            if not user:
                return jsonify({"error": "User not found"}), 404
            if user.role not in allowed_roles:
                return jsonify({"error": "Unauthorized access"}), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator
