import os

from dotenv import load_dotenv

from app import create_app


load_dotenv()

app = create_app(os.getenv("FLASK_ENV", "development"))


if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug_mode, use_reloader=debug_mode)
