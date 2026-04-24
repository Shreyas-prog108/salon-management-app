from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)

from app import db
from app.utils.security import (
    is_refresh_token_active,
    needs_password_rehash,
    revoke_refresh_token,
    revoke_token,
    store_refresh_token,
    validate_password_complexity,
)
from models import User


bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _normalize_email(email):
    return str(email or "").strip().lower()


def _issue_token_pair(user):
    access_token = create_access_token(identity=str(user.id))
    refresh_token = create_refresh_token(identity=str(user.id))
    refresh_payload = decode_token(refresh_token)
    store_refresh_token(refresh_payload["jti"], user.id, refresh_payload["exp"])
    return access_token, refresh_token


def _revoke_token_if_present(token, refresh=False):
    if not token:
        return
    try:
        payload = decode_token(token, allow_expired=True)
    except Exception:
        return
    if refresh:
        revoke_refresh_token(payload["jti"], payload["exp"])
    else:
        revoke_token(payload["jti"], payload["exp"])


@bp.route("/login", methods=["POST"])
def login():
    """Authenticate a user and return rotated tokens."""
    data = request.get_json(silent=True) or {}
    email = _normalize_email(data.get("email"))
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

    if needs_password_rehash(user.password_hash):
        user.set_password(password)
        db.session.commit()

    access_token, refresh_token = _issue_token_pair(user)
    return jsonify(
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": user.to_dict(),
        }
    ), 200


@bp.route("/logout", methods=["POST"])
def logout():
    """Revoke access and refresh tokens if they are present."""
    auth_header = request.headers.get("Authorization", "")
    access_token = auth_header.removeprefix("Bearer ").strip() if auth_header.startswith("Bearer ") else None
    data = request.get_json(silent=True) or {}
    refresh_token = data.get("refresh_token") or request.headers.get("X-Refresh-Token")

    _revoke_token_if_present(access_token, refresh=False)
    _revoke_token_if_present(refresh_token, refresh=True)
    return jsonify({"message": "Logged out"}), 200


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

    data = request.get_json(silent=True) or {}
    old_password = data.get("old_password")
    new_password = data.get("new_password")
    if not old_password or not new_password:
        return jsonify({"error": "Old and new password required"}), 400
    if not user.check_password(old_password):
        return jsonify({"error": "Invalid old password"}), 401

    complexity_error = validate_password_complexity(new_password)
    if complexity_error:
        return jsonify({"error": complexity_error}), 400

    user.set_password(new_password)
    db.session.commit()
    return jsonify({"message": "Password changed successfully"}), 200


@bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """Rotate the refresh token and issue a fresh token pair."""
    jwt_data = get_jwt()
    current_user_id = int(get_jwt_identity())
    current_refresh_jti = jwt_data["jti"]
    if not is_refresh_token_active(current_refresh_jti):
        return jsonify({"error": "Refresh token has been revoked"}), 401

    user = User.query.get(current_user_id)
    if not user or not user.is_active or user.is_blacklisted:
        return jsonify({"error": "User not found or inactive"}), 401

    revoke_refresh_token(current_refresh_jti, jwt_data["exp"])
    access_token, refresh_token = _issue_token_pair(user)
    return jsonify({"access_token": access_token, "refresh_token": refresh_token}), 200
