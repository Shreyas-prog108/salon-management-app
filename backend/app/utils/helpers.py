import json

from flask import current_app


def get_cache(key):
    try:
        if current_app.redis:
            value = current_app.redis.get(key)
            if value:
                return json.loads(value)
    except Exception:
        pass
    return None


def set_cache(key, value, expire=300):
    try:
        if current_app.redis:
            current_app.redis.setex(key, expire, json.dumps(value))
    except Exception:
        pass


def delete_cache(key):
    try:
        if current_app.redis:
            current_app.redis.delete(key)
    except Exception:
        pass


def clear_cache_pattern(pattern):
    try:
        if current_app.redis:
            keys = current_app.redis.keys(pattern)
            if keys:
                current_app.redis.delete(*keys)
    except Exception:
        pass
