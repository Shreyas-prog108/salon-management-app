import re
import threading
import time

from flask import current_app
from werkzeug.security import check_password_hash

import bcrypt


PASSWORD_MIN_LENGTH = 10
PASSWORD_COMPLEXITY_MESSAGE = (
    "Password must be at least 10 characters and include uppercase, lowercase, "
    "number and special character."
)

_memory_lock = threading.Lock()
_memory_blocklist = {}
_memory_refresh_tokens = {}


def validate_password_complexity(password):
    if not password or len(password) < PASSWORD_MIN_LENGTH:
        return PASSWORD_COMPLEXITY_MESSAGE
    checks = [
        re.search(r"[A-Z]", password),
        re.search(r"[a-z]", password),
        re.search(r"[0-9]", password),
        re.search(r"[^A-Za-z0-9]", password),
    ]
    if not all(checks):
        return PASSWORD_COMPLEXITY_MESSAGE
    return None


def hash_password(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def is_bcrypt_hash(password_hash):
    return bool(password_hash) and password_hash.startswith("$2")


def verify_password(password_hash, password):
    if not password_hash:
        return False
    if is_bcrypt_hash(password_hash):
        try:
            return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
        except ValueError:
            return False
    return check_password_hash(password_hash, password)


def needs_password_rehash(password_hash):
    return bool(password_hash) and not is_bcrypt_hash(password_hash)


def _redis_client():
    try:
        return current_app.redis
    except RuntimeError:
        return None


def _cleanup_memory_store(store):
    now = int(time.time())
    expired = [key for key, expiry in store.items() if expiry <= now]
    for key in expired:
        store.pop(key, None)


def _store_with_ttl(key, ttl_seconds, memory_store, value="1"):
    ttl = max(int(ttl_seconds), 1)
    redis_client = _redis_client()
    if redis_client:
        try:
            redis_client.setex(key, ttl, value)
            return
        except Exception:
            pass
    with _memory_lock:
        _cleanup_memory_store(memory_store)
        memory_store[key] = int(time.time()) + ttl


def _key_exists(key, memory_store):
    redis_client = _redis_client()
    if redis_client:
        try:
            return bool(redis_client.exists(key))
        except Exception:
            pass
    with _memory_lock:
        _cleanup_memory_store(memory_store)
        return key in memory_store


def _delete_key(key, memory_store):
    redis_client = _redis_client()
    if redis_client:
        try:
            redis_client.delete(key)
            return
        except Exception:
            pass
    with _memory_lock:
        memory_store.pop(key, None)


def token_ttl_from_exp(expires_at):
    return max(int(expires_at - time.time()), 1)


def blocklist_key(jti):
    return f"auth:blocklist:{jti}"


def refresh_key(jti):
    return f"auth:refresh:{jti}"


def revoke_token(jti, expires_at):
    _store_with_ttl(blocklist_key(jti), token_ttl_from_exp(expires_at), _memory_blocklist)


def is_token_revoked(jti):
    return _key_exists(blocklist_key(jti), _memory_blocklist)


def store_refresh_token(jti, user_id, expires_at):
    _store_with_ttl(refresh_key(jti), token_ttl_from_exp(expires_at), _memory_refresh_tokens, str(user_id))


def is_refresh_token_active(jti):
    return _key_exists(refresh_key(jti), _memory_refresh_tokens)


def revoke_refresh_token(jti, expires_at):
    _delete_key(refresh_key(jti), _memory_refresh_tokens)
    revoke_token(jti, expires_at)
