import os

import requests


_FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2"


def send_sms(phone: str, message: str) -> dict:
    """Send an SMS via Fast2SMS. Returns {success, message}."""
    api_key = os.getenv("FAST2SMS_API_KEY", "")
    if not api_key:
        return {"success": False, "message": "FAST2SMS_API_KEY not configured"}

    # Strip country code if present (Fast2SMS expects 10-digit Indian numbers)
    digits = "".join(filter(str.isdigit, phone))
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if len(digits) != 10:
        return {"success": False, "message": f"Invalid phone number: {phone}"}

    try:
        response = requests.post(
            _FAST2SMS_URL,
            headers={"authorization": api_key},
            json={
                "route": "q",          # quick/transactional route
                "message": message,
                "language": "english",
                "flash": 0,
                "numbers": digits,
            },
            timeout=10,
        )
        data = response.json()
        if data.get("return") is True:
            return {"success": True, "message": f"SMS sent to {digits}"}
        return {"success": False, "message": data.get("message", [str(data)])}
    except Exception as e:
        return {"success": False, "message": f"SMS error: {e}"}
