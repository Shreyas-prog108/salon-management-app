"""Utilities package with lazy exports to avoid app bootstrap import cycles."""

__all__ = [
    "delete_cache",
    "get_cache",
    "hash_password",
    "is_refresh_token_active",
    "is_token_revoked",
    "needs_password_rehash",
    "revoke_refresh_token",
    "revoke_token",
    "role_required",
    "set_cache",
    "store_refresh_token",
    "validate_password_complexity",
    "verify_password",
]


def __getattr__(name):
    if name == "role_required":
        from .decorators import role_required

        return role_required

    if name in {"get_cache", "set_cache", "delete_cache"}:
        from .helpers import delete_cache, get_cache, set_cache

        return {
            "get_cache": get_cache,
            "set_cache": set_cache,
            "delete_cache": delete_cache,
        }[name]

    if name in {
        "hash_password",
        "is_refresh_token_active",
        "is_token_revoked",
        "needs_password_rehash",
        "revoke_refresh_token",
        "revoke_token",
        "store_refresh_token",
        "validate_password_complexity",
        "verify_password",
    }:
        from .security import (
            hash_password,
            is_refresh_token_active,
            is_token_revoked,
            needs_password_rehash,
            revoke_refresh_token,
            revoke_token,
            store_refresh_token,
            validate_password_complexity,
            verify_password,
        )

        return {
            "hash_password": hash_password,
            "is_refresh_token_active": is_refresh_token_active,
            "is_token_revoked": is_token_revoked,
            "needs_password_rehash": needs_password_rehash,
            "revoke_refresh_token": revoke_refresh_token,
            "revoke_token": revoke_token,
            "store_refresh_token": store_refresh_token,
            "validate_password_complexity": validate_password_complexity,
            "verify_password": verify_password,
        }[name]

    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
