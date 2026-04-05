import os
import signal
import subprocess
import sys
import time


class Colors:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    RESET = "\033[0m"
    BOLD = "\033[1m"


BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_PYTHON = os.path.join(BACKEND_DIR, "venv", "bin", "python")
VENV_BIN = os.path.join(BACKEND_DIR, "venv", "bin")

# Postgres (Docker)
PG_HOST = os.getenv("PG_HOST", "127.0.0.1")
PG_PORT = int(os.getenv("PG_PORT", "5432"))
PG_USER = os.getenv("PG_USER", "salon_user")
PG_DB = os.getenv("PG_DB", "salon")

# Redis (Docker, mapped to 6380 on host)
APP_REDIS_HOST = os.getenv("APP_REDIS_HOST", "127.0.0.1")
APP_REDIS_PORT = int(os.getenv("APP_REDIS_PORT", "6380"))
APP_REDIS_URL = f"redis://{APP_REDIS_HOST}:{APP_REDIS_PORT}/0"

processes = []


def log(service, message, color=Colors.RESET):
    print(f"{color}{Colors.BOLD}[{service}]{Colors.RESET} {message}")


def get_service_env():
    env = os.environ.copy()
    env["PATH"] = VENV_BIN + ":" + env.get("PATH", "")
    env["REDIS_URL"] = APP_REDIS_URL
    env["CELERY_BROKER_URL"] = APP_REDIS_URL
    env["CELERY_RESULT_BACKEND"] = APP_REDIS_URL
    env["FLASK_DEBUG"] = "0"
    env["MAIL_DEBUG"] = "False"
    return env


def stream_process_output(service, proc, ready_markers=None, info_markers=None):
    ready_markers = tuple(m.lower() for m in (ready_markers or []))
    info_markers = tuple(m.lower() for m in (info_markers or []))

    for raw_line in proc.stdout:
        line = raw_line.strip()
        if not line:
            continue
        lowered = line.lower()
        color = Colors.RESET
        if any(m in lowered for m in ready_markers):
            color = Colors.GREEN
        elif any(m in lowered for m in info_markers):
            color = Colors.CYAN
        elif any(kw in lowered for kw in ("error", "traceback", "exception", "syntaxerror")):
            color = Colors.RED
        log(service, line, color)


def wait_for_startup(name, proc, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            log("ERROR", f"{name} exited during startup with code {proc.returncode}", Colors.RED)
            return False
        time.sleep(0.25)
    return True


# ── Docker ────────────────────────────────────────────────────────────────────

def docker_available():
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True, timeout=5,
        )
        return result.returncode == 0
    except Exception:
        return False


def ensure_docker_running():
    """Launch Docker Desktop if the daemon is not already up."""
    if docker_available():
        return True

    log("DOCKER", "Docker daemon not running — launching Docker Desktop...", Colors.YELLOW)
    try:
        subprocess.Popen(["open", "-a", "Docker"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        log("DOCKER", "Could not launch Docker Desktop automatically.", Colors.RED)
        log("DOCKER", "Please start Docker Desktop manually and retry.", Colors.RED)
        return False

    log("DOCKER", "Waiting for Docker daemon (up to 60 s)...", Colors.YELLOW)
    for _ in range(24):
        time.sleep(5)
        if docker_available():
            log("DOCKER", "Docker daemon is ready.", Colors.GREEN)
            return True

    log("DOCKER", "Docker daemon did not start in time. Exiting.", Colors.RED)
    return False


def start_docker_services():
    """Run `docker compose up -d` from the project root."""
    log("DOCKER", "Starting Docker services (postgres + redis)...", Colors.YELLOW)
    result = subprocess.run(
        ["docker", "compose", "up", "-d"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log("DOCKER", f"docker compose up failed:\n{result.stderr}", Colors.RED)
        return False
    log("DOCKER", "Docker services started.", Colors.GREEN)
    return True


# ── Postgres readiness ─────────────────────────────────────────────────────────

def check_postgres(timeout=30):
    """Poll until pg_isready reports the DB is accepting connections."""
    log("POSTGRES", f"Waiting for PostgreSQL on {PG_HOST}:{PG_PORT}...", Colors.YELLOW)
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = subprocess.run(
            ["docker", "exec", "salon_postgres",
             "pg_isready", "-U", PG_USER, "-d", PG_DB],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            log("POSTGRES", f"PostgreSQL ready on {PG_HOST}:{PG_PORT}", Colors.GREEN)
            return True
        time.sleep(2)
    log("POSTGRES", "PostgreSQL did not become ready in time.", Colors.RED)
    return False


# ── Redis readiness ────────────────────────────────────────────────────────────

def check_redis(timeout=20):
    log("REDIS", f"Waiting for Redis on {APP_REDIS_HOST}:{APP_REDIS_PORT}...", Colors.YELLOW)
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            result = subprocess.run(
                ["redis-cli", "-h", APP_REDIS_HOST, "-p", str(APP_REDIS_PORT), "ping"],
                capture_output=True, text=True, timeout=2,
            )
            if result.returncode == 0 and "PONG" in (result.stdout + result.stderr):
                log("REDIS", f"Redis ready on {APP_REDIS_HOST}:{APP_REDIS_PORT}", Colors.GREEN)
                return True
        except Exception:
            pass
        time.sleep(2)
    log("REDIS", "Redis did not become ready in time.", Colors.RED)
    return False


# ── App processes ──────────────────────────────────────────────────────────────

def start_backend():
    log("BACKEND", "Starting Flask backend...", Colors.YELLOW)
    proc = subprocess.Popen(
        [VENV_PYTHON, "app.py"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        text=True,
        cwd=BACKEND_DIR,
        env=get_service_env(),
    )
    processes.append(("Backend", proc))

    import threading
    threading.Thread(
        target=stream_process_output,
        args=("BACKEND", proc),
        kwargs={"info_markers": ["running on"], "ready_markers": []},
        daemon=True,
    ).start()
    return proc


def start_celery_worker():
    log("CELERY", "Starting Celery worker...", Colors.YELLOW)
    proc = subprocess.Popen(
        ["celery", "-A", "celery_app", "worker",
         "--loglevel=info", "--pool=solo", "-n", "salon-worker@%h"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        text=True,
        cwd=BACKEND_DIR,
        env=get_service_env(),
    )
    processes.append(("Celery Worker", proc))

    import threading
    threading.Thread(
        target=stream_process_output,
        args=("CELERY", proc),
        kwargs={
            "ready_markers": ["ready"],
            "info_markers": ["connected to", "mingle", "searching for neighbors", "celery@"],
        },
        daemon=True,
    ).start()
    return proc


def start_celery_beat():
    log("CELERY-BEAT", "Starting Celery Beat scheduler...", Colors.YELLOW)
    proc = subprocess.Popen(
        [
            "celery", "-A", "celery_app", "beat",
            "--loglevel=info", "--pidfile=",
            "--schedule", os.path.join(BACKEND_DIR, "celerybeat-schedule"),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        text=True,
        cwd=BACKEND_DIR,
        env=get_service_env(),
    )
    processes.append(("Celery Beat", proc))

    import threading
    threading.Thread(
        target=stream_process_output,
        args=("CELERY-BEAT", proc),
        kwargs={
            "ready_markers": ["scheduler: sending due task"],
            "info_markers": [
                "celery beat", "localtime ->", "configuration ->",
                ". db ->", ". scheduler ->", ". logfile ->", ". maxinterval ->",
            ],
        },
        daemon=True,
    ).start()
    return proc


# ── Cleanup ────────────────────────────────────────────────────────────────────

def cleanup(signum=None, frame=None):
    log("SHUTDOWN", "Stopping app services...", Colors.YELLOW)
    for name, proc in reversed(processes):
        try:
            proc.terminate()
            proc.wait(timeout=5)
            log("SHUTDOWN", f"{name} stopped", Colors.RED)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    log("SHUTDOWN", "Docker containers left running (postgres + redis).", Colors.CYAN)
    log("SHUTDOWN", "  Stop them with: docker compose down", Colors.CYAN)
    sys.exit(0)


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    print(f"\n{Colors.CYAN}{Colors.BOLD}" + "=" * 48)
    print("   Salon Management — Starting All Services")
    print("=" * 48 + Colors.RESET + "\n")

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # 1. Docker daemon
    if not ensure_docker_running():
        sys.exit(1)

    # 2. Docker containers (postgres + redis)
    if not start_docker_services():
        sys.exit(1)

    # 3. Wait for infra readiness
    if not check_postgres():
        sys.exit(1)
    if not check_redis():
        sys.exit(1)

    print()

    # 4. Flask backend
    backend_proc = start_backend()
    if not wait_for_startup("Backend", backend_proc, timeout=5):
        cleanup()

    # 5. Celery worker
    celery_worker = start_celery_worker()
    if not wait_for_startup("Celery Worker", celery_worker, timeout=3):
        cleanup()

    # 6. Celery beat
    celery_beat = start_celery_beat()
    if not wait_for_startup("Celery Beat", celery_beat, timeout=3):
        cleanup()

    print(f"\n{Colors.GREEN}{Colors.BOLD}All services started successfully!{Colors.RESET}\n")
    print(f"{Colors.YELLOW}Services:{Colors.RESET}")
    print(f"  - Postgres:   {PG_HOST}:{PG_PORT}  (Docker → salon_postgres)")
    print(f"  - Redis:      {APP_REDIS_HOST}:{APP_REDIS_PORT}  (Docker → salon_redis)")
    print("  - Backend:    http://localhost:5000")
    print("  - Celery:     Worker + Beat running")
    print(f"\n{Colors.RED}Press Ctrl+C to stop app services (Docker keeps running){Colors.RESET}\n")

    try:
        while True:
            time.sleep(1)
            for name, proc in processes:
                if proc.poll() is not None:
                    log("ERROR", f"{name} has stopped unexpectedly!", Colors.RED)
                    cleanup()
    except KeyboardInterrupt:
        cleanup()


if __name__ == "__main__":
    main()
