from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt_identity,
    jwt_required,
)

from app import db
from models import User


bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.route("/login", methods=["POST"])
def login():
    """Authenticate a user and return tokens."""
    data = request.get_json(silent=True) or {}
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid credentials"}), 401
    if user.is_blacklisted:
        return jsonify({"error": "Account is blacklisted"}), 403
    if not user.is_active:
        return jsonify({"error": "Account is inactive"}), 403

    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))
    return (
        jsonify(
            {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "user": user.to_dict(),
            }
        ),
        200,
    )


@bp.route("/me", methods=["GET"])
@jwt_required()
def get_current_user():
    """Return the authenticated user profile."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user.to_dict()), 200


@bp.route("/change-password", methods=["POST"])
@jwt_required()
def change_password():
    """Update the authenticated user's password."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    if not data.get("old_password") or not data.get("new_password"):
        return jsonify({"error": "Old and new password required"}), 400
    if not user.check_password(data["old_password"]):
        return jsonify({"error": "Invalid old password"}), 401

    user.set_password(data["new_password"])
    db.session.commit()
    return jsonify({"message": "Password changed successfully"}), 200


@bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """Issue a fresh access token from a refresh token."""
    current_user_id = get_jwt_identity()
    new_access_token = create_access_token(identity=current_user_id)
    return jsonify({"access_token": new_access_token}), 200
