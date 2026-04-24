import os
import signal
import subprocess
import sys
import time

from dotenv import load_dotenv


class Colors:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    CYAN = "\033[96m"
    RESET = "\033[0m"
    BOLD = "\033[1m"


BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(BACKEND_DIR, ".env")
COMPOSE_FILE = os.path.join(BACKEND_DIR, "docker-compose.yml")

load_dotenv(ENV_FILE)

START_CELERY = os.getenv("START_CELERY", "1") == "1"
HOST_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://"
    f"{os.getenv('POSTGRES_USER', 'salon_user')}:"
    f"{os.getenv('POSTGRES_PASSWORD', 'salon_pass')}@localhost:"
    f"{os.getenv('APP_POSTGRES_HOST_PORT', '5432')}/"
    f"{os.getenv('POSTGRES_DB', 'salon')}",
)
HOST_REDIS_URL = os.getenv(
    "REDIS_URL",
    f"redis://127.0.0.1:{os.getenv('APP_REDIS_HOST_PORT', '6380')}/{os.getenv('APP_REDIS_DB', '0')}",
)


def log(service, message, color=Colors.RESET):
    print(f"{color}{Colors.BOLD}[{service}]{Colors.RESET} {message}")


def compose_command(*args):
    return ["docker", "compose", "-f", COMPOSE_FILE, *args]


def docker_available():
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0
    except Exception:
        return False


def ensure_docker_running():
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


def compose_services():
    services = ["postgres", "redis", "backend"]
    if START_CELERY:
        services.extend(["celery_worker", "celery_beat"])
    return services


def start_services():
    services = compose_services()
    log("DOCKER", f"Starting services: {', '.join(services)}", Colors.YELLOW)
    result = subprocess.run(
        compose_command("up", "--build", "-d", *services),
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log("DOCKER", f"docker compose up failed:\n{result.stderr}", Colors.RED)
        return False
    log("DOCKER", "Docker services started.", Colors.GREEN)
    return True


def running_services():
    result = subprocess.run(
        compose_command("ps", "--services", "--status", "running"),
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return set()
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def exited_services():
    result = subprocess.run(
        compose_command("ps", "--services", "--status", "exited"),
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return set()
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def show_recent_logs(service, tail=50):
    result = subprocess.run(
        compose_command("logs", "--no-color", f"--tail={tail}", service),
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    if result.stdout:
        log(service.upper(), result.stdout.strip(), Colors.RED)
    if result.stderr:
        log(service.upper(), result.stderr.strip(), Colors.RED)


def wait_for_services(timeout=60):
    expected = set(compose_services())
    deadline = time.time() + timeout

    while time.time() < deadline:
        running = running_services()
        if expected.issubset(running):
            return True

        failed = exited_services().intersection(expected)
        if failed:
            for service in sorted(failed):
                show_recent_logs(service)
            return False

        time.sleep(2)

    log("ERROR", "Timed out waiting for Docker services to become ready.", Colors.RED)
    result = subprocess.run(
        compose_command("ps"),
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
    )
    if result.stdout:
        log("DOCKER", result.stdout.strip(), Colors.RED)
    return False


def cleanup(signum=None, frame=None):
    log("SHUTDOWN", "Stopping Docker services...", Colors.YELLOW)
    subprocess.run(
        compose_command("down"),
        cwd=BACKEND_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    sys.exit(0)


def main():
    print(f"\n{Colors.CYAN}{Colors.BOLD}" + "=" * 48)
    print("   Salon Management — Starting All Services")
    print("=" * 48 + Colors.RESET + "\n")

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    log("CONFIG", f"Database: {HOST_DATABASE_URL}", Colors.CYAN)
    log("CONFIG", f"Redis/Celery broker: {HOST_REDIS_URL}", Colors.CYAN)
    log("CONFIG", f"Celery enabled: {'yes' if START_CELERY else 'no'}", Colors.CYAN)
    log("CONFIG", "Runtime: Docker containers only", Colors.CYAN)
    print()

    if not ensure_docker_running():
        sys.exit(1)
    if not start_services():
        sys.exit(1)
    if not wait_for_services():
        sys.exit(1)

    print(f"\n{Colors.GREEN}{Colors.BOLD}All services started successfully!{Colors.RESET}\n")
    print(f"{Colors.YELLOW}Services:{Colors.RESET}")
    print("  - Backend:    http://localhost:5000")
    print("  - Postgres:   localhost:5432")
    print("  - Redis:      127.0.0.1:6380")
    if START_CELERY:
        print("  - Celery:     Worker + Beat running")
    else:
        print("  - Celery:     Disabled (set START_CELERY=1 to enable)")
    print(f"\n{Colors.RED}Press Ctrl+C to stop Docker services{Colors.RESET}\n")

    try:
        while True:
            time.sleep(1)
            failed = exited_services().intersection(compose_services())
            if failed:
                for service in sorted(failed):
                    show_recent_logs(service)
                cleanup()
    except KeyboardInterrupt:
        cleanup()


if __name__ == "__main__":
    main()
